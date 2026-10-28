import {
  agenticConversations,
  agenticExecutions,
  agenticContexts,
  matters,
  legalDocuments,
} from '@forgelex/persistence';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { Client } from '@forgelex/persistence';
import { z } from 'zod';
import {
  AgenticContextSchema,
  LegalAnswerSchema,
  LegalQuestionSchema,
  ExecutionEventInputSchema,
  type AgenticOwner,
  type AgenticExecution,
  type LegalAnswer,
} from '@forgelex/domain';
import { type ForgeLexDatabase, MatterWriteGuard } from '@forgelex/persistence';
import { InferenceBudgetService } from '@forgelex/billing-ledger';
import { ExecutionStore, digest, type ExecutionJob, type WorkerLease } from './execution-store.js';
import { projectClientExecutionEvent, publicQuestion } from './event-stream.js';

const id = z.string().trim().min(1).max(200);
export const StartExecutionSchema = z
  .object({
    objective: z.string().trim().min(1).max(16000),
    actionId: z.enum(['analyze_documents', 'research_question', 'create_document', 'review_text']).optional(),
    conversationId: z.string().guid().optional(),
    matterId: z.string().guid().optional(),
    context: AgenticContextSchema.optional(),
    contextRevision: z.number().int().positive().optional(),
  })
  .strict()
  .refine((v) => !v.conversationId || !v.context || v.contextRevision !== undefined, 'CONTEXT_REVISION_REQUIRED');
const progress = {
  checkpoint: z.record(z.string(), z.unknown()),
  deliveryIds: z.array(id).max(1000).optional(),
  events: z.array(ExecutionEventInputSchema).max(100).optional(),
};
export const StepOutcomeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('checkpoint'), ...progress }).strict(),
  z.object({ kind: z.literal('completed'), ...progress }).strict(),
  z.object({ kind: z.literal('question'), ...progress, question: LegalQuestionSchema }).strict(),
]);
export type StepOutcome = z.infer<typeof StepOutcomeSchema>;
export interface ExecutionServiceOptions {
  now?: () => number;
  executorAvailable?: boolean;
}
const terminal = (e: AgenticExecution) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(e.status);

export class ExecutionService {
  readonly store: ExecutionStore;
  private readonly budget: InferenceBudgetService;
  private readonly now: () => number;
  constructor(
    db: ForgeLexDatabase,
    client: Client,
    private readonly options: ExecutionServiceOptions = {},
  ) {
    this.store = new ExecutionStore(db);
    this.budget = new InferenceBudgetService(db, client);
    this.now = options.now ?? Date.now;
  }
  private at() {
    return new Date(this.now()).toISOString();
  }
  private available() {
    if (!this.options.executorAvailable) throw new Error('EXECUTOR_UNAVAILABLE');
  }
  private async activeContext(s: ExecutionStore, e: AgenticExecution, requireCurrent = false) {
    // Match existing repository order: conversation -> matter -> documents. Locks remain until owner transaction commits.
    const [conversation] = await s.db
      .update(agenticConversations)
      .set({ contextRevision: sql`${agenticConversations.contextRevision}` })
      .where(
        and(
          eq(agenticConversations.id, e.conversationId),
          eq(agenticConversations.tenantId, e.tenantId),
          eq(agenticConversations.userId, e.userId),
        ),
      )
      .returning({ id: agenticConversations.id, revision: agenticConversations.contextRevision });
    if (!conversation || (requireCurrent && (conversation.revision !== e.contextRevision || e.requiresReevaluation)))
      throw new Error('CONTEXT_CONFLICT');
    const guard = new MatterWriteGuard(s.db);
    const check = async (documentId?: string) => {
      if (!e.matterId) return;
      try {
        await guard.captureRevision({ tenantId: e.tenantId, matterId: e.matterId, documentId });
      } catch (error) {
        if (error instanceof Error && /^(MATTER|DOCUMENT)_(NOT_FOUND|NOT_ACTIVE)$/.test(error.message))
          throw new Error('ACCESS_REVOKED', { cause: error });
        throw error;
      }
    };
    if (e.matterId) {
      await s.db
        .update(matters)
        .set({ updatedAt: sql`${matters.updatedAt}` })
        .where(and(eq(matters.id, e.matterId), eq(matters.tenantId, e.tenantId)));
      await check();
    }
    const [snapshot] = await s.db
      .select()
      .from(agenticContexts)
      .where(and(eq(agenticContexts.conversationId, e.conversationId), eq(agenticContexts.revision, e.contextRevision)))
      .limit(1);
    if (!snapshot) throw new Error('CONTEXT_CONFLICT');
    const context = AgenticContextSchema.parse(JSON.parse(snapshot.payloadJson));
    for (const doc of [...context.documents].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
      await s.db
        .update(legalDocuments)
        .set({ updatedAt: sql`${legalDocuments.updatedAt}` })
        .where(and(eq(legalDocuments.id, doc.documentId), eq(legalDocuments.tenantId, e.tenantId)));
      await check(doc.documentId);
    }
    return { ...context, revision: e.contextRevision };
  }
  private async command(
    owner: AgenticOwner,
    key: string,
    input: unknown,
    write: (s: ExecutionStore) => Promise<string>,
  ) {
    id.parse(key);
    const inputHash = digest(input);
    return this.store.atomic(owner, async (s) => {
      const previous = await s.command(owner, key);
      if (previous) {
        if (previous.inputHash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return previous.executionId;
      }
      const executionId = await write(s);
      await s.saveCommand(owner, key, inputHash, executionId, this.at());
      return executionId;
    });
  }
  private async createJob(
    s: ExecutionStore,
    owner: AgenticOwner,
    executionId: string,
    objective: string,
    actionId?: string,
    predecessorId?: string,
  ) {
    await s.createJob({
      ...owner,
      executionId,
      objective,
      actionId,
      predecessorId,
      state: 'READY',
      leaseToken: null,
      leaseExpiresAt: null,
      workerId: null,
      pendingCallId: null,
      budgetReleasePending: false,
      createdAt: this.at(),
    });
    await s.workspace.appendEvent(owner, executionId, { type: 'STATUS', payload: { status: 'QUEUED' } });
  }
  async hasCaseContext(owner: AgenticOwner, ids: { executionId?: string; conversationId?: string }): Promise<boolean> {
    if (ids.executionId) {
      const [row] = await this.store.db
        .select({ matterId: agenticConversations.matterId })
        .from(agenticExecutions)
        .innerJoin(agenticConversations, eq(agenticExecutions.conversationId, agenticConversations.id))
        .where(
          and(
            eq(agenticExecutions.id, ids.executionId),
            eq(agenticExecutions.tenantId, owner.tenantId),
            eq(agenticExecutions.userId, owner.userId),
          ),
        )
        .limit(1);
      return Boolean(row?.matterId);
    }
    if (ids.conversationId) {
      const [row] = await this.store.db
        .select({ matterId: agenticConversations.matterId })
        .from(agenticConversations)
        .where(
          and(
            eq(agenticConversations.id, ids.conversationId),
            eq(agenticConversations.tenantId, owner.tenantId),
            eq(agenticConversations.userId, owner.userId),
          ),
        )
        .limit(1);
      return Boolean(row?.matterId);
    }
    return false;
  }
  async startExecution(owner: AgenticOwner, key: string, raw: z.infer<typeof StartExecutionSchema>) {
    this.available();
    const input = StartExecutionSchema.parse(raw);
    const executionId = await this.command(owner, key, { kind: 'start', input }, async (s) => {
      let conversation = input.conversationId
        ? await s.workspace.getConversation(owner, input.conversationId)
        : undefined;
      if (input.conversationId && !conversation) throw new Error('CONVERSATION_NOT_FOUND');
      if (conversation && input.matterId && conversation.matterId !== input.matterId)
        throw new Error('CONTEXT_CONFLICT');
      if (conversation && input.context) {
        await s.workspace.reviseContext(owner, conversation.id, input.contextRevision!, input.context);
        conversation = (await s.workspace.getConversation(owner, conversation.id))!;
      }
      if (!conversation)
        conversation = await s.workspace.createConversation(owner, {
          objective: input.objective,
          matterId: input.matterId,
          context: input.context ?? { text: '', origin: 'USER', documents: [] },
        });
      await s.workspace.appendMessage(owner, conversation.id, { role: 'USER', text: input.objective });
      const run = await s.workspace.createExecution(owner, {
        conversationId: conversation.id,
        contextRevision: conversation.contextRevision,
        idempotencyKey: `native:${digest(key)}`,
        authorizationId: null,
        budgetReservationId: null,
        provider: null,
        model: null,
      });
      await this.createJob(s, owner, run.id, input.objective, input.actionId);
      return run.id;
    });
    return this.getExecution(owner, executionId);
  }
  async getExecution(owner: AgenticOwner, id: string) {
    return this.store.atomic(owner, async (s) => {
      const e = await s.workspace.getExecution(owner, id);
      if (!e) throw new Error('EXECUTION_NOT_FOUND');
      const j = await s.getJob(owner, id);
      const context = await this.activeContext(s, e);
      const conversation = (await s.workspace.getConversation(owner, e.conversationId))!;
      const priorIds = await s.db
        .select({ id: agenticExecutions.id })
        .from(agenticExecutions)
        .where(
          and(
            eq(agenticExecutions.tenantId, owner.tenantId),
            eq(agenticExecutions.userId, owner.userId),
            eq(agenticExecutions.conversationId, e.conversationId),
          ),
        )
        .limit(1000);
      const prior = await Promise.all(
        priorIds.filter((p) => p.id !== id).map((p) => s.workspace.getExecution(owner, p.id)),
      );
      const current = [...prior, e]
        .filter((p): p is AgenticExecution =>
          Boolean(
            p &&
            p.contextRevision === conversation.contextRevision &&
            !p.requiresReevaluation &&
            p.status !== 'CANCELLED',
          ),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        id: e.id,
        objective: j.objective,
        actionId: j.actionId ?? null,
        conversationId: e.conversationId,
        matterId: e.matterId,
        contextRevision: e.contextRevision,
        status: e.status,
        deliveryIds: e.deliveryIds,
        question: publicQuestion(e.pendingQuestion),
        requiresReevaluation: e.requiresReevaluation,
        currentExecutionId: current?.id ?? null,
        predecessorId: j.predecessorId ?? null,
        successorId: j.successorId ?? null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        context: {
          text: context.text,
          origin: context.origin,
          documents: context.documents,
          ...(context.draft ? { draft: context.draft } : {}),
          ...(context.answers ? { answers: context.answers } : {}),
        },
        messages: conversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          createdAt: m.createdAt,
          ...(m.text ? { text: m.text } : {}),
          ...(m.question ? { question: publicQuestion(m.question) } : {}),
          ...(m.answer ? { answer: LegalAnswerSchema.parse(m.answer) } : {}),
        })),
        history: prior
          .filter((p) => p && p.deliveryIds.length)
          .map((p) => ({ executionId: p!.id, deliveryIds: p!.deliveryIds, createdAt: p!.createdAt })),
      };
    });
  }
  private async successor(
    s: ExecutionStore,
    owner: AgenticOwner,
    old: AgenticExecution,
    job: ExecutionJob,
    key: string,
    revision: number,
    checkpoint: Record<string, unknown> | null,
  ) {
    const next = await s.workspace.createExecution(owner, {
      conversationId: old.conversationId,
      contextRevision: revision,
      idempotencyKey: `successor:${digest(key)}`,
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    if (checkpoint) await s.workspace.saveProgress(owner, next.id, checkpoint);
    await this.createJob(s, owner, next.id, job.objective, job.actionId, old.id);
    await s.saveJob({ ...job, successorId: next.id });
    return next.id;
  }
  async correctAnswer(owner: AgenticOwner, id: string, key: string, raw: LegalAnswer) {
    this.available();
    const answer = LegalAnswerSchema.parse(raw);
    const nextId = await this.command(owner, key, { kind: 'correct', id, answer }, async (s) => {
      const e = await s.workspace.getExecution(owner, id);
      if (!e) throw new Error('EXECUTION_NOT_FOUND');
      const job = await s.getJob(owner, id);
      if (!terminal(e) || job.successorId) throw new Error('EXECUTION_CONFLICT');
      await this.activeContext(s, e, true);
      await s.workspace.correctAnswer(owner, e.conversationId, e.contextRevision, answer);
      const c = (await s.workspace.getConversation(owner, e.conversationId))!;
      return this.successor(s, owner, e, job, key, c.contextRevision, null);
    });
    await this.releaseBudget(owner, id);
    return this.getExecution(owner, nextId);
  }
  async answerExecution(owner: AgenticOwner, id: string, key: string, raw: LegalAnswer) {
    this.available();
    const answer = LegalAnswerSchema.parse(raw);
    const nextId = await this.command(owner, key, { kind: 'answer', id, answer }, async (s) => {
      const e = await s.workspace.getExecution(owner, id);
      if (!e) throw new Error('EXECUTION_NOT_FOUND');
      const job = await s.getJob(owner, id);
      if (e.status !== 'WAITING_USER' || job.state !== 'WAITING') throw new Error('QUESTION_EXPIRED');
      await s.workspace.answerQuestion(owner, id, answer);
      await s.workspace.compareAndSetStatus(owner, id, 'WAITING_USER', 'CANCELLED');
      await s.workspace.appendEvent(owner, id, { type: 'STATUS', payload: { status: 'CANCELLED' } });
      const conversation = (await s.workspace.getConversation(owner, e.conversationId))!;
      return this.successor(
        s,
        owner,
        e,
        { ...job, state: 'CANCELLED', budgetReleasePending: true },
        key,
        conversation.contextRevision,
        null,
      );
    });
    await this.releaseBudget(owner, id);
    return this.getExecution(owner, nextId);
  }
  async cancelExecution(owner: AgenticOwner, id: string, key: string) {
    await this.command(owner, key, { kind: 'cancel', id }, async (s) => {
      const e = await s.workspace.getExecution(owner, id);
      if (!e) throw new Error('EXECUTION_NOT_FOUND');
      const j = await s.getJob(owner, id);
      if (!terminal(e)) {
        await s.workspace.compareAndSetStatus(owner, id, e.status, 'CANCELLED');
        await s.workspace.appendEvent(owner, id, { type: 'STATUS', payload: { status: 'CANCELLED' } });
        if (j.pendingCallId) await s.reconcile(id, j.pendingCallId);
        await s.saveJob({
          ...j,
          state: 'CANCELLED',
          leaseToken: null,
          leaseExpiresAt: null,
          budgetReleasePending: true,
        });
      }
      return id;
    });
    await this.releaseBudget(owner, id);
    return this.getExecution(owner, id);
  }
  async continueFromCheckpoint(owner: AgenticOwner, id: string, key: string) {
    this.available();
    const nextId = await this.command(owner, key, { kind: 'continue', id }, async (s) => {
      const e = await s.workspace.getExecution(owner, id);
      if (!e) throw new Error('EXECUTION_NOT_FOUND');
      const j = await s.getJob(owner, id);
      if (j.pendingCallId || j.state === 'RECONCILIATION') throw new Error('RECONCILIATION_REQUIRED');
      if (!['FAILED', 'CANCELLED'].includes(e.status) || j.successorId) throw new Error('EXECUTION_CONFLICT');
      const c = (await s.workspace.getConversation(owner, e.conversationId))!;
      if (e.requiresReevaluation || c.contextRevision !== e.contextRevision) throw new Error('CONTEXT_CONFLICT');
      return this.successor(s, owner, e, j, key, c.contextRevision, e.checkpoint);
    });
    return this.getExecution(owner, nextId);
  }
  async driverContext(lease: WorkerLease) {
    return this.store.atomic(lease.owner, async (s) => {
      const job = await this.validLease(s, lease),
        execution = (await s.workspace.getExecution(lease.owner, lease.executionId))!;
      if (execution.status !== 'RUNNING') throw new Error('EXECUTION_CONFLICT');
      const context = await this.activeContext(s, execution, true);
      return { execution, job, context };
    });
  }
  private async validLease(s: ExecutionStore, lease: WorkerLease) {
    const j = await s.getJob(lease.owner, lease.executionId);
    if (j.state !== 'LEASED' || j.leaseToken !== lease.token || !j.leaseExpiresAt || j.leaseExpiresAt <= this.at())
      throw new Error('LEASE_LOST');
    return j;
  }
  async claimNext(workerId: string, leaseMs = 60000): Promise<WorkerLease | undefined> {
    for (const job of await this.store.pendingReleases(this.at()))
      await this.releaseBudget({ tenantId: job.tenantId, userId: job.userId }, job.executionId);
    for (const candidate of await this.store.candidates(this.at())) {
      const owner = { tenantId: candidate.tenantId, userId: candidate.userId };
      const claimed = await this.store.atomic(owner, async (s) => {
        const j = await s.getJob(owner, candidate.executionId),
          e = await s.workspace.getExecution(owner, j.executionId);
        if (!e || (j.state !== 'READY' && !(j.state === 'LEASED' && j.leaseExpiresAt && j.leaseExpiresAt <= this.at())))
          return;
        if (terminal(e)) {
          await s.saveJob({
            ...j,
            state: e.status as ExecutionJob['state'],
            leaseToken: null,
            leaseExpiresAt: null,
            budgetReleasePending: true,
          });
          return;
        }
        if (j.pendingCallId) {
          await this.fail(s, j, e, 'RECONCILIATION_REQUIRED');
          return;
        }
        if (e.requiresReevaluation) {
          await this.fail(s, j, e, 'CONTEXT_CHANGED');
          return;
        }
        try {
          await this.activeContext(s, e, true);
        } catch (error) {
          if (!(error instanceof Error) || !['ACCESS_REVOKED', 'CONTEXT_CONFLICT'].includes(error.message)) throw error;
          await this.fail(s, j, e, error.message === 'ACCESS_REVOKED' ? 'ACCESS_REVOKED' : 'CONTEXT_CHANGED');
          return;
        }
        if (e.status === 'QUEUED') await s.workspace.compareAndSetStatus(owner, e.id, 'QUEUED', 'RUNNING');
        const token = randomUUID();
        await s.saveJob({
          ...j,
          state: 'LEASED',
          workerId,
          leaseToken: token,
          leaseExpiresAt: new Date(this.now() + leaseMs).toISOString(),
        });
        await s.workspace.appendEvent(owner, e.id, { type: 'STATUS', payload: { status: 'RUNNING' } });
        return { executionId: e.id, owner, token };
      });
      if (claimed) return claimed;
      await this.releaseBudget(owner, candidate.executionId);
    }
    return undefined;
  }
  async renewLease(lease: WorkerLease, leaseMs: number) {
    return this.store.atomic(lease.owner, async (s) => {
      const j = await this.validLease(s, lease);
      await s.saveJob({ ...j, leaseExpiresAt: new Date(this.now() + leaseMs).toISOString() });
    });
  }
  async beginStep(lease: WorkerLease, callId: string) {
    id.parse(callId);
    await this.store.atomic(lease.owner, async (s) => {
      const j = await this.validLease(s, lease),
        e = (await s.workspace.getExecution(lease.owner, lease.executionId))!;
      if (e.status !== 'RUNNING' || e.requiresReevaluation || j.pendingCallId) throw new Error('EXECUTION_CONFLICT');
      await this.activeContext(s, e, true);
      await s.dispatch(j, callId, this.at());
      await s.saveJob({ ...j, pendingCallId: callId });
    });
  }
  async finishStep(lease: WorkerLease, callId: string | null, raw: StepOutcome) {
    const result = StepOutcomeSchema.parse(raw);
    if (result.events?.some((event) => !['INTERNAL', 'SOURCE'].includes(event.type)))
      throw new Error('STEP_EVENT_INVALID');
    if (Buffer.byteLength(JSON.stringify(result)) > 256000) throw new Error('STEP_RESULT_TOO_LARGE');
    await this.store.atomic(lease.owner, async (s) => {
      const j = await this.validLease(s, lease);
      if (j.pendingCallId !== callId) throw new Error('EXECUTION_CONFLICT');
      const e = (await s.workspace.getExecution(lease.owner, lease.executionId))!;
      await this.activeContext(s, e, true);
      const deliveries = [...new Set([...e.deliveryIds, ...(result.deliveryIds ?? [])])];
      await s.workspace.saveProgress(lease.owner, e.id, result.checkpoint, deliveries);
      for (const event of result.events ?? []) await s.workspace.appendEvent(lease.owner, e.id, event);
      for (const deliveryId of (result.deliveryIds ?? []).filter((id) => !e.deliveryIds.includes(id)))
        await s.workspace.appendEvent(lease.owner, e.id, { type: 'DELIVERY', payload: { deliveryId } });
      let state: ExecutionJob['state'] = 'LEASED';
      if (result.kind === 'question') {
        await s.workspace.askQuestion(lease.owner, e.id, result.question);
        state = 'WAITING';
        await s.workspace.appendEvent(lease.owner, e.id, { type: 'QUESTION', payload: { question: result.question } });
        await s.workspace.appendEvent(lease.owner, e.id, { type: 'STATUS', payload: { status: 'WAITING_USER' } });
      } else if (result.kind === 'completed') {
        await s.workspace.compareAndSetStatus(lease.owner, e.id, 'RUNNING', 'COMPLETED');
        state = 'COMPLETED';
        await s.workspace.appendEvent(lease.owner, e.id, { type: 'STATUS', payload: { status: 'COMPLETED' } });
      }
      if (callId) await s.confirm(e.id, callId, digest(result), this.at());
      await s.saveJob({
        ...j,
        state,
        pendingCallId: null,
        leaseToken: state === 'LEASED' ? j.leaseToken : null,
        leaseExpiresAt: state === 'LEASED' ? j.leaseExpiresAt : null,
        budgetReleasePending: state === 'COMPLETED',
      });
    });
    await this.releaseBudget(lease.owner, lease.executionId);
  }
  private async fail(
    s: ExecutionStore,
    j: ExecutionJob,
    e: AgenticExecution,
    code: string,
    reason?: 'BUDGET_EXHAUSTED',
  ) {
    if (!terminal(e)) {
      await s.workspace.compareAndSetStatus({ tenantId: j.tenantId, userId: j.userId }, e.id, e.status, 'FAILED');
      await s.workspace.appendEvent({ tenantId: j.tenantId, userId: j.userId }, e.id, {
        type: 'ERROR',
        payload: { code, ...(reason ? { reason } : {}) },
      });
      await s.workspace.appendEvent({ tenantId: j.tenantId, userId: j.userId }, e.id, {
        type: 'STATUS',
        payload: { status: 'FAILED' },
      });
    }
    if (j.pendingCallId) await s.reconcile(e.id, j.pendingCallId);
    await s.saveJob({
      ...j,
      state: j.pendingCallId ? 'RECONCILIATION' : 'FAILED',
      leaseToken: null,
      leaseExpiresAt: null,
      budgetReleasePending: true,
    });
  }
  async failLease(lease: WorkerLease, code = 'EXECUTION_FAILED') {
    await this.store.atomic(lease.owner, async (s) => {
      const j = await s.getJob(lease.owner, lease.executionId);
      if (j.leaseToken !== lease.token || j.state !== 'LEASED') return;
      const e = (await s.workspace.getExecution(lease.owner, lease.executionId))!;
      await this.fail(
        s,
        j,
        e,
        j.pendingCallId ? 'RECONCILIATION_REQUIRED' : code,
        code === 'BUDGET_EXHAUSTED' ? 'BUDGET_EXHAUSTED' : undefined,
      );
    });
    await this.releaseBudget(lease.owner, lease.executionId);
  }
  private async releaseBudget(owner: AgenticOwner, id: string) {
    const job = await this.store.getJob(owner, id);
    if (!job.budgetReleasePending) return;
    let released = false;
    try {
      released = (await this.budget.releaseUnusedBudget(owner, id)).status === 'RELEASED';
    } catch (error) {
      if (error instanceof Error && error.message === 'BUDGET_NOT_FOUND') {
        try {
          const existing = await this.budget.getExecutionBudget(owner, id);
          released = !existing || existing.status === 'RELEASED';
        } catch {
          /* Preserve cleanup until absence/release can be confirmed. */
        }
      }
    }
    await this.store.atomic(owner, async (s) => {
      const current = await s.getJob(owner, id);
      await s.saveJob({
        ...current,
        budgetReleasePending: !released,
        budgetReleaseNextAt: released ? null : new Date(this.now() + 30000).toISOString(),
      });
    });
  }
  async listClientEvents(owner: AgenticOwner, id: string, after: number) {
    return this.store.atomic(owner, async (s) => {
      const e = await s.workspace.getExecution(owner, id);
      if (!e) throw new Error('EXECUTION_NOT_FOUND');
      await s.getJob(owner, id);
      const context = await this.activeContext(s, e),
        documents = context.documents;
      const raw = await s.workspace.listEventsAfter(owner, id, after);
      return {
        events: raw
          .map((event) =>
            projectClientExecutionEvent(event, { executionId: id, deliveryIds: e.deliveryIds, documents }),
          )
          .filter((event) => event !== null),
        cursor: raw.at(-1)?.sequence ?? after,
        terminal: terminal(e) && raw.length < 100,
      };
    });
  }
}
