import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { WebhookRepository } from './webhook-repository.js';

describe('WebhookRepository', () => {
  it('persiste endpoints e mantém entregas isoladas por tenant', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    await runPersistenceMigrations(connection.client);
    const repository = new WebhookRepository(connection.client);
    await repository.createEndpoint({ id: 'endpoint_a', tenantId: 'tenant_a', url: 'https://example.test/hook', secretCiphertext: 'ciphertext', eventTypes: ['matter.created'] });
    await repository.createEndpoint({ id: 'endpoint_b', tenantId: 'tenant_b', url: 'https://example.test/hook', secretCiphertext: 'ciphertext', eventTypes: ['matter.created'] });
    expect((await repository.listEndpoints('tenant_a')).map((endpoint) => endpoint.id)).toEqual(['endpoint_a']);
    const eventId = await repository.enqueueEvent({ tenantId: 'tenant_a', eventType: 'matter.created', payloadJson: '{"id":"matter_a"}', endpointIds: ['endpoint_a'] });
    expect(eventId).toBeTruthy();
    expect(await repository.listDeliveries('tenant_b')).toEqual([]);
    expect((await repository.listDeliveries('tenant_a'))[0].status).toBe('PENDING');
    connection.client.close();
  });

  it('permite que somente um de dois workers reivindique a entrega', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'forgelex-workers-'));
    try {
      const url = pathToFileURL(join(directory, 'workers.db')).toString();
      const leftConnection = await createDatabase({ url });
      const rightConnection = await createDatabase({ url });
      await runPersistenceMigrations(leftConnection.client);
      const left = new WebhookRepository(leftConnection.client);
      const right = new WebhookRepository(rightConnection.client);
      await left.createEndpoint({ id: 'endpoint_workers', tenantId: 'tenant_workers', url: 'https://example.test/hook', secretCiphertext: 'ciphertext', eventTypes: ['matter.created'] });
      await left.enqueueEvent({ id: 'event_workers', tenantId: 'tenant_workers', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['endpoint_workers'] });
      const deliveryId = (await left.listDeliveries('tenant_workers'))[0].id;
      const now = new Date().toISOString();

      const [a, b] = await Promise.all([left.claimDueDelivery(now), right.claimDueDelivery(now)]);

      expect([a?.id, b?.id].filter(Boolean)).toEqual([deliveryId]);
      leftConnection.client.close();
      rightConnection.client.close();
    } finally {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* SQLite pode manter o arquivo bloqueado até o worker terminar. */ }
    }
  });

  it('recupera lease expirada após reabrir o banco, mas nunca uma entrega concluída', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'forgelex-outbox-'));
    const url = pathToFileURL(join(directory, 'outbox.db')).toString();
    try {
      const firstConnection = await createDatabase({ url });
      await runPersistenceMigrations(firstConnection.client);
      const first = new WebhookRepository(firstConnection.client);
      await first.createEndpoint({ id: 'endpoint_lease', tenantId: 'tenant_lease', url: 'https://example.test/hook', secretCiphertext: 'ciphertext', eventTypes: ['matter.created'] });
      await first.enqueueEvent({ id: 'event_lease', tenantId: 'tenant_lease', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['endpoint_lease'] });
      const claimed = await first.claimDueDelivery('2099-01-01T00:00:00.000Z', 1_000);
      expect(claimed?.status).toBe('DELIVERING');
      firstConnection.client.close();

      const secondConnection = await createDatabase({ url });
      const second = new WebhookRepository(secondConnection.client);
      const recovered = await second.claimDueDelivery('2099-01-01T00:00:02.000Z', 1_000);
      expect(recovered?.id).toBe(claimed?.id);
      await second.markDelivered(recovered!.id, 204, recovered!.claimToken);
      expect(await second.claimDueDelivery('2099-01-01T00:00:04.000Z', 1_000)).toBeUndefined();
      secondConnection.client.close();
    } finally {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* SQLite pode manter o arquivo bloqueado até o worker terminar. */ }
    }
  });
  it('limits concurrent replicas to four global and one per tenant, with lease recovery', async () => {
    const connection = await createDatabase({ url: 'file::memory:' });
    await runPersistenceMigrations(connection.client);
    const repository = new WebhookRepository(connection.client);
    for (let i = 0; i < 6; i++) {
      const tenantId = `tenant_${i}`;
      await repository.createEndpoint({ id: tenantId, tenantId, url: 'https://example.test', secretCiphertext: 'secret', eventTypes: ['matter.created'] });
      for (let n = 0; n < 2; n++) await repository.enqueueEvent({ tenantId, eventType: 'matter.created', payloadJson: '{}', endpointIds: [tenantId] });
    }
    const claims = [];
    for (let i = 0; i < 6; i++) claims.push(await repository.claimDueDelivery('2099-01-01T00:00:00.000Z', 1000));
    const active = claims.filter((claim) => claim !== undefined);
    expect(active).toHaveLength(4);
    expect(new Set(active.map((claim) => claim.tenantId)).size).toBe(4);
    await repository.markDelivered(active[0]!.id, 204, active[0]!.claimToken);
    const fair = await repository.claimDueDelivery('2099-01-01T00:00:00.500Z', 1000);
    expect(fair).toBeDefined();
    expect(active.map((claim) => claim.tenantId)).not.toContain(fair!.tenantId);
    expect(await repository.claimDueDelivery('2099-01-01T00:00:02.000Z', 1000)).toBeDefined();
    connection.client.close();
  });

  it('busca uma entrega por id dentro do tenant e filtra a listagem por vários destinos', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    await runPersistenceMigrations(connection.client);
    const repository = new WebhookRepository(connection.client);
    const base = { url: 'https://example.test/hook', secretCiphertext: 'ciphertext', eventTypes: ['matter.created'] };
    await repository.createEndpoint({ ...base, id: 'lookup_a1', tenantId: 'lookup_tenant_a' });
    await repository.createEndpoint({ ...base, id: 'lookup_a2', tenantId: 'lookup_tenant_a' });
    await repository.createEndpoint({ ...base, id: 'lookup_a3', tenantId: 'lookup_tenant_a' });
    await repository.createEndpoint({ ...base, id: 'lookup_b1', tenantId: 'lookup_tenant_b' });
    await repository.enqueueEvent({ tenantId: 'lookup_tenant_a', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['lookup_a1', 'lookup_a2', 'lookup_a3'] });
    await repository.enqueueEvent({ tenantId: 'lookup_tenant_b', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['lookup_b1'] });
    const all = await repository.listDeliveries('lookup_tenant_a');
    const second = all.find((delivery) => delivery.endpointId === 'lookup_a2')!;

    expect(await repository.findDelivery('lookup_tenant_a', second.id)).toMatchObject({ id: second.id, endpointId: 'lookup_a2' });
    expect(await repository.findDelivery('lookup_tenant_b', second.id)).toBeUndefined();
    expect(await repository.findDelivery('lookup_tenant_a', 'missing')).toBeUndefined();

    expect((await repository.listDeliveries('lookup_tenant_a', ['lookup_a1', 'lookup_a3'])).map((d) => d.endpointId).sort()).toEqual(['lookup_a1', 'lookup_a3']);
    expect(await repository.listDeliveries('lookup_tenant_a', [])).toEqual([]);
    expect(await repository.listDeliveries('lookup_tenant_a', ['lookup_b1'])).toEqual([]);
    expect(await repository.listDeliveries('lookup_tenant_a', 'lookup_a2')).toHaveLength(1);
    connection.client.close();
  });
});

describe('webhook backpressure', () => {
  it('bounds tenant queue including manual requeues and rolls back refused events', async () => {
    const connection = await createDatabase({ url: 'file::memory:' });
    await runPersistenceMigrations(connection.client);
    // The per-endpoint bound would trip first with one endpoint; lift it to exercise the tenant bound on its own.
    const repository = new WebhookRepository(connection.client, { limits: { endpointQueued: 1000 } });
    await repository.createEndpoint({ id: 'endpoint', tenantId: 'tenant', url: 'https://example.test', secretCiphertext: 'secret', eventTypes: ['matter.created'] });
    for (let i = 0; i < 250; i++) await repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['endpoint'] });
    await expect(repository.enqueueEvent({ id: 'refused', tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['endpoint'] })).rejects.toThrow('WEBHOOK_QUEUE_FULL');
    expect((await connection.client.execute("SELECT id FROM webhook_events WHERE id = 'refused'")).rows).toHaveLength(0);
    const failed = (await repository.listDeliveries('tenant'))[0]!;
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET status = 'FAILED' WHERE id = ?", args: [failed.id] });
    await repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['endpoint'] });
    await expect(repository.requeue('tenant', failed.id)).rejects.toThrow('WEBHOOK_QUEUE_FULL');
    connection.client.close();
  });
});


describe('retired webhook queue cleanup', () => {
  it('revoke frees queued deliveries and refuses their requeue', async () => {
    const c = await createDatabase({ url: 'file::memory:' });
    await runPersistenceMigrations(c.client);
    const repository = new WebhookRepository(c.client, { limits: { endpointQueued: 1000 } });
    try {
      for (const id of ['old', 'new']) await repository.createEndpoint({ id, tenantId: 'tenant', url: 'https://example.test', secretCiphertext: 'secret', eventTypes: ['matter.created'] });
      for (let i = 0; i < 250; i++) await repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['old'] });
      const claimed = await repository.claimDueDelivery();
      await repository.revokeEndpoint('tenant', 'old');
      await expect(repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['new'] })).resolves.toMatchObject({ queued: 1 });
      const retired = await repository.listDeliveries('tenant', 'old');
      expect(retired.every((delivery) => delivery.status === 'FAILED')).toBe(true);
      expect(await repository.requeue('tenant', retired[0]!.id)).toBe(false);
      await repository.markDelivered(claimed!.id, 204, claimed!.claimToken);
      expect((await repository.listDeliveries('tenant', 'old')).every((delivery) => delivery.status === 'FAILED')).toBe(true);
    } finally { c.client.close(); }
  });

  it('suspend holds queued deliveries, refuses their manual requeue, and cannot fill the tenant on its own', async () => {
    const c = await createDatabase({ url: 'file::memory:' });
    await runPersistenceMigrations(c.client);
    const repository = new WebhookRepository(c.client);
    try {
      for (const id of ['old', 'new']) await repository.createEndpoint({ id, tenantId: 'tenant', url: 'https://example.test', secretCiphertext: 'secret', eventTypes: ['matter.created'] });
      for (let i = 0; i < 250; i++) await repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['old'] });
      await repository.suspendEndpoint('tenant', 'old');

      const held = (await repository.listDeliveries('tenant', 'old')).filter((delivery) => delivery.status === 'PENDING');
      expect(held).toHaveLength(100);
      await expect(repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['new'] })).resolves.toMatchObject({ queued: 1 });
      expect(await repository.requeue('tenant', (await repository.listDeliveries('tenant', 'old')).find((delivery) => delivery.status === 'FAILED')!.id)).toBe(false);
      expect(await repository.claimDueDelivery()).toMatchObject({ endpointId: 'new' });
    } finally { c.client.close(); }
  });
});

it('does not fail a business event when its endpoint was retired after the service snapshot', async () => {
  const c = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(c.client);
  const repository = new WebhookRepository(c.client);
  try {
    await repository.createEndpoint({ id: 'retired-snapshot', tenantId: 'tenant', url: 'https://example.test', secretCiphertext: 'secret', eventTypes: ['matter.created'] });
    await repository.revokeEndpoint('tenant', 'retired-snapshot');
    await expect(repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['retired-snapshot'] })).resolves.toBeTruthy();
    expect(await repository.listDeliveries('tenant')).toHaveLength(0);
  } finally { c.client.close(); }
});

describe('endpoint lifecycle and per-endpoint limits', () => {
  const open = async (limits?: ConstructorParameters<typeof WebhookRepository>[1]) => {
    const connection = await createDatabase({ url: 'file::memory:' });
    await runPersistenceMigrations(connection.client);
    const repository = new WebhookRepository(connection.client, limits);
    const endpoint = (id: string, tenantId = 'tenant') => repository.createEndpoint({ id, tenantId, url: 'https://example.test/hook', secretCiphertext: 'ciphertext', eventTypes: ['matter.created'] });
    const publish = (endpointIds: string[], tenantId = 'tenant') => repository.enqueueEvent({ tenantId, eventType: 'matter.created', payloadJson: '{}', endpointIds });
    return { connection, repository, endpoint, publish };
  };

  it('keeps the queued deliveries of a suspended endpoint instead of cancelling them, and does not claim them', async () => {
    const { connection, repository, endpoint, publish } = await open();
    await endpoint('e1');
    await publish(['e1']);

    await repository.suspendEndpoint('tenant', 'e1');

    expect((await repository.listDeliveries('tenant')).map((delivery) => delivery.status)).toEqual(['PENDING']);
    expect(await repository.claimDueDelivery()).toBeUndefined();
    connection.client.close();
  });

  it('reactivates a suspended endpoint and resumes its held deliveries at once', async () => {
    const { connection, repository, endpoint, publish } = await open();
    await endpoint('e1');
    await publish(['e1']);
    await repository.suspendEndpoint('tenant', 'e1');
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET status = 'RETRYING', next_attempt_at = '2099-01-01T00:00:00.000Z'", args: [] });

    expect(await repository.reactivateEndpoint('tenant', 'e1')).toBe(true);

    const reactivated = await repository.findEndpoint('tenant', 'e1');
    expect(reactivated).toMatchObject({ status: 'ACTIVE' });
    expect(reactivated?.lastError).toBeUndefined();
    expect(await repository.claimDueDelivery()).toMatchObject({ endpointId: 'e1' });
    connection.client.close();
  });

  it.each([
    ['an active endpoint', async (r: WebhookRepository) => r.reactivateEndpoint('tenant', 'e1')],
    ['an endpoint of another tenant', async (r: WebhookRepository) => { await r.suspendEndpoint('tenant', 'e1'); return r.reactivateEndpoint('other', 'e1'); }],
    ['a revoked endpoint', async (r: WebhookRepository) => { await r.revokeEndpoint('tenant', 'e1'); return r.reactivateEndpoint('tenant', 'e1'); }],
    ['an unknown endpoint', async (r: WebhookRepository) => r.reactivateEndpoint('tenant', 'missing')],
  ])('does not reactivate %s', async (_name, act) => {
    const { connection, repository, endpoint } = await open();
    await endpoint('e1');

    expect(await act(repository)).toBe(false);
    connection.client.close();
  });

  it('cancels only the revoked endpoint\'s deliveries, including those held while suspended', async () => {
    const { connection, repository, endpoint, publish } = await open();
    await endpoint('e1');
    await endpoint('e2');
    await publish(['e1', 'e2']);
    await repository.suspendEndpoint('tenant', 'e1');

    expect(await repository.revokeEndpoint('tenant', 'e1')).toBe(true);

    const byEndpoint = Object.fromEntries((await repository.listDeliveries('tenant')).map((delivery) => [delivery.endpointId, delivery]));
    expect(byEndpoint.e1).toMatchObject({ status: 'FAILED', lastError: 'WEBHOOK_ENDPOINT_INACTIVE' });
    expect(byEndpoint.e2).toMatchObject({ status: 'PENDING' });
    connection.client.close();
  });

  it('records the overflow of one full endpoint as a replayable FAILED delivery and still queues the others', async () => {
    const { connection, repository, endpoint, publish } = await open({ limits: { endpointQueued: 2 } });
    await endpoint('bad');
    await endpoint('good');
    await publish(['bad']);
    await publish(['bad']);

    const result = await publish(['bad', 'good']);

    expect(result).toMatchObject({ queued: 1, overflowed: 1 });
    const deliveries = await repository.listDeliveries('tenant');
    expect(deliveries.filter((d) => d.endpointId === 'bad').map((d) => d.status).sort()).toEqual(['FAILED', 'PENDING', 'PENDING']);
    expect(deliveries.find((d) => d.endpointId === 'bad' && d.status === 'FAILED')).toMatchObject({ attemptCount: 0, lastError: 'WEBHOOK_QUEUE_FULL' });
    expect(deliveries.filter((d) => d.endpointId === 'good')).toHaveLength(1);
    const events = await connection.client.execute({ sql: 'SELECT id FROM webhook_events WHERE id = ?', args: [result.id] });
    expect(events.rows).toHaveLength(1);
    connection.client.close();
  });

  it('lets an overflowed delivery be requeued once its endpoint has room again', async () => {
    const { connection, repository, endpoint, publish } = await open({ limits: { endpointQueued: 1 } });
    await endpoint('bad');
    await publish(['bad']);
    await publish(['bad']);
    const overflowed = (await repository.listDeliveries('tenant')).find((delivery) => delivery.status === 'FAILED')!;

    await expect(repository.requeue('tenant', overflowed.id)).rejects.toThrow('WEBHOOK_QUEUE_FULL');
    await connection.client.execute({ sql: "UPDATE webhook_deliveries SET status = 'DELIVERED' WHERE status = 'PENDING'", args: [] });

    expect(await repository.requeue('tenant', overflowed.id)).toBe(true);
    connection.client.close();
  });

  it('reports what an enqueue did, and stores nothing when no endpoint is active', async () => {
    const { connection, repository, endpoint, publish } = await open();
    await endpoint('e1');
    await repository.revokeEndpoint('tenant', 'e1');

    const result = await publish(['e1']);

    expect(result).toMatchObject({ queued: 0, overflowed: 0 });
    expect((await connection.client.execute({ sql: 'SELECT id FROM webhook_events WHERE id = ?', args: [result.id] })).rows).toHaveLength(0);
    expect(await publish([])).toMatchObject({ queued: 0, overflowed: 0 });
    connection.client.close();
  });

  it('takes the concurrency and lease limits from its configuration', async () => {
    const { connection, repository, endpoint, publish } = await open({ limits: { concurrentDeliveries: 1 } });
    for (const tenant of ['t1', 't2']) {
      await endpoint(`e_${tenant}`, tenant);
      await publish([`e_${tenant}`], tenant);
    }

    expect(await repository.claimDueDelivery('2099-01-01T00:00:00.000Z', 1000)).toBeDefined();
    expect(await repository.claimDueDelivery('2099-01-01T00:00:00.100Z', 1000)).toBeUndefined();
    connection.client.close();
  });
});
