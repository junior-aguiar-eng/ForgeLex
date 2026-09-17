import { describe, expect, it } from 'vitest';
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
});
