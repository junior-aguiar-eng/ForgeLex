import { and, desc, eq, max, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  DraftReviewFindingSchema,
  DraftReviewRunSchema,
  type DraftReviewRun,
  type DraftReviewMode,
  type DraftReviewResult,
  type DraftReviewCheck,
  type DraftReviewFinding,
  type DraftVersion,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { DraftRepository } from './draft-repository.js';
import { isMatterWriteTransaction, withMatterWrite } from './matter-write-guard.js';

export interface ReviewContext {
  tenantId: string;
  matterId: string;
  userId: string;
}
function toRun(row: typeof s.draftReviewRuns.$inferSelect): DraftReviewRun {
  return DraftReviewRunSchema.parse({
    ...row,
    checks: JSON.parse(row.checksJson),
    completedAt: row.completedAt ?? undefined,
  });
}
export class DraftReviewRunRepository {
  constructor(private readonly db: ForgeLexDatabase) {}
  async start(
    context: ReviewContext,
    version: DraftVersion,
    mode: DraftReviewMode,
    contextHash: string,
  ): Promise<DraftReviewRun> {
    if (!isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, context, tx => new DraftReviewRunRepository(tx).start(context, version, mode, contextHash));
    const bundle = await new DraftRepository(this.db).getVersion(
      context.tenantId,
      context.matterId,
      version.draftId,
      version.id,
    );
    if (!bundle) throw new Error('DRAFT_VERSION_NOT_FOUND');
    if (bundle.version.contentHash !== version.contentHash) throw new Error('DRAFT_VERSION_HASH_MISMATCH');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.db.transaction(async (tx) => {
          await tx
            .update(s.draftVersions)
            .set({ contentHash: sql`${s.draftVersions.contentHash}` })
            .where(and(eq(s.draftVersions.id, version.id), eq(s.draftVersions.tenantId, context.tenantId)));
          const previous = await tx
            .select({ number: max(s.draftReviewRuns.runNumber) })
            .from(s.draftReviewRuns)
            .where(eq(s.draftReviewRuns.draftVersionId, version.id));
          const run = DraftReviewRunSchema.parse({
            id: randomUUID(),
            ...context,
            draftId: version.draftId,
            draftVersionId: version.id,
            contentHash: version.contentHash,
            contextHash,
            runNumber: (previous[0]?.number ?? 0) + 1,
            mode,
            state: 'RUNNING',
            status: 'INCOMPLETE',
            startedBy: context.userId,
            startedAt: new Date().toISOString(),
            checks: [],
            blockingCount: 0,
            warningCount: 0,
          });
          const { checks, ...values } = run;
          await tx.insert(s.draftReviewRuns).values({ ...values, checksJson: JSON.stringify(checks) });
          return run;
        });
      } catch (error) {
        const message = String(error);
        if (attempt === 2 || !/unique|SQLITE_BUSY|database is locked/i.test(message)) throw error;
      }
    }
    throw new Error('REVIEW_RUN_CONFLICT');
  }
  async finish(
    context: ReviewContext,
    runId: string,
    result: {
      state: 'COMPLETE' | 'INCOMPLETE';
      status: DraftReviewResult['status'];
      checks: DraftReviewCheck[];
      findings: Omit<DraftReviewFinding, 'id' | 'createdAt' | 'reviewRunId'>[];
    },
  ): Promise<DraftReviewResult> {
    if (!isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, context, tx => new DraftReviewRunRepository(tx).finish(context, runId, result));
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(s.draftReviewRuns)
        .where(
          and(
            eq(s.draftReviewRuns.id, runId),
            eq(s.draftReviewRuns.tenantId, context.tenantId),
            eq(s.draftReviewRuns.matterId, context.matterId),
          ),
        )
        .limit(1);
      if (!rows[0]) throw new Error('REVIEW_RUN_NOT_FOUND');
      if (rows[0].state !== 'RUNNING') throw new Error('REVIEW_RUN_TERMINAL');
      await tx
        .update(s.draftVersions)
        .set({ contentHash: sql`${s.draftVersions.contentHash}` })
        .where(eq(s.draftVersions.id, rows[0].draftVersionId));
      const now = new Date().toISOString();
      const findings = result.findings.map((f) => {
        if (
          f.tenantId !== context.tenantId ||
          f.matterId !== context.matterId ||
          f.draftId !== rows[0].draftId ||
          f.draftVersionId !== rows[0].draftVersionId
        )
          throw new Error('REVIEW_FINDING_CONTEXT_MISMATCH');
        return DraftReviewFindingSchema.parse({ ...f, id: randomUUID(), reviewRunId: runId, createdAt: now });
      });
      const run = DraftReviewRunSchema.parse({
        ...toRun(rows[0]),
        ...result,
        completedAt: now,
        blockingCount: findings.filter((f) => f.severity === 'BLOCKING').length,
        warningCount: findings.filter((f) => f.severity === 'WARNING').length,
      });
      const expected =
        run.state === 'INCOMPLETE'
          ? 'INCOMPLETE'
          : run.blockingCount > 0
            ? 'BLOCKED'
            : run.warningCount > 0
              ? 'WARNINGS'
              : 'PASSED';
      if (run.status !== expected || (run.state === 'COMPLETE' && run.checks.some((c) => c.state === 'UNAVAILABLE')))
        throw new Error('REVIEW_RESULT_INVALID');
      const updated = await tx
        .update(s.draftReviewRuns)
        .set({
          state: run.state,
          status: run.status,
          completedAt: now,
          checksJson: JSON.stringify(run.checks),
          blockingCount: run.blockingCount,
          warningCount: run.warningCount,
        })
        .where(and(eq(s.draftReviewRuns.id, runId), eq(s.draftReviewRuns.state, 'RUNNING')))
        .returning({ id: s.draftReviewRuns.id });
      if (updated.length !== 1) throw new Error('REVIEW_RUN_TERMINAL');
      if (findings.length) await tx.insert(s.draftReviewFindings).values(findings);
      return {
        draftId: run.draftId,
        draftVersionId: run.draftVersionId,
        run,
        findings,
        blockingCount: run.blockingCount,
        warningCount: run.warningCount,
        status: run.status,
      };
    });
  }
  async list(context: ReviewContext, draftId: string, versionId: string): Promise<DraftReviewRun[]> {
    const rows = await this.db
      .select()
      .from(s.draftReviewRuns)
      .where(
        and(
          eq(s.draftReviewRuns.tenantId, context.tenantId),
          eq(s.draftReviewRuns.matterId, context.matterId),
          eq(s.draftReviewRuns.draftId, draftId),
          eq(s.draftReviewRuns.draftVersionId, versionId),
        ),
      )
      .orderBy(desc(s.draftReviewRuns.runNumber));
    return rows.map(toRun);
  }
  async getLatest(
    context: ReviewContext,
    draftId: string,
    versionId: string,
    completeOnly = false,
  ): Promise<DraftReviewRun | undefined> {
    return (await this.list(context, draftId, versionId)).find(
      (run) => run.mode === 'ALL' && (!completeOnly || run.state === 'COMPLETE'),
    );
  }
}
