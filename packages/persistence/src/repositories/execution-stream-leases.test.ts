import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { ExecutionStreamLeases } from './execution-stream-leases.js';
const close: (() => void)[] = [];
afterEach(() => close.splice(0).forEach((fn) => fn()));
async function fixture() {
  const { client } = await createDatabase({ url: 'file::memory:' });
  close.push(() => client.close());
  await runPersistenceMigrations(client);
  let now = 1000;
  return {
    a: new ExecutionStreamLeases(client, () => now),
    b: new ExecutionStreamLeases(client, () => now),
    advance: (ms = 30001) => {
      now += ms;
    },
  };
}
const owner = { tenantId: 'tenant', userId: 'user' };
describe('persistent execution stream admission', () => {
  it('enforces two per user/execution across instances and releases idempotently', async () => {
    const f = await fixture();
    const first = await f.a.acquire(owner, 'execution');
    await f.b.acquire(owner, 'execution');
    await expect(f.a.acquire(owner, 'execution')).rejects.toThrow('STREAM_LIMIT_EXCEEDED');
    await f.a.release(first);
    await f.a.release(first);
    await expect(f.b.acquire(owner, 'execution')).resolves.toBeTypeOf('string');
  });
  it('enforces five per user across executions and twenty per tenant across users', async () => {
    const f = await fixture();
    for (let i = 0; i < 5; i++) await f.a.acquire(owner, String(i));
    await expect(f.b.acquire(owner, 'new')).rejects.toThrow('STREAM_LIMIT_EXCEEDED');
    await expect(f.b.acquire({ ...owner, tenantId: 'another' }, 'new')).rejects.toThrow('STREAM_LIMIT_EXCEEDED');
    for (let i = 0; i < 15; i++) await f.b.acquire({ ...owner, userId: `user-${i}` }, 'execution');
    await expect(f.a.acquire({ ...owner, userId: 'new' }, 'execution')).rejects.toThrow('STREAM_LIMIT_EXCEEDED');
    await expect(f.a.acquire({ tenantId: 'other', userId: 'other' }, 'execution')).resolves.toBeTypeOf('string');
  });
  it('expires crashed connections, refuses resurrection and renews live leases', async () => {
    const f = await fixture();
    const first = await f.a.acquire(owner, 'execution');
    await f.b.acquire(owner, 'execution');
    expect(await f.a.renew(first)).toBe(true);
    f.advance();
    expect(await f.a.renew(first)).toBe(false);
    await expect(f.b.acquire(owner, 'execution')).resolves.toBeTypeOf('string');
  });
  it('extends a live deadline and rejects renewal at the exact expiration boundary', async () => {
    const f = await fixture();
    const id = await f.a.acquire(owner, 'execution');
    f.advance(20_000);
    expect(await f.b.renew(id)).toBe(true);
    f.advance(15_000);
    expect(await f.a.renew(id)).toBe(true);
    f.advance(30_000);
    expect(await f.b.renew(id)).toBe(false);
  });
});

describe('lease renewal', () => {
  const open = async () => {
    const { client } = await createDatabase({ url: 'file::memory:' });
    close.push(() => client.close());
    await runPersistenceMigrations(client);
    let now = 1000;
    return {
      client,
      leases: new ExecutionStreamLeases(client, () => now),
      advance: (ms: number) => {
        now += ms;
      },
    };
  };

  it('does not open a transaction or take the global admission lock', async () => {
    const f = await open();
    const id = await f.leases.acquire(owner, 'execution');
    const transaction = vi.spyOn(f.client, 'transaction');

    expect(await f.leases.renew(id)).toBe(true);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('extends a live lease, and refuses an expired or unknown one', async () => {
    const f = await open();
    const id = await f.leases.acquire(owner, 'execution');
    f.advance(20_000);
    expect(await f.leases.renew(id)).toBe(true);
    f.advance(25_000);
    expect(await f.leases.renew(id)).toBe(true);
    f.advance(31_000);

    expect(await f.leases.renew(id)).toBe(false);
    expect(await f.leases.renew('unknown')).toBe(false);
  });
});
