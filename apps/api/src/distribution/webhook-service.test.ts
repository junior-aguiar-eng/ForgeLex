import { describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, WebhookRepository } from '@forgelex/persistence';
import { decryptWebhookSecret, WebhookService } from './webhook-service.js';
import { WEBHOOK_TEST_EVENT_TYPE } from './webhooks.js';

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

  it('respeita revogação, evita replay após entrega e serializa concorrência', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    await runPersistenceMigrations(connection.client);
    await connection.client.execute({ sql: 'DELETE FROM webhook_deliveries', args: [] });
    await connection.client.execute({ sql: 'DELETE FROM webhook_events', args: [] });
    await connection.client.execute({ sql: 'DELETE FROM webhook_endpoints', args: [] });
    const repository = new WebhookRepository(connection.client);
    const service = new WebhookService(repository, { masterKey: 'local-master-key' });
    const revoked = await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/revoked', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { revoked: true } });
    expect(await service.revokeEndpoint('tenant_a', revoked.id)).toBe(true);
    const revokedFetcher = vi.fn(async () => new Response('unexpected', { status: 500 }));
    expect(await service.deliverOne(revokedFetcher)).toBe('idle');
    expect(revokedFetcher).not.toHaveBeenCalled();
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'PENDING', attemptCount: 0 });

    await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/active', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { replay: true } });
    const fetcher = vi.fn(async () => new Response('accepted', { status: 202 }));
    const results = await Promise.all([service.deliverOne(fetcher), service.deliverOne(fetcher)]);
    expect(results).toContain('delivered');
    expect(results).toContain('idle');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await service.deliverOne(fetcher)).toBe('idle');
    connection.client.close();
  });

  it('registra timeout e falha terminal sem perder o estado da entrega', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    await runPersistenceMigrations(connection.client);
    await connection.client.execute({ sql: 'DELETE FROM webhook_deliveries', args: [] });
    await connection.client.execute({ sql: 'DELETE FROM webhook_events', args: [] });
    await connection.client.execute({ sql: 'DELETE FROM webhook_endpoints', args: [] });
    const repository = new WebhookRepository(connection.client);
    const service = new WebhookService(repository, { masterKey: 'local-master-key', timeoutMs: 1 });
    await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/webhook', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { timeout: true } });
    const timeoutFetcher = vi.fn(async (_url: string, init?: RequestInit) => await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    expect(await service.deliverOne(timeoutFetcher)).toBe('retrying');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'RETRYING', lastError: 'WEBHOOK_TIMEOUT' });

    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET attempt_count = 8, next_attempt_at = '2000-01-01T00:00:00.000Z'", args: [] });
    expect(await service.deliverOne(async () => new Response('unavailable', { status: 503 }))).toBe('failed');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'FAILED', responseStatus: 503, attemptCount: 9 });
    connection.client.close();
  });

  describe('test events', () => {
    const setup = async () => {
      const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
      await runPersistenceMigrations(connection.client);
      const repository = new WebhookRepository(connection.client);
      const service = new WebhookService(repository, { masterKey: 'local-master-key' });
      const tenantId = `tenant_test_event_${Math.random().toString(36).slice(2)}`;
      return { connection, repository, service, tenantId };
    };

    it('delivers a webhook.test event to the chosen endpoint even though it subscribes to a different type', async () => {
      const { connection, repository, service, tenantId } = await setup();
      const target = await service.createEndpoint({ tenantId, url: 'https://example.test/target', eventTypes: ['billing.usage.recorded'] });

      const eventId = await service.enqueue({ tenantId, type: WEBHOOK_TEST_EVENT_TYPE, endpointId: target.id, payload: { test: true } });

      expect((await repository.listDeliveries(tenantId)).map((delivery) => delivery.endpointId)).toEqual([target.id]);
      const sent: Array<Record<string, unknown>> = [];
      await service.deliverOne(async (_url, init) => { sent.push(init?.headers as Record<string, unknown>); return new Response('ok', { status: 200 }); });
      expect(sent[0]).toMatchObject({ 'x-forgelex-event-id': eventId, 'x-forgelex-event-type': 'webhook.test' });
      connection.client.close();
    });

    it('never fans a test event out to the tenant\'s other endpoints', async () => {
      const { connection, repository, service, tenantId } = await setup();
      const target = await service.createEndpoint({ tenantId, url: 'https://example.test/target', eventTypes: ['matter.created'] });
      await service.createEndpoint({ tenantId, url: 'https://example.test/other', eventTypes: ['matter.created'] });

      await service.enqueue({ tenantId, type: WEBHOOK_TEST_EVENT_TYPE, endpointId: target.id, payload: { test: true } });

      expect((await repository.listDeliveries(tenantId)).map((delivery) => delivery.endpointId)).toEqual([target.id]);
      connection.client.close();
    });

    it('refuses a test event without a target endpoint instead of broadcasting it', async () => {
      const { connection, repository, service, tenantId } = await setup();
      await service.createEndpoint({ tenantId, url: 'https://example.test/target', eventTypes: ['matter.created'] });

      await expect(service.enqueue({ tenantId, type: WEBHOOK_TEST_EVENT_TYPE, payload: { test: true } })).rejects.toThrow('WEBHOOK_TEST_REQUIRES_ENDPOINT');

      expect(await repository.listDeliveries(tenantId)).toHaveLength(0);
      connection.client.close();
    });

    it('does not treat webhook.test as a subscribable event type', async () => {
      const { connection, service, tenantId } = await setup();

      await expect((async () => service.createEndpoint({ tenantId, url: 'https://example.test/x', eventTypes: [WEBHOOK_TEST_EVENT_TYPE] }))()).rejects.toThrow('WEBHOOK_EVENT_TYPE_INVALID');
      connection.client.close();
    });
  });
});
