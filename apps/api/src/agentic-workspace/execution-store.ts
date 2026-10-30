import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { AgenticOwnerSchema, type AgenticOwner } from '@forgelex/domain';
import {
  AgenticWorkspaceRepository,
  lockAgenticTenant,
  agenticCommandOwners,
  agenticCommands,
  agenticExecutionJobs,
  agenticExecutionCalls,
  type ForgeLexDatabase,
} from '@forgelex/persistence';

export const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export interface ExecutionJob extends AgenticOwner {
  executionId: string;
  objective: string;
  actionId?: string;
  predecessorId?: string;
  successorId?: string;
  state: 'READY' | 'LEASED' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'RECONCILIATION';
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  workerId: string | null;
  pendingCallId: string | null;
  budgetReleasePending: boolean;
  budgetReleaseNextAt?: string | null;
  createdAt: string;
}
export interface WorkerLease {
  executionId: string;
  owner: AgenticOwner;
  token: string;
}
export class ExecutionStore {
  readonly workspace: AgenticWorkspaceRepository;
  constructor(readonly db: ForgeLexDatabase) {
    this.workspace = new AgenticWorkspaceRepository(db);
  }
  async atomic<T>(owner: AgenticOwner, run: (store: ExecutionStore) => Promise<T>): Promise<T> {
    AgenticOwnerSchema.parse(owner);
    return this.db.transaction(async (tx) => {
      const store = new ExecutionStore(tx as unknown as ForgeLexDatabase),
        id = digest({ tenantId: owner.tenantId, userId: owner.userId });
      await lockAgenticTenant(store.db, owner.tenantId);
      await store.db
        .insert(agenticCommandOwners)
        .values({ id, ...owner, version: 0 })
        .onConflictDoNothing();
      await store.db
        .update(agenticCommandOwners)
        .set({ version: sql`${agenticCommandOwners.version} + 1` })
        .where(eq(agenticCommandOwners.id, id));
      return run(store);
    });
  }
  async command(owner: AgenticOwner, key: string) {
    return (
      await this.db
        .select()
        .from(agenticCommands)
        .where(
          and(
            eq(agenticCommands.tenantId, owner.tenantId),
            eq(agenticCommands.userId, owner.userId),
            eq(agenticCommands.idempotencyKey, key),
          ),
        )
        .limit(1)
    )[0];
  }
  async saveCommand(owner: AgenticOwner, key: string, inputHash: string, executionId: string, createdAt: string) {
    await this.db
      .insert(agenticCommands)
      .values({ id: randomUUID(), ...owner, idempotencyKey: key, inputHash, executionId, createdAt });
  }
  async getJob(owner: AgenticOwner, id: string): Promise<ExecutionJob> {
    const [row] = await this.db
      .select()
      .from(agenticExecutionJobs)
      .where(
        and(
          eq(agenticExecutionJobs.executionId, id),
          eq(agenticExecutionJobs.tenantId, owner.tenantId),
          eq(agenticExecutionJobs.userId, owner.userId),
        ),
      )
      .limit(1);
    if (!row) throw new Error('EXECUTION_NOT_FOUND');
    return JSON.parse(row.payloadJson);
  }
  async createJob(job: ExecutionJob) {
    await this.db.insert(agenticExecutionJobs).values({
      executionId: job.executionId,
      tenantId: job.tenantId,
      userId: job.userId,
      state: job.state,
      leaseExpiresAt: job.leaseExpiresAt,
      budgetReleasePending: job.budgetReleasePending ? 1 : 0,
      budgetReleaseNextAt: job.budgetReleaseNextAt ?? null,
      payloadJson: JSON.stringify(job),
      createdAt: job.createdAt,
    });
  }
  async saveJob(job: ExecutionJob) {
    await this.db
      .update(agenticExecutionJobs)
      .set({
        state: job.state,
        leaseExpiresAt: job.leaseExpiresAt,
        budgetReleasePending: job.budgetReleasePending ? 1 : 0,
        budgetReleaseNextAt: job.budgetReleaseNextAt ?? null,
        payloadJson: JSON.stringify(job),
      })
      .where(eq(agenticExecutionJobs.executionId, job.executionId));
  }
  private async managedJobs(
    page: (offset: number) => Promise<{ payloadJson: string }[]>,
    accepts?: (job: ExecutionJob) => Promise<boolean>,
  ): Promise<ExecutionJob[]> {
    const selected: ExecutionJob[] = [];
    for (let offset = 0; ; offset += 50) {
      const rows = await page(offset);
      for (const row of rows) {
        const job = JSON.parse(row.payloadJson) as ExecutionJob;
        if (!accepts || (await accepts(job))) selected.push(job);
        if (selected.length === 50) return selected;
      }
      if (!accepts || rows.length < 50) return selected;
    }
  }
  async pendingReleases(now: string, accepts?: (job: ExecutionJob) => Promise<boolean>): Promise<ExecutionJob[]> {
    return this.managedJobs(
      async (offset) =>
        this.db
          .select()
          .from(agenticExecutionJobs)
          .where(
            and(
              eq(agenticExecutionJobs.budgetReleasePending, 1),
              or(isNull(agenticExecutionJobs.budgetReleaseNextAt), lte(agenticExecutionJobs.budgetReleaseNextAt, now)),
            ),
          )
          .orderBy(asc(agenticExecutionJobs.createdAt), asc(agenticExecutionJobs.executionId))
          .limit(50)
          .offset(offset),
      accepts,
    );
  }
  async candidates(now: string, accepts?: (job: ExecutionJob) => Promise<boolean>): Promise<ExecutionJob[]> {
    return this.managedJobs(
      async (offset) =>
        this.db
          .select()
          .from(agenticExecutionJobs)
          .where(
            or(
              eq(agenticExecutionJobs.state, 'READY'),
              and(eq(agenticExecutionJobs.state, 'LEASED'), lte(agenticExecutionJobs.leaseExpiresAt, now)),
            ),
          )
          .orderBy(asc(agenticExecutionJobs.createdAt), asc(agenticExecutionJobs.executionId))
          .limit(50)
          .offset(offset),
      accepts,
    );
  }
  async call(id: string, callId: string) {
    return (
      await this.db
        .select()
        .from(agenticExecutionCalls)
        .where(and(eq(agenticExecutionCalls.executionId, id), eq(agenticExecutionCalls.callId, callId)))
        .limit(1)
    )[0];
  }
  async dispatch(job: ExecutionJob, callId: string, at: string) {
    if (await this.call(job.executionId, callId)) throw new Error('CALL_ALREADY_DISPATCHED');
    await this.db.insert(agenticExecutionCalls).values({
      id: randomUUID(),
      executionId: job.executionId,
      callId,
      state: 'DISPATCHED',
      payloadJson: JSON.stringify({ dispatchedAt: at, leaseToken: job.leaseToken }),
    });
  }
  async confirm(id: string, callId: string, resultHash: string, at: string) {
    await this.db
      .update(agenticExecutionCalls)
      .set({ state: 'CONFIRMED', payloadJson: JSON.stringify({ resultHash, confirmedAt: at }) })
      .where(and(eq(agenticExecutionCalls.executionId, id), eq(agenticExecutionCalls.callId, callId)));
  }
  async reconcile(id: string, callId: string) {
    await this.db
      .update(agenticExecutionCalls)
      .set({ state: 'RECONCILIATION' })
      .where(and(eq(agenticExecutionCalls.executionId, id), eq(agenticExecutionCalls.callId, callId)));
  }
}
