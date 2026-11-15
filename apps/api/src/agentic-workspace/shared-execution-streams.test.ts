import { afterEach, describe, expect, it, vi } from 'vitest';
import { SharedExecutionStreams, executionStreamKey, reserveProcessStream } from './shared-execution-streams.js';
afterEach(() => vi.useRealTimers());
it('caps streams at 100 per process, releases capacity and cannot double release', () => {
  const releases = Array.from({ length: 100 }, () => reserveProcessStream());
  expect(() => reserveProcessStream()).toThrow('STREAM_LIMIT_EXCEEDED');
  releases[0]();
  releases[0]();
  const last = reserveProcessStream();
  expect(() => reserveProcessStream()).toThrow('STREAM_LIMIT_EXCEEDED');
  releases.forEach((fn) => fn());
  last();
});
it('shares polling, preserves individual cursors and skips revoked subscribers', async () => {
  vi.useFakeTimers();
  let reads = 0,
    snapshots = 0,
    active = true;
  const poller = new SharedExecutionStreams(1000);
  const source = {
    changed: async () => {
      reads++;
      return true;
    },
    read: async () => {
      snapshots++;
      return { events: [{ sequence: 2 }, { sequence: 3 }], cursor: 3, terminal: false };
    },
  };
  const received: number[][] = [[], []];
  const a = {
    cursor: 1,
    prepare: async () => active,
    send: (b: { events: { sequence: number }[]; cursor: number }) => {
      received[0].push(...b.events.map((e) => e.sequence));
      a.cursor = b.cursor;
    },
    keepalive: () => {},
    fail: () => {},
  };
  const b = {
    ...a,
    cursor: 2,
    prepare: async () => true,
    send: (batch: { events: { sequence: number }[]; cursor: number }) => {
      received[1].push(...batch.events.map((e) => e.sequence));
      b.cursor = batch.cursor;
    },
  };
  const stopA = poller.subscribe('tenant/execution', source, a),
    stopB = poller.subscribe('tenant/execution', source, b);
  await vi.advanceTimersByTimeAsync(1000);
  expect(reads).toBe(1);
  expect(snapshots).toBe(1);
  expect(received).toEqual([[2, 3], [3]]);
  active = false;
  await vi.advanceTimersByTimeAsync(1000);
  expect(received[0]).toEqual([2, 3]);
  stopA();
  stopB();
  await vi.advanceTimersByTimeAsync(3000);
  expect(reads).toBe(2);
});
it('separates tenants, serializes slow polls and stops after the last subscriber leaves', async () => {
  vi.useFakeTimers();
  let finish!: (value: boolean) => void,
    calls = 0;
  const streams = new SharedExecutionStreams(1000);
  const source = {
    changed: () => {
      calls++;
      return new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    },
    read: async () => ({ events: [], cursor: 0, terminal: false }),
  };
  const subscriber = { cursor: 0, prepare: async () => true, send: () => {}, keepalive: () => {}, fail: () => {} };
  const stop = streams.subscribe('a/id', source, subscriber);
  await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(5000);
  expect(calls).toBe(1);
  stop();
  finish(false);
  await vi.advanceTimersByTimeAsync(3000);
  expect(calls).toBe(1);
});

it('does not share polling across tenants with an identical execution id', async () => {
  vi.useFakeTimers();
  const streams = new SharedExecutionStreams(1000);
  const calls = [0, 0];
  const source = (tenant: number) => ({
    changed: async () => {
      calls[tenant]++;
      return false;
    },
    read: async () => ({ events: [], cursor: 0, terminal: false }),
  });
  const subscriber = () => ({
    cursor: 0,
    prepare: async () => true,
    send: () => {},
    keepalive: () => {},
    fail: () => {},
  });
  const first = streams.subscribe('tenant-a/id', source(0), subscriber());
  const second = streams.subscribe('tenant-b/id', source(1), subscriber());
  await vi.advanceTimersByTimeAsync(1000);
  expect(calls).toEqual([1, 1]);
  first();
  second();
});

type Event = { sequence: number };
type Batch = { events: Event[]; cursor: number; terminal: boolean };
const subscriber = (overrides: Record<string, unknown> = {}) => {
  const got: number[] = [];
  const state = { terminal: false, failures: [] as unknown[], keepalives: 0 };
  const value = {
    cursor: 0,
    prepare: async () => true,
    send: (batch: Batch) => {
      got.push(...batch.events.map((event) => event.sequence));
      value.cursor = batch.cursor;
      if (batch.terminal) state.terminal = true;
    },
    keepalive: () => {
      state.keepalives++;
    },
    fail: (error: unknown) => {
      state.failures.push(error);
    },
    ...overrides,
  };
  return { value, got, state };
};
/** Pages of 100 like the real store: terminal only when the page is not full. */
const pagedSource = (last: number) => ({
  changed: async () => true,
  read: async (after: number): Promise<Batch> => {
    const events = Array.from({ length: Math.min(100, Math.max(0, last - after)) }, (_, index) => ({
      sequence: after + index + 1,
    }));
    return { events, cursor: events.at(-1)?.sequence ?? after, terminal: events.length < 100 };
  },
});
const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('a subscriber that never answers', () => {
  it('fails that subscriber on a timeout and keeps serving the healthy ones', async () => {
    const streams = new SharedExecutionStreams(10, { callTimeoutMs: 30 });
    const hung = subscriber({ prepare: () => new Promise<boolean>(() => undefined) });
    const healthy = subscriber();
    streams.subscribe('k', pagedSource(2), hung.value);
    streams.subscribe('k', pagedSource(2), healthy.value);

    await settle(250);

    expect(hung.state.failures).toHaveLength(1);
    expect(String((hung.state.failures[0] as Error).message)).toBe('STREAM_CALL_TIMEOUT');
    expect(healthy.got).toEqual([1, 2]);
    expect(healthy.state.keepalives).toBeGreaterThan(1);
  });

  it('keeps polling after a timeout, so later events still arrive', async () => {
    const streams = new SharedExecutionStreams(10, { callTimeoutMs: 30 });
    let last = 1;
    const source = {
      changed: async () => true,
      read: async (after: number): Promise<Batch> => ({
        events: after < last ? [{ sequence: last }] : [],
        cursor: Math.max(after, last),
        terminal: false,
      }),
    };
    const hung = subscriber({ prepare: () => new Promise<boolean>(() => undefined) });
    const healthy = subscriber();
    streams.subscribe('k', source, hung.value);
    streams.subscribe('k', source, healthy.value);
    await settle(120);
    last = 5;

    await settle(120);

    expect(healthy.got).toContain(5);
  });

  it('fails the subscribers of a source read that never answers instead of waiting forever', async () => {
    const streams = new SharedExecutionStreams(10, { callTimeoutMs: 30 });
    const a = subscriber();
    streams.subscribe(
      'k',
      {
        changed: () => new Promise<boolean>(() => undefined),
        read: async () => ({ events: [], cursor: 0, terminal: false }),
      },
      a.value,
    );

    await settle(150);

    expect(a.state.failures.length).toBeGreaterThan(0);
    expect(String((a.state.failures[0] as Error).message)).toBe('STREAM_CALL_TIMEOUT');
  });
});

describe('slow authentication rechecks', () => {
  it('run at the same time, so a cycle lasts as long as the slowest, not the sum', async () => {
    const streams = new SharedExecutionStreams(1);
    const slow = () =>
      subscriber({
        prepare: async () => {
          await settle(100);
          return true;
        },
      });
    const subscribers = Array.from({ length: 4 }, slow);
    for (const s of subscribers) streams.subscribe('k', pagedSource(0), s.value);

    await settle(1000);

    // Serial prepares allow about 2.5 cycles in a second (4 x 100 ms each); concurrent ones allow about 9.
    expect(subscribers[0]!.state.keepalives).toBeGreaterThanOrEqual(6);
  });
});

describe('a subscriber far behind the others', () => {
  it('does not hold back an up-to-date subscriber or delay its terminal event', async () => {
    const streams = new SharedExecutionStreams(10);
    // 5,000 events take the lagging subscriber about fifty pages (fifty poll cycles) to read.
    const behind = subscriber({ cursor: 0 });
    const current = subscriber({ cursor: 4990 });
    streams.subscribe('k', pagedSource(5000), behind.value);
    streams.subscribe('k', pagedSource(5000), current.value);

    await settle(60);

    expect(current.got).toEqual(Array.from({ length: 10 }, (_, index) => 4991 + index));
    expect(current.state.terminal).toBe(true);
    expect(behind.got.slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('still shares one read between subscribers that one page covers', async () => {
    const streams = new SharedExecutionStreams(10);
    const reads: number[] = [];
    const source = {
      changed: async () => true,
      read: async (after: number): Promise<Batch> => {
        reads.push(after);
        return { events: [{ sequence: 3 }, { sequence: 4 }], cursor: 4, terminal: false };
      },
    };
    streams.subscribe('k', source, subscriber({ cursor: 1 }).value);
    streams.subscribe('k', source, subscriber({ cursor: 2 }).value);

    await settle(25);

    expect(reads.slice(0, 1)).toEqual([1]);
    expect(reads.filter((cursor) => cursor === 2)).toHaveLength(0);
  });
});

describe('stream groups', () => {
  it('are keyed by tenant, user and execution, never by the execution alone', () => {
    const a = executionStreamKey({ tenantId: 't', userId: 'u1' }, 'e');

    expect(executionStreamKey({ tenantId: 't', userId: 'u1' }, 'e')).toBe(a);
    expect(executionStreamKey({ tenantId: 't', userId: 'u2' }, 'e')).not.toBe(a);
    expect(executionStreamKey({ tenantId: 't2', userId: 'u1' }, 'e')).not.toBe(a);
    expect(executionStreamKey({ tenantId: 't', userId: 'u1' }, 'e2')).not.toBe(a);
  });
});
