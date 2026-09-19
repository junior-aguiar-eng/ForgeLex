import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
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

function termsFor(document: JurisprudenceDocument): Array<{ term: string; field: string }> {
  const fields: Array<[string, string | undefined]> = [
    ['process_number', document.processNumber],
    ['process_class', document.processClass],
    ['rapporteur', document.rapporteur],
    ['chamber', document.chamber],
    ['syllabus', document.syllabus],
    ['full_text', document.fullText],
  ];
  const terms = new Map<string, { term: string; field: string }>();
  for (const [field, value] of fields) {
    if (!value) continue;
    for (const term of normalizeTerm(value).split(/\s+/).filter((item) => item.length >= 2)) {
      terms.set(`${field}:${term}`, { field, term });
    }
  }
  return [...terms.values()];
}

function verificationStatus(document: JurisprudenceDocument): JurisprudenceDocumentVersion['verificationStatus'] {
  if (!document.provenance.verified) return 'UNVERIFIED';
  return document.provenance.verificationMethod === 'OFFICIAL_SOURCE_HASH'
    ? 'VERIFIED_OFFICIAL'
    : 'VERIFIED_PROVIDER';
}

function toDocument(row: typeof schema.jurisprudenceDocuments.$inferSelect): JurisprudenceDocument {
  return JurisprudenceDocumentSchema.parse({
    id: row.id,
    court: row.court,
    processNumber: row.processNumber,
    processClass: row.processClass ?? undefined,
    rapporteur: row.rapporteur,
    chamber: row.chamber ?? undefined,
    judgmentDate: row.judgmentDate,
    publicationDate: row.publicationDate,
    syllabus: row.syllabus,
    fullText: row.fullText ?? undefined,
    officialUrl: row.officialUrl ?? undefined,
    dedupeKey: row.dedupeKey,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    snapshot: {
      contentHash: row.contentHash,
      capturedAt: row.lastSeenAt,
      provider: row.providerId,
    },
    provenance: JSON.parse(row.provenanceJson) as JurisprudenceDocument['provenance'],
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
    const rows = await this.db.select().from(schema.jurisprudenceDocuments)
      .where(and(
        eq(schema.jurisprudenceDocuments.court, input.court.trim().toUpperCase()),
        eq(schema.jurisprudenceDocuments.normalizedProcessNumber, normalizeProcessNumber(input.processNumber)),
      ))
      .limit(1);
    return rows[0] ? toDocument(rows[0]) : undefined;
  }

  public async search(options: JurisprudenceSearchOptions): Promise<JurisprudenceDocument[]> {
    const terms = normalizeTerm(options.query).split(/\s+/).filter((term) => term.length >= 2);
    if (terms.length === 0) return [];

    const termRows = await this.db.select({ documentId: schema.jurisprudenceDocumentTerms.documentId })
      .from(schema.jurisprudenceDocumentTerms)
      .where(inArray(schema.jurisprudenceDocumentTerms.term, terms));
    const documentIds = [...new Set(termRows.map((row) => row.documentId))];
    if (documentIds.length === 0) return [];

    const filters = [inArray(schema.jurisprudenceDocuments.id, documentIds)];
    if (options.court) filters.push(eq(schema.jurisprudenceDocuments.court, options.court.trim().toUpperCase()));
    if (options.processNumber) {
      filters.push(eq(schema.jurisprudenceDocuments.normalizedProcessNumber, normalizeProcessNumber(options.processNumber)));
    }
    if (options.fromDate) filters.push(gte(schema.jurisprudenceDocuments.judgmentDate, options.fromDate));
    if (options.toDate) filters.push(lte(schema.jurisprudenceDocuments.judgmentDate, options.toDate));

    const rows = await this.db.select().from(schema.jurisprudenceDocuments)
      .where(and(...filters))
      .orderBy(desc(schema.jurisprudenceDocuments.judgmentDate))
      .limit(Math.max(1, Math.min(options.limit ?? 20, 100)));
    return rows.map(toDocument);
  }

  public async listVersions(documentId: string): Promise<JurisprudenceDocumentVersion[]> {
    const rows = await this.db.select().from(schema.jurisprudenceDocumentVersions)
      .where(eq(schema.jurisprudenceDocumentVersions.documentId, documentId))
      .orderBy(schema.jurisprudenceDocumentVersions.versionNumber);
    return rows.map(toVersion);
  }

  private async persistDocument(
    executor: DatabaseExecutor,
    input: UpsertJurisprudenceDocumentInput,
  ): Promise<UpsertJurisprudenceDocumentResult> {
    const document = JurisprudenceDocumentSchema.parse(input.document);
    const normalizedCourt = document.court.trim().toUpperCase();
    const now = new Date().toISOString();
    const status = verificationStatus(document);
    const provenanceJson = JSON.stringify(document.provenance);
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
      processClass: document.processClass,
      rapporteur: document.rapporteur,
      chamber: document.chamber,
      judgmentDate: document.judgmentDate,
      publicationDate: document.publicationDate,
      syllabus: document.syllabus,
      fullText: document.fullText,
      officialUrl: document.officialUrl ?? document.provenance.source.sourceUrl,
      providerId: document.provenance.source.provider,
      contentHash: document.snapshot.contentHash,
      dedupeKey: document.dedupeKey,
      currentVersionId: existing?.currentVersionId,
      firstSeenAt,
      lastSeenAt,
      verificationStatus: status,
      provenanceJson,
      ingestionRunId: input.ingestionRunId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    let version: JurisprudenceDocumentVersion;
    if (!existing) {
      const versionId = randomUUID();
      await executor.insert(schema.jurisprudenceDocuments).values({ ...documentValues, currentVersionId: versionId });
      await executor.insert(schema.jurisprudenceDocumentVersions).values(this.versionValues(document, documentId, versionId, 1, input.ingestionRunId, status, now));
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
        await executor.insert(schema.jurisprudenceDocumentVersions).values(this.versionValues(document, existing.id, versionId, versionNumber, input.ingestionRunId, status, now));
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

    await executor.delete(schema.jurisprudenceDocumentTerms).where(eq(schema.jurisprudenceDocumentTerms.documentId, documentId));
    const terms = termsFor(document);
    if (terms.length > 0) {
      await executor.insert(schema.jurisprudenceDocumentTerms).values(
        terms.map((term) => ({ id: randomUUID(), documentId, term: term.term, field: term.field })),
      );
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
      officialUrl: document.officialUrl ?? document.provenance.source.sourceUrl,
      providerId: document.provenance.source.provider,
      contentHash: document.snapshot.contentHash,
      verificationStatus: status,
      provenanceJson: JSON.stringify(document.provenance),
      ingestionRunId,
      capturedAt: document.snapshot.capturedAt,
      createdAt: now,
    };
  }
}
