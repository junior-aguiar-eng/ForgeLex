import { z } from 'zod';
import { LegalAnswerSchema, validateLegalAnswer, type AgenticConversation, type AgenticOwner } from '@forgelex/domain';
import { MatterWriteGuard, type ForgeLexDatabase } from '@forgelex/persistence';
import { applyGuidanceAnswer, guidanceField, guidanceQuestion, initialGuidance } from '@forgelex/legal-workflows';
import { digest, ExecutionStore } from './execution-store.js';
import { publicQuestion } from './event-stream.js';

type Access = { owner: AgenticOwner; canReadMatter: boolean };
type Context = AgenticConversation['contexts'][number];
const startInput = z.strictObject({
  objective: z.string().trim().min(1).max(16000).optional(),
  matterId: z.guid().optional(),
});

function conversationId(owner: AgenticOwner, commandId: string): string {
  // A scoped UUID v8 locates the first snapshot on retry. The command is
  // authenticated independently and the routing hash never identifies a write.
  const h = digest(['guidance-start-v1', owner.tenantId, owner.userId, commandId]);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function project(conversation: AgenticConversation, context: Context) {
  const snapshot = context.guidance;
  if (!snapshot) throw new Error('CONVERSATION_NOT_FOUND');
  const questions = new Map(
    conversation.messages.flatMap(({ executionId, question }) =>
      !executionId && question ? [[question.id, question] as const] : [],
    ),
  );
  const decisions = Object.fromEntries(
    (['area', 'action', 'documentType', 'partyRole', 'stage'] as const).map((field) => {
      const { value, status, questionId } = snapshot[field];
      const original = questionId ? questions.get(questionId) : undefined;
      return [
        field,
        {
          value,
          status,
          ...(original
            ? {
                questionId,
                questionVersion: original.version,
                question: publicQuestion({ ...original, contextRevision: context.revision }),
              }
            : {}),
        },
      ];
    }),
  );
  return {
    conversationId: conversation.id,
    matterId: conversation.matterId,
    contextRevision: context.revision,
    objective: context.text,
    decisions,
    question: guidanceQuestion(snapshot, context.revision),
    history: conversation.messages.flatMap((message) => {
      const answer = message.answer;
      if (message.executionId || !answer || answer.contextRevision >= context.revision) return [];
      const original = questions.get(answer.questionId);
      if (!original) return [];
      const label = answer.selectedOptionIds
        .map((id) => original.options.find((option) => option.id === id)?.label)
        .filter(Boolean);
      const text = answer.unknown ? 'Não sei' : [...label, answer.freeText].filter(Boolean).join(' · ');
      return [{ id: message.id, prompt: original.prompt, text }];
    }),
  };
}

export class GuidanceService {
  private readonly store: ExecutionStore;

  constructor(db: ForgeLexDatabase) {
    this.store = new ExecutionStore(db);
  }

  private async checkMatter(store: ExecutionStore, access: Access, matterId: string | null | undefined) {
    if (!matterId) return;
    if (!access.canReadMatter) throw new Error('ACCESS_REVOKED');
    await new MatterWriteGuard(store.db).captureRevision({ ...access.owner, matterId });
  }

  private async read(store: ExecutionStore, access: Access, id: string) {
    const conversation = await store.workspace.getConversationReadOnly(access.owner, id);
    const context = conversation?.contexts.at(-1);
    if (!conversation || !context?.guidance) throw new Error('CONVERSATION_NOT_FOUND');
    await this.checkMatter(store, access, conversation.matterId);
    return { conversation, context, snapshot: context.guidance };
  }

  async start(access: Access, commandId: string, raw: unknown) {
    z.uuid().parse(commandId);
    const input = startInput.parse(raw);
    const objective = input.objective ?? 'Definir pedido';
    const requestHash = digest({ kind: 'start', objective, matterId: input.matterId ?? null });
    const id = conversationId(access.owner, commandId);
    return this.store.atomic(access.owner, async (store) => {
      const previous = await store.workspace.getConversationReadOnly(access.owner, id);
      if (previous) {
        await this.checkMatter(store, access, previous.matterId);
        const first = previous.contexts[0];
        if (!first || first.guidanceReceipt?.requestHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return project(previous, first);
      }
      await this.checkMatter(store, access, input.matterId);
      const conversation = await store.workspace.createConversation(
        access.owner,
        {
          objective,
          matterId: input.matterId,
          context: {
            origin: 'USER',
            text: input.objective ?? '',
            documents: [],
            guidance: initialGuidance(),
            guidanceReceipt: { commandId, requestHash, revision: 1 },
          },
        },
        id,
      );
      return project(conversation, conversation.contexts[0]);
    });
  }

  async get(access: Access, id: string) {
    return this.store.snapshot(access.owner, async (store) => {
      const { conversation, context } = await this.read(store, access, id);
      return project(conversation, context);
    });
  }

  async respond(access: Access, id: string, commandId: string, raw: unknown, correcting: boolean) {
    z.uuid().parse(commandId);
    const answer = LegalAnswerSchema.parse(raw);
    const requestHash = digest({ kind: correcting ? 'correct' : 'answer', answer });
    return this.store.atomic(access.owner, async (store) => {
      const { conversation, context, snapshot } = await this.read(store, access, id);
      const previous = conversation.contexts.find(
        (item) => item.guidanceReceipt?.commandId === commandId && item.guidanceReceipt.revision === item.revision,
      );
      if (previous) {
        if (previous.guidanceReceipt?.requestHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return project(conversation, previous);
      }
      if (answer.contextRevision !== context.revision) throw new Error('CONTEXT_CONFLICT');
      const original = correcting
        ? conversation.messages.find((message) => message.question?.id === answer.questionId)?.question
        : guidanceQuestion(snapshot, context.revision);
      if (!original || (correcting && snapshot[guidanceField(original)].questionId !== original.id))
        throw new Error('QUESTION_EXPIRED');
      const question = { ...original, contextRevision: context.revision };
      const validated = validateLegalAnswer(question, answer);
      const guidance = applyGuidanceAnswer(snapshot, question, validated);
      await store.workspace.reviseGuidance(
        access.owner,
        id,
        context.revision,
        guidance,
        { commandId, requestHash, revision: context.revision + 1 },
        question,
        validated,
        correcting,
      );
      const updated = await this.read(store, access, id);
      return project(updated.conversation, updated.context);
    });
  }
}
