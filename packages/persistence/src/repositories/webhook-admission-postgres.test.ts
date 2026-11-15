import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { WebhookRepository } from './webhook-repository.js';

describe.skipIf(!process.env.S4_POSTGRES_ADMIN_URL)('webhook admission PostgreSQL', () => {
  it('enforces global and tenant limits across replicas, fences stale workers and releases capacity', async () => {
    const adminUrl = process.env.S4_POSTGRES_ADMIN_URL!;
    const admin = postgres(adminUrl);
    const name = `forgelex_s4_${randomUUID().replaceAll('-', '')}`;
    await admin.unsafe(`CREATE DATABASE ${name}`);
    const url = new URL(adminUrl);
    url.pathname = `/${name}`;
    const connections = await Promise.all(Array.from({ length: 8 }, () => createDatabase({ url: url.toString() })));
    try {
      await runPersistenceMigrations(connections[0]!.client);
      const repositories = connections.map(({ client }) => new WebhookRepository(client));
      const repository = repositories[0]!;
      for (let i = 0; i < 6; i++) {
        const tenantId = `tenant_${i}`;
        await repository.createEndpoint({
          id: tenantId,
          tenantId,
          url: 'https://example.test',
          secretCiphertext: 'secret',
          eventTypes: ['matter.created'],
        });
        for (let n = 0; n < 2; n++)
          await repository.enqueueEvent({
            tenantId,
            eventType: 'matter.created',
            payloadJson: '{}',
            endpointIds: [tenantId],
          });
      }
      const claims = (
        await Promise.all(repositories.map((repo) => repo.claimDueDelivery('2099-01-01T00:00:00.000Z', 1000)))
      ).filter((claim) => claim !== undefined);
      expect(claims).toHaveLength(4);
      expect(new Set(claims.map((claim) => claim.tenantId)).size).toBe(4);
      const first = claims[0]!;
      await repository.markDelivered(first.id, 204, first.claimToken);
      expect(await repository.claimDueDelivery('2099-01-01T00:00:00.500Z', 1000)).toBeDefined();
      const old = claims[1]!;
      await connections[0]!.client.execute({
        sql: "UPDATE webhook_deliveries SET next_attempt_at = '2100-01-01T00:00:00.000Z' WHERE id <> ?",
        args: [old.id],
      });
      const recovered = await repository.claimDueDelivery('2099-01-01T00:00:02.000Z', 1000);
      expect(recovered?.id).toBe(old.id);
      await repository.markDelivered(old.id, 200, old.claimToken);
      expect((await repository.listDeliveries(old.tenantId)).find((delivery) => delivery.id === old.id)?.status).toBe(
        'DELIVERING',
      );
      await repository.markDelivered(recovered!.id, 204, recovered!.claimToken);
    } finally {
      for (const { client } of connections) client.close();
      await admin.unsafe(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    }
  }, 30_000);
});
