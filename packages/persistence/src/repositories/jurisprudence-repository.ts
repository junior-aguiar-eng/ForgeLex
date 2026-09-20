import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { JurisprudenceDocumentSchema, normalizeProcessNumber, type JurisprudenceDocument, type JurisprudenceSearchOptions } from '@forgelex/legal-data';
import type { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';

type DatabaseExecutor = Pick<ForgeLexDatabase, 'select' | 'insert' | 'update' | 'delete'>;

export interface JurisprudenceDocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  contentHash: string;
  capturedAt: string;
  ingestionRunId: string;
  providerId: string;
  verificationStatus: 'VERIFIED_OFFICIAL' | 'VERIFIED_PROVIDER' | 'UNVERIFIED';
  provenance: JurisprudenceDocument['provenance'];
}

export interface UpsertJurisprudenceDocumentInput {
  document: JurisprudenceDocument;
  ingestionRunId: string;
  sourceManifestId?: string;
}

export interface UpsertJurisprudenceDocumentResult {
  document: JurisprudenceDocument;
  version: JurisprudenceDocumentVersion;
  created: boolean;
  versionCreated: boolean;
}

function normalizeTerm(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function fullTextQuery(value: string): string {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const units: Array<{ value: string; phrase: boolean }> = [];
  for (const match of normalized.matchAll(/"([^"]+)"|([^\s"]+)/g)) {
    const phrase = Boolean(match[1]);
    const term = normalizeTerm(match[1] ?? match[2] ?? '');
    if (term.split(/\s+/).every((item) => item.length >= 2)) units.push({ value: term, phrase });
  }
  return units.map((unit) => unit.phrase ? `"${unit.value}"` : unit.value).join(' OR ');
}

function normalizedProjection(values: Array<string | undefined>): string {
  return normalizeTerm(values.filter((value): value is string => Boolean(value)).join(' '));
}

function searchIdentityTextFor(document: JurisprudenceDocument): string {
  return normalizedProjection([
    document.processNumber,
    document.processClass,
  ]);
}

function searchAuthorityTextFor(document: JurisprudenceDocument): string {
  return normalizedProjection([
    document.rapporteur,
    document.chamber,
  ]);
}

function searchTextFor(document: JurisprudenceDocument): string {
  return normalizedProjection([
    document.syllabus,
    document.fullText,
  ]);
}

function verificationStatus(document: JurisprudenceDocument): JurisprudenceDocumentVersion['verificationStatus'] {
  if (!document.provenance.verified) return 'UNVERIFIED';
  return document.provenance.verificationMethod === 'OFFICIAL_SOURCE_HASH'
    ? 'VERIFIED_OFFICIAL'
    : 'VERIFIED_PROVIDER';
}

function toDocument(
  row: typeof schema.jurisprudenceDocuments.$inferSelect,
  currentVersion: typeof schema.jurisprudenceDocumentVersions.$inferSelect,
): JurisprudenceDocument {
  return JurisprudenceDocumentSchema.parse({
    id: row.id,
    court: row.court,
    processNumber: row.processNumber,
    processClass: currentVersion.processClass ?? undefined,
    rapporteur: currentVersion.rapporteur,
    chamber: currentVersion.chamber ?? undefined,
    judgmentDate: currentVersion.judgmentDate,
    publicationDate: currentVersion.publicationDate,
    syllabus: currentVersion.syllabus,
    fullText: currentVersion.fullText ?? undefined,
    officialUrl: currentVersion.officialUrl ?? undefined,
    dedupeKey: row.dedupeKey,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    snapshot: {
      contentHash: currentVersion.contentHash,
      capturedAt: currentVersion.capturedAt,
      provider: currentVersion.providerId,
    },
    provenance: JSON.parse(currentVersion.provenanceJson) as JurisprudenceDocument['provenance'],
  });
}

function toVersion(row: typeof schema.jurisprudenceDocumentVersions.$inferSelect): JurisprudenceDocumentVersion {
  return {
    id: row.id,
    documentId: row.documentId,
    versionNumber: row.versionNumber,
    contentHash: row.contentHash,
    capturedAt: row.capturedAt,
    ingestionRunId: row.ingestionRunId,
    providerId: row.providerId,
    verificationStatus: row.verificationStatus as JurisprudenceDocumentVersion['verificationStatus'],
    provenance: JSON.parse(row.provenanceJson) as JurisprudenceDocument['provenance'],
  };
}

export class JurisprudenceRepository {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async upsertDocument(input: UpsertJurisprudenceDocumentInput): Promise<UpsertJurisprudenceDocumentResult> {
    return this.db.transaction((tx) => this.persistDocument(tx, input));
  }

  public async upsertDocuments(input: {
    documents: JurisprudenceDocument[];
    ingestionRunId: string;
  }): Promise<{ documentsPublished: number }> {
    const results = await this.db.transaction(async (tx) => {
      const results: UpsertJurisprudenceDocumentResult[] = [];
      for (const document of input.documents) {
        results.push(await this.persistDocument(tx, { document, ingestionRunId: input.ingestionRunId }));
      }
      return results;
    });
    return { documentsPublished: results.length };
  }

  public async getByProcessNumber(input: { court: string; processNumber: string }): Promise<JurisprudenceDocument | undefined> {
    const completedRunIds = await this.completedIngestionRunIds();
    const rows = await this.db.select({ document: schema.jurisprudenceDocuments, version: schema.jurisprudenceDocumentVersions })
      .from(schema.jurisprudenceDocuments)
      .innerJoin(
        schema.jurisprudenceDocumentVersions,
        eq(schema.jurisprudenceDocuments.currentVersionId, schema.jurisprudenceDocumentVersions.id),
      )
      .leftJoin(
        schema.jurisprudenceSourceManifests,
        eq(schema.jurisprudenceDocumentVersions.sourceManifestId, schema.jurisprudenceSourceManifests.id),
      )
      .where(and(
        eq(schema.jurisprudenceDocuments.court, input.court.trim().toUpperCase()),
        eq(schema.jurisprudenceDocuments.normalizedProcessNumber, normalizeProcessNumber(input.processNumber)),
        this.publishedVersionCondition(completedRunIds),
      ))
      .limit(1);
    return rows[0] ? toDocument(rows[0].document, rows[0].version) : undefined;
  }

  public async search(options: JurisprudenceSearchOptions): Promise<JurisprudenceDocument[]> {
    const completedRunIds = await this.completedIngestionRunIds();
    const query = fullTextQuery(options.query);
    if (!query) return [];

    const postgresVector = sql`${schema.jurisprudenceDocuments.searchVector}::tsvector`;
    const searchCondition = this.db.$forgelexDialect === 'postgres'
      ? sql`${postgresVector} @@ websearch_to_tsquery('simple', ${query})`
      : sql`"jurisprudence_documents".rowid IN (
          SELECT rowid FROM jurisprudence_documents_fts
          WHERE jurisprudence_documents_fts MATCH ${query}
        )`;
    const filters = [searchCondition];
    filters.push(this.publishedVersionCondition(completedRunIds));
    if (options.court) filters.push(eq(schema.jurisprudenceDocuments.court, options.court.trim().toUpperCase()));
    if (options.processNumber) {
      filters.push(eq(schema.jurisprudenceDocuments.normalizedProcessNumber, normalizeProcessNumber(options.processNumber)));
    }
    if (options.fromDate) filters.push(gte(schema.jurisprudenceDocumentVersions.judgmentDate, options.fromDate));
    if (options.toDate) filters.push(lte(schema.jurisprudenceDocumentVersions.judgmentDate, options.toDate));

    const postgresRank = sql<number>`ts_rank(${postgresVector}, websearch_to_tsquery('simple', ${query}))`;
    const sqliteRank = sql<number>`(
      SELECT bm25(jurisprudence_documents_fts, 10.0, 5.0, 1.0)
      FROM jurisprudence_documents_fts
      WHERE jurisprudence_documents_fts.rowid = "jurisprudence_documents".rowid
        AND jurisprudence_documents_fts MATCH ${query}
    )`;
    const rows = await this.db.select({ document: schema.jurisprudenceDocuments, version: schema.jurisprudenceDocumentVersions })
      .from(schema.jurisprudenceDocuments)
      .innerJoin(
        schema.jurisprudenceDocumentVersions,
        eq(schema.jurisprudenceDocuments.currentVersionId, schema.jurisprudenceDocumentVersions.id),
      )
      .leftJoin(
        schema.jurisprudenceSourceManifests,
        eq(schema.jurisprudenceDocumentVersions.sourceManifestId, schema.jurisprudenceSourceManifests.id),
      )
      .where(and(...filters))
      .orderBy(
        this.db.$forgelexDialect === 'postgres' ? desc(postgresRank) : asc(sqliteRank),
        desc(schema.jurisprudenceDocumentVersions.judgmentDate),
      )
      .limit(Math.max(1, Math.min(options.limit ?? 20, 100)));
    return rows.map((row) => toDocument(row.document, row.version));
  }

  private async completedIngestionRunIds(): Promise<string[]> {
    const runRows = await this.db.select({ id: schema.jurisprudenceIngestionRuns.id })
      .from(schema.jurisprudenceIngestionRuns)
      .where(eq(schema.jurisprudenceIngestionRuns.status, 'COMPLETED'));
    return runRows.map((row) => row.id);
  }

  private publishedVersionCondition(completedRunIds: string[]): SQL {
    const condition = or(
      eq(schema.jurisprudenceDocumentVersions.publicationStatus, 'LEGACY_COMPATIBILITY'),
      and(
        eq(schema.jurisprudenceDocumentVersions.publicationStatus, 'PUBLISHED'),
        eq(schema.jurisprudenceSourceManifests.status, 'COMPLETED'),
      ),
      and(
        eq(schema.jurisprudenceDocumentVersions.publicationStatus, 'PUBLISHED'),
        isNull(schema.jurisprudenceDocumentVersions.sourceManifestId),
        inArray(schema.jurisprudenceDocuments.ingestionRunId, completedRunIds),
      ),
    );
    if (!condition) throw new Error('JURISPRUDENCE_PUBLICATION_CONDITION_EMPTY');
    return condition;
  }

  public async listVersions(documentId: string): Promise<JurisprudenceDocumentVersion[]> {
    const rows = await this.db.select().from(schema.jurisprudenceDocumentVersions)
      .where(eq(schema.jurisprudenceDocumentVersions.documentId, documentId))
      .orderBy(schema.jurisprudenceDocumentVersions.versionNumber);
    return rows.map(toVersion);
  }

  public async persistDocument(
    executor: DatabaseExecutor,
    input: UpsertJurisprudenceDocumentInput,
  ): Promise<UpsertJurisprudenceDocumentResult> {
    const document = JurisprudenceDocumentSchema.parse(input.document);
    const normalizedCourt = document.court.trim().toUpperCase();
    const now = new Date().toISOString();
    const status = verificationStatus(document);
    const existingRows = await executor.select().from(schema.jurisprudenceDocuments)
      .where(eq(schema.jurisprudenceDocuments.dedupeKey, document.dedupeKey)).limit(1);
    const existing = existingRows[0];
    const firstSeenAt = existing ? (existing.firstSeenAt < document.firstSeenAt ? existing.firstSeenAt : document.firstSeenAt) : document.firstSeenAt;
    const lastSeenAt = existing ? (existing.lastSeenAt > document.lastSeenAt ? existing.lastSeenAt : document.lastSeenAt) : document.lastSeenAt;
    const documentId = existing?.id ?? document.id;
    let versionNumber = 1;
    let versionCreated = true;

    if (existing) {
      const versionRows = await executor.select().from(schema.jurisprudenceDocumentVersions)
        .where(eq(schema.jurisprudenceDocumentVersions.documentId, existing.id))
        .orderBy(desc(schema.jurisprudenceDocumentVersions.versionNumber)).limit(1);
      versionNumber = (versionRows[0]?.versionNumber ?? 0) + 1;
      versionCreated = existing.contentHash !== document.snapshot.contentHash;
    }

    const documentValues: typeof schema.jurisprudenceDocuments.$inferInsert = {
      id: documentId,
      court: normalizedCourt,
      processNumber: document.processNumber,
      normalizedProcessNumber: normalizeProcessNumber(document.processNumber),
      searchText: searchTextFor(document),
      searchIdentityText: searchIdentityTextFor(document),
      searchAuthorityText: searchAuthorityTextFor(document),
      searchVector: '',
      contentHash: document.snapshot.contentHash,
      dedupeKey: document.dedupeKey,
      currentVersionId: existing?.currentVersionId,
      firstSeenAt,
      lastSeenAt,
      ingestionRunId: input.ingestionRunId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    let version: JurisprudenceDocumentVersion;
    if (!existing) {
      const versionId = randomUUID();
      await executor.insert(schema.jurisprudenceDocuments).values({ ...documentValues, currentVersionId: versionId });
      await executor.insert(schema.jurisprudenceDocumentVersions).values(this.versionValues(document, documentId, versionId, 1, input.ingestionRunId, input.sourceManifestId, status, now));
      version = {
        id: versionId,
        documentId,
        versionNumber: 1,
        contentHash: document.snapshot.contentHash,
        capturedAt: document.snapshot.capturedAt,
        ingestionRunId: input.ingestionRunId,
        providerId: document.provenance.source.provider,
        verificationStatus: status,
        provenance: document.provenance,
      };
    } else {
      if (versionCreated) {
        const versionId = randomUUID();
        await executor.update(schema.jurisprudenceDocuments).set({ ...documentValues, currentVersionId: versionId }).where(eq(schema.jurisprudenceDocuments.id, existing.id));
        await executor.insert(schema.jurisprudenceDocumentVersions).values(this.versionValues(document, existing.id, versionId, versionNumber, input.ingestionRunId, input.sourceManifestId, status, now));
        version = {
          id: versionId,
          documentId: existing.id,
          versionNumber,
          contentHash: document.snapshot.contentHash,
          capturedAt: document.snapshot.capturedAt,
          ingestionRunId: input.ingestionRunId,
          providerId: document.provenance.source.provider,
          verificationStatus: status,
          provenance: document.provenance,
        };
      } else {
        await executor.update(schema.jurisprudenceDocuments).set(documentValues).where(eq(schema.jurisprudenceDocuments.id, existing.id));
        const currentVersionRows = await executor.select().from(schema.jurisprudenceDocumentVersions)
          .where(and(eq(schema.jurisprudenceDocumentVersions.documentId, existing.id), eq(schema.jurisprudenceDocumentVersions.versionNumber, versionNumber - 1))).limit(1);
        if (!currentVersionRows[0]) throw new Error('JURISPRUDENCE_VERSION_NOT_FOUND');
        version = toVersion(currentVersionRows[0]);
      }
    }

    return {
      document: JurisprudenceDocumentSchema.parse({ ...document, id: documentId, court: normalizedCourt, firstSeenAt, lastSeenAt }),
      version,
      created: !existing,
      versionCreated,
    };
  }

  private versionValues(
    document: JurisprudenceDocument,
    documentId: string,
    versionId: string,
    versionNumber: number,
    ingestionRunId: string,
    sourceManifestId: string | undefined,
    status: JurisprudenceDocumentVersion['verificationStatus'],
    now: string,
  ): typeof schema.jurisprudenceDocumentVersions.$inferInsert {
    return {
      id: versionId,
      documentId,
      versionNumber,
      processNumber: document.processNumber,
      processClass: document.processClass,
      rapporteur: document.rapporteur,
      chamber: document.chamber,
      judgmentDate: document.judgmentDate,
      publicationDate: document.publicationDate,
      syllabus: document.syllabus,
      fullText: document.fullText,
      officialUrl: document.officialUrl,
      providerId: document.provenance.source.provider,
      contentHash: document.snapshot.contentHash,
      verificationStatus: status,
      provenanceJson: JSON.stringify(document.provenance),
      sourceManifestId,
      publicationStatus: 'PUBLISHED',
      ingestionRunId,
      capturedAt: document.snapshot.capturedAt,
      createdAt: now,
    };
  }
}
