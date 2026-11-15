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
    const repository = new WebhookRepository(connection.client);
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
  it.each(['revoke', 'suspend'] as const)('%s frees queued deliveries and refuses their requeue', async (action) => {
    const c = await createDatabase({ url: 'file::memory:' });
    await runPersistenceMigrations(c.client);
    const repository = new WebhookRepository(c.client);
    try {
      for (const id of ['old', 'new']) await repository.createEndpoint({ id, tenantId: 'tenant', url: 'https://example.test', secretCiphertext: 'secret', eventTypes: ['matter.created'] });
      for (let i = 0; i < 250; i++) await repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['old'] });
      const claimed = await repository.claimDueDelivery();
      if (action === 'revoke') await repository.revokeEndpoint('tenant', 'old'); else await repository.suspendEndpoint('tenant', 'old');
      await expect(repository.enqueueEvent({ tenantId: 'tenant', eventType: 'matter.created', payloadJson: '{}', endpointIds: ['new'] })).resolves.toBeTruthy();
      const retired = await repository.listDeliveries('tenant', 'old');
      expect(retired.every((delivery) => delivery.status === 'FAILED')).toBe(true);
      expect(await repository.requeue('tenant', retired[0]!.id)).toBe(false);
      await repository.markDelivered(claimed!.id, 204, claimed!.claimToken);
      expect((await repository.listDeliveries('tenant', 'old')).every((delivery) => delivery.status === 'FAILED')).toBe(true);
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
