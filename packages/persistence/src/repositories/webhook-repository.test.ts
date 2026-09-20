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
      await second.markDelivered(recovered!.id, 204, '');
      expect(await second.claimDueDelivery('2099-01-01T00:00:04.000Z', 1_000)).toBeUndefined();
      secondConnection.client.close();
    } finally {
      try { rmSync(directory, { recursive: true, force: true }); } catch { /* SQLite pode manter o arquivo bloqueado até o worker terminar. */ }
    }
  });
});
