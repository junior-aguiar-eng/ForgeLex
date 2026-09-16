import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_EVENT_TYPES = [
  'matter.created',
  'document.ingested',
  'research.authority.verified',
  'billing.usage.recorded',
  'billing.debit.recorded',
  'draft.created',
  'draft.versioned',
  'draft.review.completed',
  'draft.approval.requested',
  'draft.approval.resolved',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface ForgeLexWebhookEvent<TPayload = Record<string, unknown>> {
  id: string;
  type: WebhookEventType;
  tenantId: string;
  occurredAt: string;
  payload: TPayload;
}

export interface WebhookSignatureInput {
  payload: string;
  timestamp: number;
  secret: string;
}

export function createWebhookSignature(input: WebhookSignatureInput): string {
  return `sha256=${createHmac('sha256', input.secret).update(`${input.timestamp}.${input.payload}`, 'utf8').digest('hex')}`;
}

export function verifyWebhookSignature(
  input: WebhookSignatureInput & { signature: string; toleranceSeconds?: number },
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const toleranceSeconds = input.toleranceSeconds ?? 300;
  if (!Number.isInteger(input.timestamp) || Math.abs(nowSeconds - input.timestamp) > toleranceSeconds) return false;

  const expected = Buffer.from(createWebhookSignature(input), 'utf8');
  const actual = Buffer.from(input.signature, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createWebhookDeliveryHeaders(event: ForgeLexWebhookEvent, secret: string): Record<string, string> {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  return {
    'content-type': 'application/json',
    'x-forgelex-event-id': event.id,
    'x-forgelex-event-type': event.type,
    'x-forgelex-webhook-timestamp': String(timestamp),
    'x-forgelex-webhook-signature': createWebhookSignature({ payload, timestamp, secret }),
  };
}
