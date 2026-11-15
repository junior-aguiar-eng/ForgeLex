import { describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, WebhookRepository } from '@forgelex/persistence';
import { decryptWebhookSecret, WebhookService } from './webhook-service.js';
import type { WebhookPoster } from './webhook-http-client.js';
import { WEBHOOK_TEST_EVENT_TYPE } from './webhooks.js';

type Post = WebhookPoster['post'];
const posterOf = (post: Post, check?: WebhookPoster['check']): WebhookPoster => ({ post, ...(check ? { check } : {}) });
const open = async (options: ConstructorParameters<typeof WebhookService>[1] = {}) => {
  const connection = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(connection.client);
  const repository = new WebhookRepository(connection.client);
  const service = new WebhookService(repository, { masterKey: 'local-master-key', ...options });
  return { connection, repository, service };
};

describe('WebhookService', () => {
  it('cifra o segredo, enfileira e entrega com assinatura HMAC', async () => {
    let eventId = '';
    const post = vi.fn(async (_url: string, headers: Record<string, string>) => {
      expect(headers).toMatchObject({ 'x-forgelex-event-id': eventId, 'x-forgelex-webhook-signature': expect.stringMatching(/^sha256=/) });
      return 202;
    });
    const { connection, repository, service } = await open({ poster: posterOf(post) });
    const created = await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/webhook', secret: 'secret-value', eventTypes: ['matter.created'] });
    expect(created.secret).toBe('secret-value');
    expect(decryptWebhookSecret((await repository.findEndpoint('tenant_a', created.id))!.secretCiphertext, 'local-master-key')).toBe('secret-value');
    eventId = await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { matterId: 'matter_a' } });
    expect(eventId).toBeTruthy();

    expect(await service.deliverOne()).toBe('delivered');

    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'DELIVERED', responseStatus: 202, attemptCount: 1 });
    connection.client.close();
  });

  it('agenda retry com backoff e termina após o limite de tentativas', async () => {
    let status = 502;
    const { connection, repository, service } = await open({ poster: posterOf(async () => status) });
    await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/webhook', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: {} });
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET next_attempt_at = '2000-01-01T00:00:00.000Z'", args: [] });

    expect(await service.deliverOne()).toBe('retrying');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'RETRYING', responseStatus: 502, attemptCount: 1 });

    status = 503;
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET attempt_count = 8, next_attempt_at = '2000-01-01T00:00:00.000Z'", args: [] });
    expect(await service.deliverOne()).toBe('failed');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'FAILED', responseStatus: 503, attemptCount: 9 });
    connection.client.close();
  });

  it('respeita revogação, evita replay após entrega e serializa concorrência', async () => {
    const post = vi.fn(async () => 202);
    const { connection, repository, service } = await open({ poster: posterOf(post) });
    const revoked = await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/revoked', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { revoked: true } });
    expect(await service.revokeEndpoint('tenant_a', revoked.id)).toBe(true);
    expect(await service.deliverOne()).toBe('idle');
    expect(post).not.toHaveBeenCalled();
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'FAILED', attemptCount: 0, lastError: 'WEBHOOK_ENDPOINT_INACTIVE' });

    await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/active', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { replay: true } });
    const results = await Promise.all([service.deliverOne(), service.deliverOne()]);
    expect(results).toContain('delivered');
    expect(results).toContain('idle');
    expect(post).toHaveBeenCalledTimes(1);
    expect(await service.deliverOne()).toBe('idle');
    connection.client.close();
  });

  it('registra timeout e falha terminal sem perder o estado da entrega', async () => {
    let behave: 'hang' | 'unavailable' = 'hang';
    const post: Post = (_url, _headers, _body, signal) => behave === 'unavailable'
      ? Promise.resolve(503)
      : new Promise<number>((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
    const { connection, repository, service } = await open({ timeoutMs: 1, poster: posterOf(post) });
    await service.createEndpoint({ tenantId: 'tenant_a', url: 'https://example.test/webhook', eventTypes: ['matter.created'] });
    await service.enqueue({ tenantId: 'tenant_a', type: 'matter.created', payload: { timeout: true } });

    expect(await service.deliverOne()).toBe('retrying');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'RETRYING', lastError: 'WEBHOOK_TIMEOUT' });

    behave = 'unavailable';
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET attempt_count = 8, next_attempt_at = '2000-01-01T00:00:00.000Z'", args: [] });
    expect(await service.deliverOne()).toBe('failed');
    expect((await repository.listDeliveries('tenant_a'))[0]).toMatchObject({ status: 'FAILED', responseStatus: 503, attemptCount: 9 });
    connection.client.close();
  });

  it('stores no remote response content', async () => {
    const { connection, service } = await open({ poster: posterOf(async () => 200) });
    await service.createEndpoint({ tenantId: 'safe', url: 'https://example.test' });
    await service.enqueue({ tenantId: 'safe', type: 'matter.created', payload: {} });

    expect(await service.deliverOne()).toBe('delivered');

    expect((await service.listDeliveries('safe'))[0]!.responseBodyExcerpt).toBeUndefined();
    connection.client.close();
  });

  describe('test events', () => {
    const tenantId = 'tenant_test_event';

    it('delivers a webhook.test event to the chosen endpoint even though it subscribes to a different type', async () => {
      const sent: Array<Record<string, string>> = [];
      const { connection, repository, service } = await open({ poster: posterOf(async (_url, headers) => { sent.push(headers); return 200; }) });
      const target = await service.createEndpoint({ tenantId, url: 'https://example.test/target', eventTypes: ['billing.usage.recorded'] });

      const eventId = await service.enqueue({ tenantId, type: WEBHOOK_TEST_EVENT_TYPE, endpointId: target.id, payload: { test: true } });

      expect((await repository.listDeliveries(tenantId)).map((delivery) => delivery.endpointId)).toEqual([target.id]);
      expect(await service.deliverOne()).toBe('delivered');
      expect(sent[0]).toMatchObject({ 'x-forgelex-event-id': eventId, 'x-forgelex-event-type': 'webhook.test' });
      connection.client.close();
    });

    it('never fans a test event out to the tenant\'s other endpoints', async () => {
      const { connection, repository, service } = await open();
      const target = await service.createEndpoint({ tenantId, url: 'https://example.test/target', eventTypes: ['matter.created'] });
      await service.createEndpoint({ tenantId, url: 'https://example.test/other', eventTypes: ['matter.created'] });

      await service.enqueue({ tenantId, type: WEBHOOK_TEST_EVENT_TYPE, endpointId: target.id, payload: { test: true } });

      expect((await repository.listDeliveries(tenantId)).map((delivery) => delivery.endpointId)).toEqual([target.id]);
      connection.client.close();
    });

    it('refuses a test event without a target endpoint instead of broadcasting it', async () => {
      const { connection, repository, service } = await open();
      await service.createEndpoint({ tenantId, url: 'https://example.test/target', eventTypes: ['matter.created'] });

      await expect(service.enqueue({ tenantId, type: WEBHOOK_TEST_EVENT_TYPE, payload: { test: true } })).rejects.toThrow('WEBHOOK_TEST_REQUIRES_ENDPOINT');

      expect(await repository.listDeliveries(tenantId)).toHaveLength(0);
      connection.client.close();
    });

    it('does not treat webhook.test as a subscribable event type', async () => {
      const { connection, service } = await open();

      await expect((async () => service.createEndpoint({ tenantId, url: 'https://example.test/x', eventTypes: [WEBHOOK_TEST_EVENT_TYPE] }))()).rejects.toThrow('WEBHOOK_EVENT_TYPE_INVALID');
      connection.client.close();
    });
  });
});

describe('targeted and broadcast enqueue', () => {
  it('refuses a targeted event for an endpoint that is no longer active instead of pretending it was queued', async () => {
    const { connection, service } = await open();
    const suspended = await service.createEndpoint({ tenantId: 'tenant', url: 'https://example.test/a' });
    const revoked = await service.createEndpoint({ tenantId: 'tenant', url: 'https://example.test/b' });
    await connection.client.execute({ sql: "UPDATE webhook_endpoints SET status = 'SUSPENDED' WHERE id = ?", args: [suspended.id] });
    await service.revokeEndpoint('tenant', revoked.id);

    await expect(service.enqueue({ tenantId: 'tenant', type: 'matter.created', endpointId: suspended.id, payload: {} })).rejects.toThrow('WEBHOOK_ENDPOINT_NOT_ACTIVE');
    await expect(service.enqueue({ tenantId: 'tenant', type: 'matter.created', endpointId: revoked.id, payload: {} })).rejects.toThrow('WEBHOOK_ENDPOINT_NOT_ACTIVE');
    connection.client.close();
  });

  it('queues a targeted event for an active endpoint, and a broadcast with no subscriber is not an error', async () => {
    const { connection, service } = await open();
    const active = await service.createEndpoint({ tenantId: 'tenant', url: 'https://example.test/a', eventTypes: ['matter.created'] });

    await expect(service.enqueue({ tenantId: 'tenant', type: 'matter.created', endpointId: active.id, payload: {} })).resolves.toBeTruthy();
    await expect(service.enqueue({ tenantId: 'nobody', type: 'matter.created', payload: {} })).resolves.toBeTruthy();
    connection.client.close();
  });
});

describe('endpoint with a blocked address', () => {
  const privateEndpoint = async () => {
    const context = await open();
    const created = await context.service.createEndpoint({ tenantId: 'tenant', url: 'https://example.test' });
    await context.service.enqueue({ tenantId: 'tenant', type: 'matter.created', payload: {} });
    await context.connection.client.execute({ sql: "UPDATE webhook_endpoints SET url = 'https://127.0.0.1' WHERE id = ?", args: [created.id] });
    return { ...context, endpointId: created.id };
  };

  it('suspends the endpoint with diagnostics without connecting, and holds its deliveries instead of dropping them', async () => {
    const { connection, repository, service } = await privateEndpoint();

    expect(await service.deliverOne()).toBe('retrying');

    expect((await service.listEndpoints('tenant'))[0]).toMatchObject({ status: 'SUSPENDED', lastError: 'WEBHOOK_URL_BLOCKED' });
    expect((await repository.listDeliveries('tenant'))[0]).toMatchObject({ status: 'RETRYING', lastError: 'WEBHOOK_URL_BLOCKED' });
    expect(await service.deliverOne()).toBe('idle');
    connection.client.close();
  });

  it('refuses to reactivate while the address is still blocked', async () => {
    const { connection, service, endpointId } = await privateEndpoint();
    await service.deliverOne();

    await expect(service.reactivateEndpoint('tenant', endpointId)).rejects.toThrow('WEBHOOK_URL_BLOCKED');

    expect((await service.listEndpoints('tenant'))[0]).toMatchObject({ status: 'SUSPENDED' });
    connection.client.close();
  });

  it('reactivates once the address is public again and delivers what was held', async () => {
    const { connection, repository, endpointId } = await privateEndpoint();
    const delivered: string[] = [];
    const service = new WebhookService(repository, { masterKey: 'local-master-key', poster: { post: async (url) => { delivered.push(url); return 204; }, check: async () => undefined } });
    await connection.client.execute({ sql: "UPDATE webhook_endpoints SET status = 'SUSPENDED', last_error = 'WEBHOOK_URL_BLOCKED', url = 'https://example.test/fixed' WHERE id = ?", args: [endpointId] });
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET status = 'RETRYING', next_attempt_at = '2099-01-01T00:00:00.000Z'", args: [] });

    expect(await service.reactivateEndpoint('tenant', endpointId)).toBe(true);
    expect(await service.deliverOne()).toBe('delivered');

    expect(delivered).toEqual(['https://example.test/fixed']);
    connection.client.close();
  });

  it('answers false for an unknown endpoint and for one that is not suspended', async () => {
    const { connection, service } = await open();
    const active = await service.createEndpoint({ tenantId: 'tenant', url: 'https://example.test/a' });

    expect(await service.reactivateEndpoint('tenant', active.id)).toBe(false);
    expect(await service.reactivateEndpoint('tenant', 'missing')).toBe(false);
    connection.client.close();
  });
});

describe('worker concurrency', () => {
  const tenants = ['t1', 't2', 't3'];
  const urlOf = (tenant: string) => `https://${tenant}.example.test/hook`;
  /** Deliveries to the `gated` tenants stay open until `settle`; the others answer at once. */
  const setup = async (concurrency: number, gated: string[]) => {
    const waiting = new Map<string, () => void>();
    const started: string[] = [];
    const poster = posterOf((url) => {
      started.push(url);
      return gated.some((tenant) => url === urlOf(tenant)) ? new Promise<number>((resolve) => { waiting.set(url, () => resolve(204)); }) : Promise.resolve(204);
    });
    const context = await open({ poster, concurrency });
    for (const [index, tenant] of tenants.entries()) {
      await context.service.createEndpoint({ tenantId: tenant, url: urlOf(tenant), eventTypes: ['matter.created'] });
      await context.service.enqueue({ tenantId: tenant, type: 'matter.created', payload: {} });
      // Distinct due times make the claim order t1, t2, t3 instead of an arbitrary tie-break.
      await context.connection.client.execute({ sql: 'UPDATE webhook_deliveries SET next_attempt_at = ? WHERE tenant_id = ?', args: [`2000-01-01T00:00:0${index}.000Z`, tenant] });
    }
    const settle = async (tenant: string) => {
      await vi.waitFor(() => expect(waiting.has(urlOf(tenant))).toBe(true));
      waiting.get(urlOf(tenant))!();
    };
    return { ...context, started, settle };
  };

  it('delivers up to the configured number at once and never more', async () => {
    const { connection, service, started, settle } = await setup(2, tenants);

    const first = service.tick();
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(await service.tick()).toEqual([]);
    expect(started).toHaveLength(2);

    await settle('t1');
    await settle('t2');
    expect(await first).toEqual(['delivered', 'delivered']);

    const next = service.tick();
    await settle('t3');
    expect(await next).toEqual(['delivered']);
    connection.client.close();
  });

  it('keeps delivering other tenants while one delivery is still slow', async () => {
    const { connection, service, started, settle } = await setup(2, ['t1', 't2']);

    const first = service.tick();
    await vi.waitFor(() => expect(started).toHaveLength(2));
    await settle('t2');
    // t1 is still in flight; once t2 frees its slot a later tick must deliver t3 without waiting for t1.
    await vi.waitFor(async () => expect(await service.tick()).toEqual(['delivered']));
    expect(started).toContain(urlOf('t3'));

    await settle('t1');
    await first;
    connection.client.close();
  });

  it('reports an idle queue as no deliveries', async () => {
    const { connection, service } = await open();

    expect(await service.tick()).toEqual([]);
    connection.client.close();
  });
});
