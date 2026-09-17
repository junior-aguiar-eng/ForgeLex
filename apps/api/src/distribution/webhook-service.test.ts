import { describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, WebhookRepository } from '@forgelex/persistence';
import { decryptWebhookSecret, WebhookService } from './webhook-service.js';

describe('WebhookService', () => {
  it('cifra o segredo, enfileira e entrega com assinatura HMAC', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    await runPersistenceMigrations(connection.client);
    const repository = new WebhookRepository(connection.client);
    const service = new WebhookService(repository, { masterKey: 'local-master-key' });
    const created = await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/webhook', secret: 'secret-value', eventTypes: ['matter.created'] });
    expect(created.secret).toBe('secret-value');
    expect(decryptWebhookSecret((await repository.findEndpoint('tenant_a', created.id))!.secretCiphertext, 'local-master-key')).toBe('secret-value');
    const eventId = await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { matterId: 'matter_a' } });
    expect(eventId).toBeTruthy();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'x-forgelex-event-id': eventId, 'x-forgelex-webhook-signature': expect.stringMatching(/^sha256=/) });
      return new Response('accepted', { status: 202 });
    });
    expect(await service.deliverOne(fetcher)).toBe('delivered');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'DELIVERED', responseStatus: 202, attemptCount: 1 });
    connection.client.close();
  });

  it('agenda retry com backoff e termina após o limite de tentativas', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    await runPersistenceMigrations(connection.client);
    await connection.client.execute({ sql: 'DELETE FROM webhook_deliveries', args: [] });
    await connection.client.execute({ sql: 'DELETE FROM webhook_events', args: [] });
    await connection.client.execute({ sql: 'DELETE FROM webhook_endpoints', args: [] });
    const repository = new WebhookRepository(connection.client);
    const service = new WebhookService(repository, { masterKey: 'local-master-key' });
    await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/webhook', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: {} });
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET next_attempt_at = '2000-01-01T00:00:00.000Z'", args: [] });
    expect(await service.deliverOne(async () => new Response('bad gateway', { status: 502 }))).toBe('retrying');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'RETRYING', responseStatus: 502, attemptCount: 1 });
    connection.client.close();
  });
});
