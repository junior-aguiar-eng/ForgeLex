import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import type { IngestionRunPort } from '@forgelex/legal-data';

export type IngestionRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface JurisprudenceIngestionRun {
  id: string;
  providerId: string;
  court: string;
  status: IngestionRunStatus;
  documentsSeen: number;
  documentsPublished: number;
  coverageStart?: string;
  coverageEnd?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

function toRun(row: typeof schema.jurisprudenceIngestionRuns.$inferSelect): JurisprudenceIngestionRun {
  return {
    id: row.id,
    providerId: row.providerId,
    court: row.court,
    status: row.status as IngestionRunStatus,
    documentsSeen: row.documentsSeen,
    documentsPublished: row.documentsPublished,
    coverageStart: row.coverageStart ?? undefined,
    coverageEnd: row.coverageEnd ?? undefined,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? undefined,
    error: row.error ?? undefined,
  };
}

export class IngestionRunRepository implements IngestionRunPort {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async start(input: { providerId: string; court: string; startedAt?: string }): Promise<JurisprudenceIngestionRun> {
    const run: typeof schema.jurisprudenceIngestionRuns.$inferInsert = {
      id: randomUUID(),
      providerId: input.providerId,
      court: input.court.trim().toUpperCase(),
      status: 'RUNNING',
      documentsSeen: 0,
      documentsPublished: 0,
      startedAt: input.startedAt ?? new Date().toISOString(),
    };
    await this.db.insert(schema.jurisprudenceIngestionRuns).values(run);
    return toRun(run as typeof schema.jurisprudenceIngestionRuns.$inferSelect);
  }

  public async complete(id: string, input: {
    documentsSeen: number;
    documentsPublished: number;
    coverageStart?: string;
    coverageEnd?: string;
  }): Promise<JurisprudenceIngestionRun> {
    const completedAt = new Date().toISOString();
    await this.db.update(schema.jurisprudenceIngestionRuns)
      .set({
        status: 'COMPLETED',
        documentsSeen: input.documentsSeen,
        documentsPublished: input.documentsPublished,
        coverageStart: input.coverageStart,
        coverageEnd: input.coverageEnd,
        completedAt,
      })
      .where(eq(schema.jurisprudenceIngestionRuns.id, id));
    return this.require(id);
  }

  public async fail(id: string, input: { error: string }): Promise<JurisprudenceIngestionRun> {
    await this.db.update(schema.jurisprudenceIngestionRuns)
      .set({
        status: 'FAILED',
        error: input.error,
        completedAt: new Date().toISOString(),
      })
      .where(eq(schema.jurisprudenceIngestionRuns.id, id));
    return this.require(id);
  }

  public async get(id: string): Promise<JurisprudenceIngestionRun | undefined> {
    const rows = await this.db.select().from(schema.jurisprudenceIngestionRuns)
      .where(eq(schema.jurisprudenceIngestionRuns.id, id)).limit(1);
    return rows[0] ? toRun(rows[0]) : undefined;
  }

  private async require(id: string): Promise<JurisprudenceIngestionRun> {
    const run = await this.get(id);
    if (!run) throw new Error(`INGESTION_RUN_NOT_FOUND:${id}`);
    return run;
  }
}
