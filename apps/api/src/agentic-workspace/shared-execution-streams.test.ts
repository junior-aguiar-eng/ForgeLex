import { afterEach, expect, it, vi } from 'vitest';
import { SharedExecutionStreams, reserveProcessStream } from './shared-execution-streams.js';
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
