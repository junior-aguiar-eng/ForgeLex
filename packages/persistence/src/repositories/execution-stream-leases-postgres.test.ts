import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { ExecutionStreamLeases } from './execution-stream-leases.js';
import type { Client } from '@libsql/client';
const url = process.env.SSE_TEST_POSTGRES_ADMIN_URL;
describe.skipIf(!url)('PostgreSQL stream leases across replicas', () => {
  let admin: ReturnType<typeof postgres>, first: Client, second: Client;
  let a: ExecutionStreamLeases, b: ExecutionStreamLeases;
  const database = `forgelex_sse_${process.pid}_${Date.now()}`;
  beforeAll(async () => {
    admin = postgres(url!, { max: 1 });
    await admin.unsafe(`CREATE DATABASE "${database}"`);
    const connection = new URL(url!);
    connection.pathname = `/${database}`;
    first = (await createDatabase({ url: connection.toString() })).client;
    second = (await createDatabase({ url: connection.toString() })).client;
    await runPersistenceMigrations(first);
    a = new ExecutionStreamLeases(first);
    b = new ExecutionStreamLeases(second);
  });
  afterAll(async () => {
    first?.close();
    second?.close();
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      await admin.end();
    }
  });
  it('atomically admits exactly two connections to one execution during a replica race', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 ? a : b).acquire({ tenantId: 'same', userId: 'execution-user' }, 'execution'),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(8);
  });
  it('atomically limits users to five and tenants to twenty', async () => {
    const user = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 ? a : b).acquire({ tenantId: 'user-limit', userId: 'limited-user' }, `e${i}`),
      ),
    );
    expect(user.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    await expect(a.acquire({ tenantId: 'another', userId: 'limited-user' }, 'new')).rejects.toThrow(
      'STREAM_LIMIT_EXCEEDED',
    );
    const tenant = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        (i % 2 ? a : b).acquire({ tenantId: 'tenant-limit', userId: `u${i}` }, 'execution'),
      ),
    );
    expect(tenant.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
  });
  it('uses database time, renews live leases, releases and recovers crashed leases', async () => {
    const owner = { tenantId: 'crash', userId: 'crash-user' };
    const skewed = new ExecutionStreamLeases(first, () => 0);
    const id = await skewed.acquire(owner, 'execution');
    expect(await skewed.renew(id)).toBe(true);
    await b.acquire(owner, 'execution');
    await first.execute({ sql: 'UPDATE execution_stream_leases SET expires_at = 0 WHERE id = ?', args: [id] });
    expect(await a.renew(id)).toBe(false);
    const recovered = await b.acquire(owner, 'execution');
    await a.release(recovered);
    await expect(a.acquire(owner, 'execution')).resolves.toBeTypeOf('string');
  });
});
