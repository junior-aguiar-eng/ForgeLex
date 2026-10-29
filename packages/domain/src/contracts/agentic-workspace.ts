import { z } from 'zod';

const id = z.string().min(1).max(200);
const revision = z.number().int().positive();
export const AgenticOwnerSchema = z.object({ tenantId: id, userId: id }).strict();
export type AgenticOwner = z.infer<typeof AgenticOwnerSchema>;
export const AgenticExecutionStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'WAITING_USER',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export type AgenticExecutionStatus = z.infer<typeof AgenticExecutionStatusSchema>;

export const LegalQuestionSchema = z
  .object({
    id,
    version: revision,
    contextRevision: revision,
    prompt: z.string().min(1).max(8000),
    selection: z.enum(['single', 'multiple', 'free_text']),
    options: z.array(z.object({ id, label: z.string().min(1).max(2000) }).strict()).max(100),
    allowFreeText: z.boolean(),
    allowUnknown: z.boolean(),
    reason: z.string().min(1).max(4000),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (new Set(q.options.map((o) => o.id)).size !== q.options.length)
      ctx.addIssue({ code: 'custom', message: 'DUPLICATE_OPTIONS' });
    if (q.selection === 'free_text' && (!q.allowFreeText || q.options.length))
      ctx.addIssue({ code: 'custom', message: 'INVALID_FREE_TEXT_QUESTION' });
    if (q.selection !== 'free_text' && !q.options.length) ctx.addIssue({ code: 'custom', message: 'MISSING_OPTIONS' });
  });
export type LegalQuestion = z.infer<typeof LegalQuestionSchema>;
export const LegalAnswerSchema = z
  .object({
    questionId: id,
    questionVersion: revision,
    contextRevision: revision,
    selectedOptionIds: z.array(id).max(100),
    freeText: z.string().trim().min(1).max(32000).optional(),
    unknown: z.boolean().optional(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (new Set(a.selectedOptionIds).size !== a.selectedOptionIds.length)
      ctx.addIssue({ code: 'custom', message: 'DUPLICATE_SELECTION' });
    if (a.unknown && (a.selectedOptionIds.length || a.freeText))
      ctx.addIssue({ code: 'custom', message: 'UNKNOWN_WITH_ANSWER' });
    if (!a.unknown && !a.selectedOptionIds.length && !a.freeText)
      ctx.addIssue({ code: 'custom', message: 'EMPTY_ANSWER' });
  });
export type LegalAnswer = z.infer<typeof LegalAnswerSchema>;

export function validateLegalAnswer(question: LegalQuestion, input: unknown): LegalAnswer {
  const a = LegalAnswerSchema.parse(input);
  if (
    a.questionId !== question.id ||
    a.questionVersion !== question.version ||
    a.contextRevision !== question.contextRevision
  )
    throw new Error('QUESTION_EXPIRED');
  if (
    a.selectedOptionIds.some((option) => !question.options.some((o) => o.id === option)) ||
    (question.selection === 'single' && a.selectedOptionIds.length > 1) ||
    (question.selection === 'free_text' && a.selectedOptionIds.length > 0) ||
    (a.freeText && !question.allowFreeText) ||
    (a.unknown && !question.allowUnknown)
  )
    throw new Error('INVALID_ANSWER');
  return a;
}

export const AgenticContextSchema = z
  .object({
    text: z.string().max(128000),
    origin: z.enum(['USER', 'DOCUMENT', 'MIXED']),
    documents: z.array(z.object({ documentId: z.string().guid(), versionId: z.string().guid() }).strict()).max(100),
    answers: z.array(LegalAnswerSchema).max(1000).optional(),
    draft: z.object({ draftId: z.string().guid(), versionId: z.string().guid() }).strict().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.origin === 'USER' && c.documents.length) ctx.addIssue({ code: 'custom', message: 'CONTEXT_ORIGIN_MISMATCH' });
    if (c.origin !== 'USER' && !c.documents.length)
      ctx.addIssue({ code: 'custom', message: 'CONTEXT_DOCUMENT_REQUIRED' });
  });
export type AgenticContext = z.infer<typeof AgenticContextSchema>;
export const AgenticExecutionInputSchema = z
  .object({
    conversationId: id,
    contextRevision: revision,
    idempotencyKey: id,
    authorizationId: id.nullable(),
    budgetReservationId: id.nullable(),
    provider: id.nullable(),
    model: id.nullable(),
  })
  .strict();
export type AgenticExecutionInput = z.infer<typeof AgenticExecutionInputSchema>;
export const AgenticExecutionSchema = AgenticExecutionInputSchema.extend({
  id,
  tenantId: id,
  userId: id,
  matterId: z.string().guid().nullable(),
  status: AgenticExecutionStatusSchema,
  checkpoint: z.record(z.string(), z.unknown()).nullable(),
  deliveryIds: z.array(id).max(1000),
  requiresReevaluation: z.boolean(),
  pendingQuestion: LegalQuestionSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AgenticExecution = z.infer<typeof AgenticExecutionSchema>;
export const ExecutionEventInputSchema = z.object({ type: id, payload: z.record(z.string(), z.unknown()) }).strict();
export type ExecutionEventInput = z.infer<typeof ExecutionEventInputSchema>;
export interface ExecutionEvent extends ExecutionEventInput {
  executionId: string;
  sequence: number;
  createdAt: string;
}
export const AgenticMessageInputSchema = z
  .object({ role: z.enum(['USER', 'ASSISTANT']), text: z.string().min(1).max(128000) })
  .strict();
export type AgenticMessageInput = z.infer<typeof AgenticMessageInputSchema>;
export interface AgenticMessage {
  id: string;
  executionId: string | null;
  role: 'USER' | 'ASSISTANT';
  text?: string;
  question?: LegalQuestion;
  answer?: LegalAnswer;
  createdAt: string;
}
export interface AgenticConversation extends AgenticOwner {
  id: string;
  objective: string;
  matterId: string | null;
  contextRevision: number;
  contexts: (AgenticContext & { revision: number })[];
  messages: AgenticMessage[];
  createdAt: string;
}
