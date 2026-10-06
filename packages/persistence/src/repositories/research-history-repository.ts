import { randomUUID } from 'node:crypto';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { ForgeLexDatabase } from '../db.js';
import { researchSearchHistory } from '../schema/schema.js';
import { isMatterWriteTransaction, withMatterWrite } from './matter-write-guard.js';

export interface ResearchHistoryInput {
  tenantId: string;
  userId: string;
  operationId: string;
  matterId?: string;
  query: string;
  court: string;
  judgmentYear?: number;
  resultCount: number;
  billingMode: 'FREE' | 'METERED';
  chargedCents: number;
  createdAt?: string;
}

export class ResearchHistoryRepository {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async record(input: ResearchHistoryInput): Promise<typeof researchSearchHistory.$inferSelect> {
    if (input.matterId && !isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, { tenantId: input.tenantId, matterId: input.matterId }, tx => new ResearchHistoryRepository(tx).record(input));
    const query = input.query.trim();
    if (!query) throw new Error('RESEARCH_HISTORY_QUERY_REQUIRED');
    if (!input.tenantId || !input.userId || !input.operationId || !input.court.trim()) throw new Error('RESEARCH_HISTORY_IDENTITY_REQUIRED');
    if (!Number.isInteger(input.resultCount) || input.resultCount < 0) throw new Error('RESEARCH_HISTORY_RESULT_COUNT_INVALID');
    if (!Number.isInteger(input.chargedCents) || input.chargedCents < 0) throw new Error('RESEARCH_HISTORY_CHARGE_INVALID');
    const record = {
      id: randomUUID(), tenantId: input.tenantId, userId: input.userId, operationId: input.operationId,
      matterId: input.matterId ?? null,
      query, court: input.court.trim().toUpperCase(), judgmentYear: input.judgmentYear ?? null, resultCount: input.resultCount,
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
    if (rows[0].matterId !== (input.matterId ?? null)) throw new Error('RESEARCH_HISTORY_CASE_CONFLICT');
    return rows[0];
  }

  public async list(tenantId: string, userId: string, limit = 20): Promise<Array<typeof researchSearchHistory.$inferSelect>> {
    const safeLimit = Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 20));
    return this.db.select().from(researchSearchHistory).where(and(
      eq(researchSearchHistory.tenantId, tenantId),
      eq(researchSearchHistory.userId, userId),
    )).orderBy(desc(researchSearchHistory.createdAt), desc(researchSearchHistory.id)).limit(safeLimit);
  }

  public async listGrouped(tenantId: string, userId: string, limit = 20): Promise<Array<typeof researchSearchHistory.$inferSelect & { repeatCount: number }>> {
    const h = researchSearchHistory;
    const partition = sql`${h.query}, ${h.court}, ${h.judgmentYear}`;
    const ranked = this.db.select({
      ...getTableColumns(h),
      repeatCount: sql<number>`count(*) over (partition by ${partition})`.mapWith(Number).as('repeat_count'),
      historyRank: sql<number>`row_number() over (partition by ${partition} order by ${h.createdAt} desc, ${h.id} desc)`.as('history_rank'),
    }).from(h).where(and(eq(h.tenantId, tenantId), eq(h.userId, userId))).as('ranked_history');
    const safeLimit = Math.max(1, Math.min(50, Number.isInteger(limit) ? limit : 20));
    const rows = await this.db.select().from(ranked).where(eq(ranked.historyRank, 1))
      .orderBy(desc(ranked.createdAt), desc(ranked.id)).limit(safeLimit);
    return rows.map(({ historyRank: _rank, ...item }) => item);
  }
}
