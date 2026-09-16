import { describe, expect, it } from 'vitest';
import {
  createWebhookDeliveryHeaders,
  createWebhookSignature,
  verifyWebhookSignature,
} from './webhooks.js';

describe('webhook contract', () => {
  it('gera e valida assinatura HMAC com tolerância temporal', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'matter.created' });
    const timestamp = 1_700_000_000;
    const secret = 'test-webhook-secret';
    const signature = createWebhookSignature({ payload, timestamp, secret });

    expect(verifyWebhookSignature({ payload, timestamp, secret, signature }, timestamp)).toBe(true);
    expect(verifyWebhookSignature({ payload: `${payload}.tampered`, timestamp, secret, signature }, timestamp)).toBe(false);
    expect(verifyWebhookSignature({ payload, timestamp: timestamp - 301, secret, signature }, timestamp)).toBe(false);
  });

  it('publica cabeçalhos determinísticos para a entrega', () => {
    const headers = createWebhookDeliveryHeaders({
      id: 'evt_2',
      type: 'research.authority.verified',
      tenantId: 'tenant_test',
      occurredAt: new Date(1_700_000_000_000).toISOString(),
      payload: { status: 'VERIFIED_OFFICIAL' },
    }, 'test-webhook-secret');

    expect(headers['x-forgelex-event-id']).toBe('evt_2');
    expect(headers['x-forgelex-event-type']).toBe('research.authority.verified');
    expect(headers['x-forgelex-webhook-signature']).toMatch(/^sha256=/);
  });
});
