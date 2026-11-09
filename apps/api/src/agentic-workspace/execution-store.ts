import { and, asc, desc, eq, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AgenticExecutionSchema, AgenticOwnerSchema, type AgenticExecution, type AgenticOwner } from '@forgelex/domain';
import {
  AgenticWorkspaceRepository,
  agenticTenantKey,
  lockAgenticTenant,
  agenticTenantGuards,
  agenticCommandOwners,
  agenticCommands,
  agenticExecutions,
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
  /** Persisted admission lease; only authorization-gated commercial jobs use it. */
  admissionExpiresAt?: string | null;
  /** Cooperative cancel: set while a provider call is in flight; the call settles, no new one is dispatched. */
  cancelRequestedAt?: string | null;
}
export interface WorkerLease {
  executionId: string;
  owner: AgenticOwner;
  token: string;
}
export class ExecutionStore {
  readonly workspace: AgenticWorkspaceRepository;
  /**
   * O dialeto vem do banco raiz: o objeto de uma transação não o carrega (`$forgelexDialect` só existe em `db`), então
   * as lojas criadas dentro de `atomic` e `snapshot` o recebem daqui. Sem isso, SQL específico do dialeto sairia errado.
   */
  readonly dialect: 'sqlite' | 'postgres';
  constructor(
    readonly db: ForgeLexDatabase,
    dialect?: 'sqlite' | 'postgres',
  ) {
    this.dialect = dialect ?? db.$forgelexDialect ?? 'sqlite';
    this.workspace = new AgenticWorkspaceRepository(db);
  }
  async atomic<T>(owner: AgenticOwner, run: (store: ExecutionStore) => Promise<T>): Promise<T> {
    AgenticOwnerSchema.parse(owner);
    return this.db.transaction(async (tx) => {
      const store = new ExecutionStore(tx as unknown as ForgeLexDatabase, this.dialect),
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
  /**
   * Consistent read without writes or locks. On PostgreSQL it is a READ ONLY, REPEATABLE READ transaction, so every
   * statement sees one committed state and nothing is held that could stall a writer or the worker. It does not
   * take the tenant lock and does not bump the owner version, so it must never write: use `atomic` for that.
   * A tenant already closed by account erasure is still refused, as `atomic` would.
   */
  async snapshot<T>(owner: AgenticOwner, run: (store: ExecutionStore) => Promise<T>): Promise<T> {
    AgenticOwnerSchema.parse(owner);
    const body = async (tx: unknown) => {
      const store = new ExecutionStore(tx as ForgeLexDatabase, this.dialect);
      // First statement: it also fixes the snapshot.
      const [guard] = await store.db
        .select({ closed: agenticTenantGuards.closed })
        .from(agenticTenantGuards)
        .where(eq(agenticTenantGuards.tenantKey, agenticTenantKey(owner.tenantId)))
        .limit(1);
      if (guard && guard.closed !== 0) throw new Error('AGENTIC_TENANT_CLOSED');
      return run(store);
    };
    return this.dialect === 'postgres'
      ? this.db.transaction(body, { isolationLevel: 'repeatable read', accessMode: 'read only' } as never)
      : this.db.transaction(body);
  }
  /**
   * A execução vigente da conversa entre as OUTRAS (sem `excludeId`): mesma `contextRevision`, sem reavaliação pendente
   * e não cancelada, a mais recente primeiro. Antes `getExecution` lia até 1000 execuções da conversa e as filtrava em
   * memória; aqui o banco filtra e ordena e devolve no máximo uma linha. Os campos saem do `payload_json`, então não
   * há coluna nova nem migration. Empate em `createdAt`: a de menor `id`, de forma determinística.
   */
  async newestCurrentExecution(
    owner: AgenticOwner,
    conversationId: string,
    excludeId: string,
    contextRevision: number,
  ): Promise<AgenticExecution | undefined> {
    const postgres = this.dialect === 'postgres';
    // Nome do campo vem só de constantes deste método, nunca de entrada externa, por isso entra como literal.
    const field = (name: string) =>
      postgres
        ? sql`(${agenticExecutions.payloadJson}::json->>${sql.raw(`'${name}'`)})`
        : sql`json_extract(${agenticExecutions.payloadJson}, ${sql.raw(`'$.${name}'`)})`;
    const sameRevision = postgres
      ? sql`${field('contextRevision')}::int = ${contextRevision}`
      : sql`${field('contextRevision')} = ${contextRevision}`;
    const settled = postgres
      ? sql`COALESCE(${field('requiresReevaluation')}, 'false') <> 'true'`
      : sql`COALESCE(${field('requiresReevaluation')}, 0) = 0`;
    const rows = await this.db
      .select({ payloadJson: agenticExecutions.payloadJson })
      .from(agenticExecutions)
      .where(
        and(
          eq(agenticExecutions.tenantId, owner.tenantId),
          eq(agenticExecutions.userId, owner.userId),
          eq(agenticExecutions.conversationId, conversationId),
          ne(agenticExecutions.id, excludeId),
          sameRevision,
          settled,
          sql`COALESCE(${field('status')}, '') <> 'CANCELLED'`,
        ),
      )
      .orderBy(desc(field('createdAt')), asc(agenticExecutions.id))
      .limit(1);
    return rows[0] ? AgenticExecutionSchema.parse(JSON.parse(rows[0].payloadJson)) : undefined;
  }
  /**
   * Execuções anteriores da conversa que entregaram algo, só com o que o histórico mostra (`id`, `deliveryIds`,
   * `createdAt`), da mais antiga para a mais nova. O banco filtra as que têm entrega e devolve três campos, em vez de
   * `getExecution` ler e interpretar o payload de todas as execuções da conversa. Mantém o teto de 1000 de antes.
   */
  async priorDeliveries(
    owner: AgenticOwner,
    conversationId: string,
    excludeId: string,
  ): Promise<{ id: string; deliveryIds: string[]; createdAt: string }[]> {
    const postgres = this.dialect === 'postgres';
    const payload = agenticExecutions.payloadJson;
    const deliveries = postgres
      ? sql`(${payload}::json->'deliveryIds')`
      : sql`json_extract(${payload}, '$.deliveryIds')`;
    const createdAt = postgres ? sql`(${payload}::json->>'createdAt')` : sql`json_extract(${payload}, '$.createdAt')`;
    const hasDeliveries = sql`COALESCE(json_array_length(${deliveries}), 0) > 0`;
    const rows = await this.db
      .select({
        id: agenticExecutions.id,
        deliveries: sql<string>`${postgres ? sql`(${payload}::json->>'deliveryIds')` : deliveries}`,
        createdAt: sql<string>`${createdAt}`,
      })
      .from(agenticExecutions)
      .where(
        and(
          eq(agenticExecutions.tenantId, owner.tenantId),
          eq(agenticExecutions.userId, owner.userId),
          eq(agenticExecutions.conversationId, conversationId),
          ne(agenticExecutions.id, excludeId),
          hasDeliveries,
        ),
      )
      .orderBy(asc(createdAt), asc(agenticExecutions.id))
      .limit(1000);
    return rows.map((row) => ({
      id: row.id,
      deliveryIds: z.array(z.string()).max(1000).parse(JSON.parse(row.deliveries)),
      createdAt: row.createdAt,
    }));
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
      admissionExpiresAt: job.admissionExpiresAt ?? null,
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
        admissionExpiresAt: job.admissionExpiresAt ?? null,
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
