import { and, asc, eq, gt, max, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  AgenticContextSchema,
  AgenticExecutionInputSchema,
  AgenticExecutionSchema,
  AgenticMessageInputSchema,
  AgenticOwnerSchema,
  ExecutionEventInputSchema,
  LegalQuestionSchema,
  validateLegalAnswer,
  type AgenticContext,
  type AgenticConversation,
  type AgenticExecution,
  type AgenticExecutionInput,
  type AgenticExecutionStatus,
  type AgenticMessage,
  type AgenticMessageInput,
  type AgenticOwner,
  type ExecutionEvent,
  type ExecutionEventInput,
  type LegalAnswer,
  type LegalQuestion,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { MatterWriteGuard } from './matter-write-guard.js';

type ConversationRow = typeof s.agenticConversations.$inferSelect;
const now = () => new Date().toISOString();
const transitions: Record<AgenticExecutionStatus, AgenticExecutionStatus[]> = {
  QUEUED: ['RUNNING', 'WAITING_USER', 'FAILED', 'CANCELLED'],
  RUNNING: ['WAITING_USER', 'COMPLETED', 'FAILED', 'CANCELLED'],
  WAITING_USER: ['RUNNING', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

/** Internal repository: owner must come from the authenticated server, never a model/tool payload. */
export class AgenticWorkspaceRepository {
  constructor(private readonly db: ForgeLexDatabase) {}

  private conversationScope(owner: AgenticOwner, id: string) {
    AgenticOwnerSchema.parse(owner);
    return and(
      eq(s.agenticConversations.id, id),
      eq(s.agenticConversations.tenantId, owner.tenantId),
      eq(s.agenticConversations.userId, owner.userId),
    );
  }
  private executionScope(owner: AgenticOwner, id: string) {
    AgenticOwnerSchema.parse(owner);
    return and(
      eq(s.agenticExecutions.id, id),
      eq(s.agenticExecutions.tenantId, owner.tenantId),
      eq(s.agenticExecutions.userId, owner.userId),
    );
  }
  private async lockConversation<T>(
    owner: AgenticOwner,
    id: string,
    write: (repo: AgenticWorkspaceRepository, row: ConversationRow) => Promise<T>,
    validateMatter = true,
  ): Promise<T> {
    return this.db.transaction(async (transaction) => {
      const repo = new AgenticWorkspaceRepository(transaction as unknown as ForgeLexDatabase);
      // Row lock on PostgreSQL; write transaction on SQLite. Serializes revisions and message ordering.
      const [row] = await repo.db
        .update(s.agenticConversations)
        .set({ contextRevision: sql`${s.agenticConversations.contextRevision}` })
        .where(repo.conversationScope(owner, id))
        .returning();
      if (!row) throw new Error('CONVERSATION_NOT_FOUND');
      if (validateMatter && row.matterId) {
        await repo.db
          .update(s.matters)
          .set({ updatedAt: sql`${s.matters.updatedAt}` })
          .where(and(eq(s.matters.id, row.matterId), eq(s.matters.tenantId, owner.tenantId)));
        await new MatterWriteGuard(repo.db).captureRevision({ ...owner, matterId: row.matterId });
      }
      return write(repo, row);
    });
  }
  private async mutateExecution<T>(
    owner: AgenticOwner,
    id: string,
    write: (repo: AgenticWorkspaceRepository, execution: AgenticExecution, row: ConversationRow) => Promise<T>,
    validateMatter = true,
  ): Promise<T> {
    const execution = await this.getExecution(owner, id);
    if (!execution) throw new Error('EXECUTION_NOT_FOUND');
    return this.lockConversation(
      owner,
      execution.conversationId,
      async (repo, row) => {
        const current = await repo.getExecution(owner, id);
        if (!current) throw new Error('EXECUTION_NOT_FOUND');
        return write(repo, current, row);
      },
      validateMatter,
    );
  }
  private async validateReferences(owner: AgenticOwner, matterId: string | null, context: AgenticContext) {
    if ((context.documents.length || context.draft) && !matterId) throw new Error('CONTEXT_MATTER_REQUIRED');
    if (matterId) {
      await this.db
        .update(s.matters)
        .set({ updatedAt: sql`${s.matters.updatedAt}` })
        .where(and(eq(s.matters.id, matterId), eq(s.matters.tenantId, owner.tenantId)));
      await new MatterWriteGuard(this.db).captureRevision({ ...owner, matterId });
      if (context.draft) {
        const [target] = await this.db.select({ id: s.drafts.id }).from(s.drafts)
          .where(and(eq(s.drafts.id, context.draft.draftId), eq(s.drafts.tenantId, owner.tenantId), eq(s.drafts.matterId, matterId), eq(s.drafts.currentVersionId, context.draft.versionId))).limit(1);
        if (!target) throw new Error('DRAFT_VERSION_NOT_FOUND');
      }
      for (const doc of context.documents) {
        await new MatterWriteGuard(this.db).captureRevision({ ...owner, matterId, documentId: doc.documentId });
        const [version] = await this.db
          .select({ id: s.documentVersions.id })
          .from(s.documentVersions)
          .where(and(eq(s.documentVersions.id, doc.versionId), eq(s.documentVersions.documentId, doc.documentId)))
          .limit(1);
        if (!version) throw new Error('DOCUMENT_VERSION_NOT_FOUND');
      }
    }
  }
  async createConversation(
    owner: AgenticOwner,
    input: { objective: string; matterId?: string; context: AgenticContext },
  ): Promise<AgenticConversation> {
    AgenticOwnerSchema.parse(owner);
    const objective = z.string().trim().min(1).max(16000).parse(input.objective);
    const context = AgenticContextSchema.parse(input.context);
    if (context.answers?.length) throw new Error('ANSWERS_REQUIRE_QUESTION');
    const matterId = input.matterId ? z.string().guid().parse(input.matterId) : null;
    const id = randomUUID();
    await this.db.transaction(async (transaction) => {
      const repo = new AgenticWorkspaceRepository(transaction as unknown as ForgeLexDatabase);
      await repo.validateReferences(owner, matterId, context);
      await repo.db
        .insert(s.agenticConversations)
        .values({ id, ...owner, objective, matterId, contextRevision: 1, createdAt: now() });
      await repo.db.insert(s.agenticContexts).values({
        id: randomUUID(),
        conversationId: id,
        revision: 1,
        payloadJson: JSON.stringify(context),
        createdAt: now(),
      });
    });
    return (await this.getConversation(owner, id))!;
  }
  async getConversation(owner: AgenticOwner, id: string): Promise<AgenticConversation | undefined> {
    return this.db.transaction(async (transaction) => {
      const repo = new AgenticWorkspaceRepository(transaction as unknown as ForgeLexDatabase);
      // READ COMMITTED alone permits mixed revisions. Hold the same row lock used by every writer.
      const [row] = await repo.db
        .update(s.agenticConversations)
        .set({ contextRevision: sql`${s.agenticConversations.contextRevision}` })
        .where(repo.conversationScope(owner, id))
        .returning();
      return row ? repo.readConversation(row) : undefined;
    });
  }
  /** Called only while the conversation row is locked in the current transaction. */
  private async readConversation(row: ConversationRow): Promise<AgenticConversation> {
    const id = row.id;
    const contexts = await this.db
      .select()
      .from(s.agenticContexts)
      .where(eq(s.agenticContexts.conversationId, id))
      .orderBy(asc(s.agenticContexts.revision));
    const messages = await this.db
      .select()
      .from(s.agenticMessages)
      .where(eq(s.agenticMessages.conversationId, id))
      .orderBy(asc(s.agenticMessages.sequence));
    return {
      ...row,
      contexts: contexts.map((c) => ({
        ...AgenticContextSchema.parse(JSON.parse(c.payloadJson)),
        revision: c.revision,
      })),
      messages: messages.map((m) => ({
        ...JSON.parse(m.payloadJson),
        id: m.id,
        executionId: m.executionId,
        createdAt: m.createdAt,
      })),
    };
  }
  private async insertMessage(
    conversationId: string,
    executionId: string | null,
    message: Omit<AgenticMessage, 'id' | 'executionId' | 'createdAt'>,
  ) {
    const [last] = await this.db
      .select({ sequence: max(s.agenticMessages.sequence) })
      .from(s.agenticMessages)
      .where(eq(s.agenticMessages.conversationId, conversationId));
    const record = { id: randomUUID(), executionId, ...message, createdAt: now() };
    await this.db.insert(s.agenticMessages).values({
      id: record.id,
      conversationId,
      executionId,
      sequence: (last?.sequence ?? 0) + 1,
      payloadJson: JSON.stringify(message),
      createdAt: record.createdAt,
    });
    return record;
  }
  async appendMessage(
    owner: AgenticOwner,
    conversationId: string,
    input: AgenticMessageInput,
  ): Promise<AgenticMessage> {
    const message = AgenticMessageInputSchema.parse(input);
    return this.lockConversation(owner, conversationId, (repo) => repo.insertMessage(conversationId, null, message));
  }
  async createExecution(owner: AgenticOwner, raw: AgenticExecutionInput): Promise<AgenticExecution> {
    const input = AgenticExecutionInputSchema.parse(raw);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.lockConversation(owner, input.conversationId, async (repo, row) => {
      const keyScope = and(
        eq(s.agenticExecutions.tenantId, owner.tenantId),
        eq(s.agenticExecutions.userId, owner.userId),
        eq(s.agenticExecutions.idempotencyKey, input.idempotencyKey),
      );
      const [previous] = await repo.db.select().from(s.agenticExecutions).where(keyScope).limit(1);
      if (previous) {
        if (previous.inputHash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
        return AgenticExecutionSchema.parse(JSON.parse(previous.payloadJson));
      }
      if (input.contextRevision !== row.contextRevision) throw new Error('CONTEXT_CONFLICT');
      const conversation = await repo.readConversation(row);
      await repo.validateReferences(owner, row.matterId, conversation.contexts[conversation.contexts.length - 1]);
      const execution = AgenticExecutionSchema.parse({
        ...input,
        ...owner,
        id: randomUUID(),
        matterId: row.matterId,
        status: 'QUEUED',
        checkpoint: null,
        deliveryIds: [],
        requiresReevaluation: false,
        pendingQuestion: null,
        createdAt: now(),
        updatedAt: now(),
      });
      await repo.db
        .insert(s.agenticExecutions)
        .values({
          id: execution.id,
          ...owner,
          conversationId: row.id,
          idempotencyKey: input.idempotencyKey,
          inputHash: hash,
          payloadJson: JSON.stringify(execution),
          eventSequence: 0,
        })
        .onConflictDoNothing();
      const [stored] = await repo.db.select().from(s.agenticExecutions).where(keyScope).limit(1);
      if (stored.inputHash !== hash) throw new Error('IDEMPOTENCY_CONFLICT');
      return AgenticExecutionSchema.parse(JSON.parse(stored.payloadJson));
    });
  }
  async getExecution(owner: AgenticOwner, id: string): Promise<AgenticExecution | undefined> {
    const [row] = await this.db.select().from(s.agenticExecutions).where(this.executionScope(owner, id)).limit(1);
    return row ? AgenticExecutionSchema.parse(JSON.parse(row.payloadJson)) : undefined;
  }
  private async saveExecution(execution: AgenticExecution) {
    const value = AgenticExecutionSchema.parse({ ...execution, updatedAt: now() });
    await this.db
      .update(s.agenticExecutions)
      .set({ payloadJson: JSON.stringify(value) })
      .where(this.executionScope({ tenantId: value.tenantId, userId: value.userId }, value.id));
  }
  /** Operational checkpoints only; caller supplies its durable worker fence separately. */
  async saveProgress(
    owner: AgenticOwner,
    executionId: string,
    checkpoint: Record<string, unknown> | null,
    deliveryIds?: string[],
  ): Promise<void> {
    await this.mutateExecution(owner, executionId, async (repo, execution, row) => {
      if (
        !['QUEUED', 'RUNNING'].includes(execution.status) ||
        execution.contextRevision !== row.contextRevision ||
        execution.requiresReevaluation
      )
        throw new Error('EXECUTION_CONFLICT');
      await repo.saveExecution({ ...execution, checkpoint, deliveryIds: deliveryIds ?? execution.deliveryIds });
    });
  }
  async appendEvent(owner: AgenticOwner, executionId: string, raw: ExecutionEventInput): Promise<ExecutionEvent> {
    const input = ExecutionEventInputSchema.parse(raw);
    return this.mutateExecution(
      owner,
      executionId,
      async (repo) => {
        const [row] = await repo.db
          .update(s.agenticExecutions)
          .set({ eventSequence: sql`${s.agenticExecutions.eventSequence} + 1` })
          .where(repo.executionScope(owner, executionId))
          .returning();
        const event = { ...input, executionId, sequence: row.eventSequence, createdAt: now() };
        await repo.db
          .insert(s.agenticEvents)
          .values({ id: randomUUID(), ...event, payloadJson: JSON.stringify(input.payload) });
        return event;
      },
      !['STATUS', 'ERROR'].includes(input.type),
    );
  }
  async listEventsAfter(
    owner: AgenticOwner,
    executionId: string,
    after: number,
    limit = 100,
  ): Promise<ExecutionEvent[]> {
    z.number().int().nonnegative().parse(after);
    z.number().int().min(1).max(1000).parse(limit);
    if (!(await this.getExecution(owner, executionId))) throw new Error('EXECUTION_NOT_FOUND');
    const rows = await this.db
      .select()
      .from(s.agenticEvents)
      .where(and(eq(s.agenticEvents.executionId, executionId), gt(s.agenticEvents.sequence, after)))
      .orderBy(asc(s.agenticEvents.sequence))
      .limit(limit);
    return rows.map((row) => ({
      executionId,
      sequence: row.sequence,
      type: row.type,
      payload: JSON.parse(row.payloadJson),
      createdAt: row.createdAt,
    }));
  }
  async compareAndSetStatus(
    owner: AgenticOwner,
    executionId: string,
    expected: AgenticExecutionStatus,
    next: AgenticExecutionStatus,
    patch: { checkpoint?: Record<string, unknown> | null; deliveryIds?: string[] } = {},
  ): Promise<boolean> {
    if (!transitions[expected]?.includes(next)) throw new Error('INVALID_TRANSITION');
    return this.mutateExecution(
      owner,
      executionId,
      async (repo, execution, row) => {
        if (execution.status !== expected) return false;
        if ((next === 'RUNNING' || next === 'COMPLETED') && execution.contextRevision !== row.contextRevision)
          throw new Error('CONTEXT_CONFLICT');
        await repo.saveExecution({ ...execution, ...patch, status: next });
        return true;
      },
      !['FAILED', 'CANCELLED'].includes(next),
    );
  }
  async askQuestion(owner: AgenticOwner, executionId: string, raw: LegalQuestion): Promise<void> {
    const question = LegalQuestionSchema.parse(raw);
    await this.mutateExecution(owner, executionId, async (repo, execution, row) => {
      if (!['QUEUED', 'RUNNING', 'WAITING_USER'].includes(execution.status)) throw new Error('EXECUTION_TERMINAL');
      if (question.contextRevision !== row.contextRevision || execution.contextRevision !== row.contextRevision)
        throw new Error('CONTEXT_CONFLICT');
      const conversation = await repo.readConversation(row);
      if (conversation.messages.some((m) => m.question?.id === question.id && m.question.version >= question.version))
        throw new Error('QUESTION_VERSION_CONFLICT');
      await repo.insertMessage(row.id, executionId, { role: 'ASSISTANT', question });
      await repo.saveExecution({ ...execution, status: 'WAITING_USER', pendingQuestion: question });
    });
  }
  private async insertContext(owner: AgenticOwner, row: ConversationRow, raw: AgenticContext) {
    const context = AgenticContextSchema.parse(raw);
    const revision = row.contextRevision + 1;
    await this.validateReferences(owner, row.matterId, context);
    await this.db.insert(s.agenticContexts).values({
      id: randomUUID(),
      conversationId: row.id,
      revision,
      payloadJson: JSON.stringify(context),
      createdAt: now(),
    });
    await this.db
      .update(s.agenticConversations)
      .set({ contextRevision: revision })
      .where(this.conversationScope(owner, row.id));
    const executions = await this.db
      .select()
      .from(s.agenticExecutions)
      .where(eq(s.agenticExecutions.conversationId, row.id));
    // Every run consumes the whole immutable snapshot. Preserve prior outputs but invalidate their currency.
    for (const e of executions)
      await this.saveExecution({
        ...AgenticExecutionSchema.parse(JSON.parse(e.payloadJson)),
        requiresReevaluation: true,
        pendingQuestion: null,
      });
    return revision;
  }
  async reviseContext(
    owner: AgenticOwner,
    conversationId: string,
    expectedRevision: number,
    raw: AgenticContext,
  ): Promise<number> {
    const context = AgenticContextSchema.parse(raw);
    if (context.answers) throw new Error('ANSWERS_REQUIRE_QUESTION');
    return this.lockConversation(owner, conversationId, async (repo, row) => {
      if (row.contextRevision !== expectedRevision) throw new Error('CONTEXT_CONFLICT');
      const conversation = await repo.readConversation(row);
      const current = conversation.contexts[conversation.contexts.length - 1];
      return repo.insertContext(owner, row, { ...context, ...(current.answers ? { answers: current.answers } : {}) });
    });
  }
  async answerQuestion(owner: AgenticOwner, executionId: string, raw: LegalAnswer): Promise<void> {
    await this.mutateExecution(owner, executionId, async (repo, execution, row) => {
      const question = execution.pendingQuestion;
      if (execution.status !== 'WAITING_USER' || !question || row.contextRevision !== question.contextRevision)
        throw new Error('QUESTION_EXPIRED');
      const answer = validateLegalAnswer(question, raw);
      const conversation = await repo.readConversation(row);
      const current = conversation.contexts[conversation.contexts.length - 1];
      const { revision: _revision, ...context } = current;
      await repo.insertMessage(row.id, executionId, { role: 'USER', answer });
      await repo.insertContext(owner, row, { ...context, answers: [...(context.answers ?? []), answer] });
    });
  }
  async correctAnswer(
    owner: AgenticOwner,
    conversationId: string,
    expectedRevision: number,
    raw: LegalAnswer,
  ): Promise<void> {
    await this.lockConversation(owner, conversationId, async (repo, row) => {
      if (row.contextRevision !== expectedRevision || raw.contextRevision !== expectedRevision)
        throw new Error('CONTEXT_CONFLICT');
      const conversation = await repo.readConversation(row);
      const original = conversation.messages.find(
        (m) => m.question?.id === raw.questionId && m.question.version === raw.questionVersion,
      );
      const current = conversation.contexts[conversation.contexts.length - 1];
      if (
        !original?.question ||
        conversation.messages.some(
          (m) => m.question?.id === raw.questionId && m.question.version > raw.questionVersion,
        ) ||
        !current.answers?.some((a) => a.questionId === raw.questionId && a.questionVersion === raw.questionVersion)
      )
        throw new Error('QUESTION_EXPIRED');
      // A correction explicitly targets the current snapshot, retaining the original question/version.
      const answer = validateLegalAnswer({ ...original.question, contextRevision: expectedRevision }, raw);
      const { revision: _revision, ...context } = current;
      await repo.insertMessage(row.id, original.executionId, { role: 'USER', answer });
      await repo.insertContext(owner, row, {
        ...context,
        answers: context.answers!.map((a) =>
          a.questionId === answer.questionId && a.questionVersion === answer.questionVersion ? answer : a,
        ),
      });
    });
  }
}
