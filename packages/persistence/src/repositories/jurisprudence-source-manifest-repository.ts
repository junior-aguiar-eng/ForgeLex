import { randomUUID } from 'node:crypto';
import { asc, and, desc, eq, gt, like } from 'drizzle-orm';
import { JurisprudenceDocumentSchema, type JurisprudenceDocument } from '@forgelex/legal-data';
import type { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { JurisprudenceRepository } from './jurisprudence-repository.js';

export type SourceManifestStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface SourceManifest {
  id: string;
  datasetId: string;
  datasetTitle: string;
  resourceId: string;
  resourceName: string;
  resourceUrl: string;
  resourceRole: 'HISTORICAL_SNAPSHOT' | 'INCREMENTAL' | 'UNCLASSIFIED';
  extractionDate: string;
  resourceSha256: string;
  status: SourceManifestStatus;
  rawRecordCount: number;
  acceptedRecordCount: number;
  rejectedRecordCount: number;
  duplicateRecordCount: number;
  publishedRecordCount: number;
  coverageStart?: string;
  coverageEnd?: string;
  warnings: string[];
  error?: string;
  ingestionRunId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface StartSourceManifestInput {
  datasetId: string;
  datasetTitle: string;
  resourceId: string;
  resourceName: string;
  resourceUrl: string;
  resourceRole: SourceManifest['resourceRole'];
  extractionDate: string;
  resourceSha256: string;
  ingestionRunId?: string;
  warnings?: string[];
}

export interface StageSourceBatchInput {
  manifestId: string;
  records: Array<{
    recordOrdinal: number;
    sourceRecordId: string;
    dedupeKey: string;
    contentHash: string;
    document: JurisprudenceDocument;
  }>;
}

export interface CompleteSourceManifestInput {
  manifestId: string;
  rawRecordCount: number;
  acceptedRecordCount: number;
  rejectedRecordCount: number;
  duplicateRecordCount: number;
  publishedRecordCount: number;
  coverageStart?: string;
  coverageEnd?: string;
  warnings?: string[];
}

export interface PublishSourceManifestResult {
  manifestId: string;
  publishedRecordCount: number;
  versionCreatedCount: number;
}

function toManifest(row: typeof schema.jurisprudenceSourceManifests.$inferSelect): SourceManifest {
  return {
    id: row.id,
    datasetId: row.datasetId,
    datasetTitle: row.datasetTitle,
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    resourceUrl: row.resourceUrl,
    resourceRole: row.resourceRole as SourceManifest['resourceRole'],
    extractionDate: row.extractionDate,
    resourceSha256: row.resourceSha256,
    status: row.status as SourceManifestStatus,
    rawRecordCount: row.rawRecordCount,
    acceptedRecordCount: row.acceptedRecordCount,
    rejectedRecordCount: row.rejectedRecordCount,
    duplicateRecordCount: row.duplicateRecordCount,
    publishedRecordCount: row.publishedRecordCount,
    coverageStart: row.coverageStart ?? undefined,
    coverageEnd: row.coverageEnd ?? undefined,
    warnings: JSON.parse(row.warningsJson) as string[],
    error: row.error ?? undefined,
    ingestionRunId: row.ingestionRunId ?? undefined,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
  };
}

export class JurisprudenceSourceManifestRepository {
  public constructor(
    private readonly db: ForgeLexDatabase,
    private readonly jurisprudenceRepository: JurisprudenceRepository,
  ) {}

  public async start(input: StartSourceManifestInput): Promise<SourceManifest> {
    const row: typeof schema.jurisprudenceSourceManifests.$inferInsert = {
      id: randomUUID(),
      datasetId: input.datasetId,
      datasetTitle: input.datasetTitle,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      resourceUrl: input.resourceUrl,
      resourceRole: input.resourceRole,
      extractionDate: input.extractionDate,
      resourceSha256: input.resourceSha256,
      status: 'RUNNING',
      rawRecordCount: 0,
      acceptedRecordCount: 0,
      rejectedRecordCount: 0,
      duplicateRecordCount: 0,
      publishedRecordCount: 0,
      coverageStart: null,
      coverageEnd: null,
      warningsJson: JSON.stringify(input.warnings ?? []),
      error: null,
      ingestionRunId: input.ingestionRunId,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    await this.db.insert(schema.jurisprudenceSourceManifests).values(row);
    return toManifest(row as typeof schema.jurisprudenceSourceManifests.$inferSelect);
  }

  public async stageBatch(input: StageSourceBatchInput): Promise<void> {
    const manifest = await this.get(input.manifestId);
    if (!manifest || manifest.status !== 'RUNNING') throw new Error(`SOURCE_MANIFEST_NOT_STAGEABLE:${input.manifestId}`);
    if (input.records.length === 0) return;
    for (let offset = 0; offset < input.records.length; offset += 500) {
      const batch = input.records.slice(offset, offset + 500);
      await this.db.insert(schema.jurisprudenceIngestionStaging).values(batch.map((record) => ({
        id: randomUUID(),
        manifestId: input.manifestId,
        recordOrdinal: record.recordOrdinal,
        sourceRecordId: record.sourceRecordId,
        dedupeKey: record.dedupeKey,
        contentHash: record.contentHash,
        documentJson: JSON.stringify(record.document),
        createdAt: new Date().toISOString(),
      })));
    }
  }

  public async complete(input: CompleteSourceManifestInput): Promise<SourceManifest> {
    const warnings = input.warnings ?? (await this.get(input.manifestId))?.warnings ?? [];
    await this.db.transaction(async (tx) => {
      await tx.update(schema.jurisprudenceSourceManifests)
        .set({
          status: 'COMPLETED',
          rawRecordCount: input.rawRecordCount,
          acceptedRecordCount: input.acceptedRecordCount,
          rejectedRecordCount: input.rejectedRecordCount,
          duplicateRecordCount: input.duplicateRecordCount,
          publishedRecordCount: input.publishedRecordCount,
          coverageStart: input.coverageStart,
          coverageEnd: input.coverageEnd,
          warningsJson: JSON.stringify(warnings),
          completedAt: new Date().toISOString(),
        })
        .where(eq(schema.jurisprudenceSourceManifests.id, input.manifestId));
      await tx.delete(schema.jurisprudenceIngestionStaging)
        .where(eq(schema.jurisprudenceIngestionStaging.manifestId, input.manifestId));
    });
    return this.require(input.manifestId);
  }

  public async fail(input: {
    manifestId: string;
    error: string;
    rawRecordCount?: number;
    acceptedRecordCount?: number;
    rejectedRecordCount?: number;
    duplicateRecordCount?: number;
    publishedRecordCount?: number;
    coverageStart?: string;
    coverageEnd?: string;
    warnings?: string[];
  }): Promise<SourceManifest> {
    const current = await this.get(input.manifestId);
    await this.db.update(schema.jurisprudenceSourceManifests)
      .set({
        status: 'FAILED',
        error: input.error,
        rawRecordCount: input.rawRecordCount ?? current?.rawRecordCount ?? 0,
        acceptedRecordCount: input.acceptedRecordCount ?? current?.acceptedRecordCount ?? 0,
        rejectedRecordCount: input.rejectedRecordCount ?? current?.rejectedRecordCount ?? 0,
        duplicateRecordCount: input.duplicateRecordCount ?? current?.duplicateRecordCount ?? 0,
        publishedRecordCount: input.publishedRecordCount ?? current?.publishedRecordCount ?? 0,
        coverageStart: input.coverageStart ?? current?.coverageStart,
        coverageEnd: input.coverageEnd ?? current?.coverageEnd,
        warningsJson: JSON.stringify(input.warnings ?? current?.warnings ?? []),
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.jurisprudenceSourceManifests.id, input.manifestId));
    return this.require(input.manifestId);
  }

  public async get(id: string): Promise<SourceManifest | undefined> {
    const rows = await this.db.select().from(schema.jurisprudenceSourceManifests)
      .where(eq(schema.jurisprudenceSourceManifests.id, id)).limit(1);
    return rows[0] ? toManifest(rows[0]) : undefined;
  }

  public async findCompletedByResourceHash(resourceId: string, sha256: string): Promise<SourceManifest | undefined> {
    const rows = await this.db.select().from(schema.jurisprudenceSourceManifests)
      .where(and(
        eq(schema.jurisprudenceSourceManifests.resourceId, resourceId),
        eq(schema.jurisprudenceSourceManifests.resourceSha256, sha256),
        eq(schema.jurisprudenceSourceManifests.status, 'COMPLETED'),
      )).limit(1);
    return rows[0] ? toManifest(rows[0]) : undefined;
  }

  public async findTerminalOfficialSourceGap(resourceId: string): Promise<SourceManifest | undefined> {
    const rows = await this.db.select().from(schema.jurisprudenceSourceManifests)
      .where(and(
        eq(schema.jurisprudenceSourceManifests.resourceId, resourceId),
        eq(schema.jurisprudenceSourceManifests.status, 'FAILED'),
        like(schema.jurisprudenceSourceManifests.error, 'OFFICIAL_SOURCE_MALFORMED_JSON:%'),
      ))
      .orderBy(desc(schema.jurisprudenceSourceManifests.completedAt))
      .limit(1);
    return rows[0] ? toManifest(rows[0]) : undefined;
  }

  public async publishStaged(manifestId: string): Promise<PublishSourceManifestResult> {
    const manifest = await this.get(manifestId);
    if (!manifest || manifest.status !== 'RUNNING' || !manifest.ingestionRunId) {
      throw new Error(`SOURCE_MANIFEST_NOT_PUBLISHABLE:${manifestId}`);
    }
    if (manifest.publishedRecordCount > 0) {
      return { manifestId, publishedRecordCount: 0, versionCreatedCount: 0 };
    }
    return this.db.transaction(async (tx) => {
      let versionCreatedCount = 0;
      let publishedRecordCount = 0;
      let lastRecordOrdinal = -1;
      while (true) {
        const staged = await tx.select().from(schema.jurisprudenceIngestionStaging)
          .where(and(
            eq(schema.jurisprudenceIngestionStaging.manifestId, manifestId),
            gt(schema.jurisprudenceIngestionStaging.recordOrdinal, lastRecordOrdinal),
          ))
          .orderBy(asc(schema.jurisprudenceIngestionStaging.recordOrdinal))
          .limit(500);
        if (staged.length === 0) break;
        for (const row of staged) {
          const document = JurisprudenceDocumentSchema.parse(JSON.parse(row.documentJson));
          const result = await this.jurisprudenceRepository.persistDocument(tx, {
            document,
            ingestionRunId: manifest.ingestionRunId!,
            sourceManifestId: manifestId,
          });
          if (result.versionCreated) versionCreatedCount += 1;
        }
        publishedRecordCount += staged.length;
        lastRecordOrdinal = staged[staged.length - 1]!.recordOrdinal;
      }
      await tx.update(schema.jurisprudenceSourceManifests)
        .set({ publishedRecordCount })
        .where(eq(schema.jurisprudenceSourceManifests.id, manifestId));
      return { manifestId, publishedRecordCount, versionCreatedCount };
    });
  }

  private async require(id: string): Promise<SourceManifest> {
    const manifest = await this.get(id);
    if (!manifest) throw new Error(`SOURCE_MANIFEST_NOT_FOUND:${id}`);
    return manifest;
  }
}
