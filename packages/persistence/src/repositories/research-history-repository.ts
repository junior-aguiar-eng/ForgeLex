import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { ForgeLexDatabase } from '../db.js';
import { researchSearchHistory } from '../schema/schema.js';

export interface ResearchHistoryInput {
  tenantId: string;
  userId: string;
  operationId: string;
  query: string;
  court: string;
  resultCount: number;
  billingMode: 'FREE' | 'METERED';
  chargedCents: number;
  createdAt?: string;
}

export class ResearchHistoryRepository {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async record(input: ResearchHistoryInput): Promise<typeof researchSearchHistory.$inferSelect> {
    const query = input.query.trim();
    if (!query) throw new Error('RESEARCH_HISTORY_QUERY_REQUIRED');
    if (!input.tenantId || !input.userId || !input.operationId || !input.court.trim()) throw new Error('RESEARCH_HISTORY_IDENTITY_REQUIRED');
    if (!Number.isInteger(input.resultCount) || input.resultCount < 0) throw new Error('RESEARCH_HISTORY_RESULT_COUNT_INVALID');
    if (!Number.isInteger(input.chargedCents) || input.chargedCents < 0) throw new Error('RESEARCH_HISTORY_CHARGE_INVALID');
    const record = {
      id: randomUUID(), tenantId: input.tenantId, userId: input.userId, operationId: input.operationId,
      query, court: input.court.trim().toUpperCase(), resultCount: input.resultCount,
      billingMode: input.billingMode, chargedCents: input.chargedCents,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    await this.db.insert(researchSearchHistory).values(record).onConflictDoNothing({
      target: [researchSearchHistory.tenantId, researchSearchHistory.operationId],
    });
    const rows = await this.db.select().from(researchSearchHistory).where(and(
      eq(researchSearchHistory.tenantId, input.tenantId),
      eq(researchSearchHistory.operationId, input.operationId),
    )).limit(1);
    if (!rows[0]) throw new Error('RESEARCH_HISTORY_PERSISTENCE_FAILED');
    return rows[0];
  }

  public async list(tenantId: string, userId: string, limit = 20): Promise<Array<typeof researchSearchHistory.$inferSelect>> {
    const safeLimit = Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 20));
    return this.db.select().from(researchSearchHistory).where(and(
      eq(researchSearchHistory.tenantId, tenantId),
      eq(researchSearchHistory.userId, userId),
    )).orderBy(desc(researchSearchHistory.createdAt)).limit(safeLimit);
  }
}
