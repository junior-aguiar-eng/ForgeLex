import { describe, expect, it } from 'vitest';
import { KeyedMutex } from './keyed-mutex.js';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('KeyedMutex', () => {
  it('runs tasks for the same key one at a time, in arrival order', async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const gate = deferred();

    const first = mutex.run('tenant', async () => {
      log.push('first:start');
      await gate.promise;
      log.push('first:end');
    });
    const second = mutex.run('tenant', async () => {
      log.push('second:start');
      log.push('second:end');
    });
    const third = mutex.run('tenant', async () => {
      log.push('third');
    });
    await Promise.resolve();
    expect(log).toEqual(['first:start']);

    gate.resolve();
    await Promise.all([first, second, third]);
    expect(log).toEqual(['first:start', 'first:end', 'second:start', 'second:end', 'third']);
  });

  it('lets tasks for different keys run at the same time', async () => {
    const mutex = new KeyedMutex();
    const log: string[] = [];
    const gate = deferred();

    const slow = mutex.run('tenant_a', async () => {
      log.push('a:start');
      await gate.promise;
      log.push('a:end');
    });
    const other = mutex.run('tenant_b', async () => {
      log.push('b');
    });
    await other;
    expect(log).toEqual(['a:start', 'b']);

    gate.resolve();
    await slow;
  });

  it('returns the task result to its own caller', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.run('tenant', async () => 42)).resolves.toBe(42);
  });

  it('releases the key when a task throws, failing only that caller', async () => {
    const mutex = new KeyedMutex();
    const failing = mutex.run('tenant', async () => {
      throw new Error('boom');
    });
    const next = mutex.run('tenant', async () => 'ran');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ran');
  });

  it('keeps no state for a key once nothing is waiting on it', async () => {
    const mutex = new KeyedMutex();
    expect(mutex.size).toBe(0);

    const first = mutex.run('tenant', async () => undefined);
    const second = mutex.run('tenant', async () => undefined);
    const other = mutex.run('other', async () => undefined);
    expect(mutex.size).toBe(2);

    await Promise.all([first, second, other]);
    expect(mutex.size).toBe(0);
    await mutex
      .run('tenant', async () => {
        throw new Error('boom');
      })
      .catch(() => undefined);
    expect(mutex.size).toBe(0);
  });

  it('does not share locks between instances, so one service cannot block another for the same key', async () => {
    const first = new KeyedMutex();
    const second = new KeyedMutex();
    const gate = deferred();

    const held = first.run('tenant', async () => {
      await gate.promise;
    });
    await expect(second.run('tenant', async () => 'not blocked')).resolves.toBe('not blocked');

    gate.resolve();
    await held;
  });
});
