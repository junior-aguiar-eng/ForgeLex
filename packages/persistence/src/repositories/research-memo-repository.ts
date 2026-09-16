import { and, desc, eq } from 'drizzle-orm';
import {
  LegalResearchMemoSchema,
  ResearchMemoRecord,
  ResearchMemoRecordSchema,
  ResearchMemoStatus,
} from '@forgelex/domain';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { MatterRepository } from './matter-repository.js';

function toResearchMemo(row: typeof schema.researchMemos.$inferSelect): ResearchMemoRecord {
  let issueIds: unknown;
  let memo: unknown;
  try {
    issueIds = JSON.parse(row.issueIds);
    memo = JSON.parse(row.memoJson);
  } catch {
    throw new Error('RESEARCH_MEMO_CORRUPTED: o memorando persistido não contém JSON válido.');
  }

  return ResearchMemoRecordSchema.parse({
    id: row.id,
    tenantId: row.tenantId,
    matterId: row.matterId,
    query: row.query,
    issueIds,
    workflowId: row.workflowId,
    workflowVersion: row.workflowVersion,
    memo: LegalResearchMemoSchema.parse(memo),
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt ?? undefined,
    reviewReason: row.reviewReason ?? undefined,
  });
}

export class ResearchMemoRepository {
  private readonly matterRepository: MatterRepository;

  public constructor(private readonly db: ForgeLexDatabase) {
    this.matterRepository = new MatterRepository(db);
  }

  public async createMemo(input: {
    tenantId: string;
    matterId: string;
    query: string;
    issueIds: readonly string[];
    memo: ResearchMemoRecord['memo'];
    workflowVersion: string;
    idempotencyKey: string;
    createdBy: string;
  }): Promise<ResearchMemoRecord> {
    if (!(await this.matterRepository.getMatter(input.tenantId, input.matterId))) {
      throw new Error('MATTER_NOT_FOUND: matter não pertence ao tenant informado ou não existe.');
    }

    const now = new Date().toISOString();
    const record = ResearchMemoRecordSchema.parse({
      id: input.memo.id,
      tenantId: input.tenantId,
      matterId: input.matterId,
      query: input.query,
      issueIds: [...input.issueIds],
      workflowId: 'legal-research-memo',
      workflowVersion: input.workflowVersion,
      memo: input.memo,
      status: 'PENDING_HUMAN_REVIEW',
      idempotencyKey: input.idempotencyKey,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await this.db.insert(schema.researchMemos).values({
      id: record.id,
      tenantId: record.tenantId,
      matterId: record.matterId,
      query: record.query,
      issueIds: JSON.stringify(record.issueIds),
      workflowId: record.workflowId,
      workflowVersion: record.workflowVersion,
      memoJson: JSON.stringify(record.memo),
      status: record.status,
      idempotencyKey: record.idempotencyKey,
      createdBy: record.createdBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
    });
    return record;
  }

  public async listMemos(tenantId: string, matterId: string): Promise<ResearchMemoRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.researchMemos)
      .where(and(eq(schema.researchMemos.tenantId, tenantId), eq(schema.researchMemos.matterId, matterId)))
      .orderBy(desc(schema.researchMemos.updatedAt));
    return rows.map(toResearchMemo);
  }

  public async getMemo(tenantId: string, matterId: string, memoId: string): Promise<ResearchMemoRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.researchMemos)
      .where(and(
        eq(schema.researchMemos.id, memoId),
        eq(schema.researchMemos.tenantId, tenantId),
        eq(schema.researchMemos.matterId, matterId),
      ))
      .limit(1);
    return rows[0] ? toResearchMemo(rows[0]) : undefined;
  }

  public async getByIdempotencyKey(tenantId: string, matterId: string, idempotencyKey: string): Promise<ResearchMemoRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.researchMemos)
      .where(and(
        eq(schema.researchMemos.tenantId, tenantId),
        eq(schema.researchMemos.matterId, matterId),
        eq(schema.researchMemos.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    return rows[0] ? toResearchMemo(rows[0]) : undefined;
  }

  public async reviewMemo(input: {
    tenantId: string;
    matterId: string;
    memoId: string;
    decision: Exclude<ResearchMemoStatus, 'PENDING_HUMAN_REVIEW'>;
    reviewedBy: string;
    reason?: string;
  }): Promise<ResearchMemoRecord> {
    const existing = await this.getMemo(input.tenantId, input.matterId, input.memoId);
    if (!existing) throw new Error('RESEARCH_MEMO_NOT_FOUND: memorando não localizado no matter do tenant autenticado.');
    if (existing.status !== 'PENDING_HUMAN_REVIEW') {
      throw new Error('RESEARCH_MEMO_ALREADY_REVIEWED: o memorando já possui uma decisão humana.');
    }

    const reviewedAt = new Date().toISOString();
    const reviewedMemo = LegalResearchMemoSchema.parse({
      ...existing.memo,
      verifiedByHuman: input.decision === 'APPROVED',
    });
    await this.db
      .update(schema.researchMemos)
      .set({
        status: input.decision,
        memoJson: JSON.stringify(reviewedMemo),
        reviewedBy: input.reviewedBy,
        reviewedAt,
        reviewReason: input.reason ?? null,
        updatedAt: reviewedAt,
      })
      .where(and(
        eq(schema.researchMemos.id, input.memoId),
        eq(schema.researchMemos.tenantId, input.tenantId),
        eq(schema.researchMemos.matterId, input.matterId),
        eq(schema.researchMemos.status, 'PENDING_HUMAN_REVIEW'),
      ));

    const reviewed = await this.getMemo(input.tenantId, input.matterId, input.memoId);
    if (!reviewed) throw new Error('RESEARCH_MEMO_PERSISTENCE_FAILED: decisão não pôde ser recuperada.');
    return reviewed;
  }
}
