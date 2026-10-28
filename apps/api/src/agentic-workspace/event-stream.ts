import { z } from 'zod';
import { AgenticExecutionStatusSchema, LegalQuestionSchema, type ExecutionEvent } from '@forgelex/domain';

const id = z.string().min(1).max(200);
const codes = z.enum([
  'EXECUTION_FAILED',
  'EXECUTION_UNAVAILABLE',
  'EXECUTOR_UNAVAILABLE',
  'RECONCILIATION_REQUIRED',
  'ACCESS_REVOKED',
  'CONTEXT_CHANGED',
  'BUDGET_EXHAUSTED',
]);
export interface AuthorizedEventContext {
  executionId: string;
  deliveryIds: string[];
  documents: { documentId: string; versionId: string }[];
}
export interface ClientExecutionEvent {
  executionId: string;
  sequence: number;
  type: 'STATUS' | 'QUESTION' | 'DELIVERY' | 'SOURCE' | 'ERROR';
  payload: Record<string, unknown>;
  createdAt: string;
}
export function publicQuestion(value: unknown) {
  const q = value as Record<string, unknown> | null;
  if (!q || typeof q !== 'object') return null;
  const parsed = LegalQuestionSchema.safeParse({
    id: q.id,
    version: q.version,
    contextRevision: q.contextRevision,
    prompt: q.prompt,
    selection: q.selection,
    options: Array.isArray(q.options) ? q.options.map((o) => ({ id: o?.id, label: o?.label })) : undefined,
    allowFreeText: q.allowFreeText,
    allowUnknown: q.allowUnknown,
    reason: q.reason,
  });
  return parsed.success ? parsed.data : null;
}
export function projectClientExecutionEvent(
  event: ExecutionEvent,
  context: AuthorizedEventContext,
): ClientExecutionEvent | null {
  if (event.executionId !== context.executionId) return null;
  const p = event.payload;
  let payload: Record<string, unknown>;
  switch (event.type) {
    case 'STATUS': {
      const status = AgenticExecutionStatusSchema.safeParse(p.status);
      if (!status.success) return null;
      payload = { status: status.data };
      break;
    }
    case 'QUESTION': {
      const question = publicQuestion(p.question);
      if (!question) return null;
      payload = { question };
      break;
    }
    case 'DELIVERY': {
      const deliveryId = id.safeParse(p.deliveryId);
      if (!deliveryId.success || !context.deliveryIds.includes(deliveryId.data)) return null;
      payload = { deliveryId: deliveryId.data };
      break;
    }
    case 'SOURCE': {
      if (!context.documents.some((d) => d.documentId === p.documentId && d.versionId === p.versionId)) return null;
      payload = { documentId: p.documentId, versionId: p.versionId };
      break;
    }
    case 'ERROR': {
      const code = codes.safeParse(p.code);
      payload = { code: code.success ? code.data : 'EXECUTION_FAILED' };
      if (p.reason === 'BUDGET_EXHAUSTED') payload.reason = 'BUDGET_EXHAUSTED';
      break;
    }
    default:
      return null;
  }
  return {
    executionId: event.executionId,
    sequence: event.sequence,
    type: event.type as ClientExecutionEvent['type'],
    payload,
    createdAt: event.createdAt,
  };
}
export function encodeExecutionEvent(event: ClientExecutionEvent): string {
  return `id: ${event.sequence}\nevent: ${event.type.toLowerCase()}\ndata: ${JSON.stringify(event)}\n\n`;
}
