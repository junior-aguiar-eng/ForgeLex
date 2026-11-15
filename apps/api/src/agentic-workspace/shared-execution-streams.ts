let processStreams = 0;
export function reserveProcessStream(): () => void {
  if (processStreams >= 100) throw new Error('STREAM_LIMIT_EXCEEDED');
  processStreams++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      processStreams--;
    }
  };
}
interface Batch<E> {
  events: E[];
  cursor: number;
  terminal: boolean;
}
interface Source<E> {
  changed(after: number): Promise<boolean>;
  read(after: number): Promise<Batch<E>>;
}
interface Subscriber<E> {
  cursor: number;
  prepare(): Promise<boolean>;
  send(batch: Batch<E>): void;
  keepalive(): void;
  fail(error: unknown): void;
}
interface Group<E> {
  source: Source<E>;
  subscribers: Set<Subscriber<E>>;
  timer?: ReturnType<typeof setTimeout>;
}
export const STREAM_CALL_TIMEOUT_MS = 10_000;
/** A group is private to one tenant, user and execution: a poll never serves another identity. */
export function executionStreamKey(identity: { tenantId: string; userId: string }, executionId: string): string {
  return JSON.stringify([identity.tenantId, identity.userId, executionId]);
}
/** Rejects with STREAM_CALL_TIMEOUT when the call does not settle; a hung call never freezes a shared poll. */
async function bounded<T>(ms: number, call: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('STREAM_CALL_TIMEOUT')), ms);
    timer.unref?.();
  });
  try {
    return await Promise.race([call(), expired]);
  } finally {
    clearTimeout(timer);
  }
}
/** One serialized poll per tenant/user/execution. Authentication remains a separate subscriber operation. */
export class SharedExecutionStreams<E extends { sequence: number } = { sequence: number }> {
  private readonly groups = new Map<string, Group<E>>();
  private readonly callTimeoutMs: number;
  constructor(
    private readonly ms: number,
    options: { callTimeoutMs?: number } = {},
  ) {
    this.callTimeoutMs = options.callTimeoutMs ?? STREAM_CALL_TIMEOUT_MS;
  }
  subscribe(key: string, source: Source<E>, subscriber: Subscriber<E>): () => void {
    let group = this.groups.get(key);
    if (!group) {
      group = { source, subscribers: new Set() };
      this.groups.set(key, group);
      this.schedule(key, group);
    }
    group.subscribers.add(subscriber);
    const current = group;
    return () => this.drop(key, current, subscriber);
  }
  private drop(key: string, group: Group<E>, subscriber: Subscriber<E>) {
    group.subscribers.delete(subscriber);
    if (!group.subscribers.size) {
      if (group.timer) clearTimeout(group.timer);
      if (this.groups.get(key) === group) this.groups.delete(key);
    }
  }
  /** A failed subscriber is finished: it leaves the group instead of failing again on every cycle. */
  private fail(key: string, group: Group<E>, subscriber: Subscriber<E>, error: unknown) {
    this.drop(key, group, subscriber);
    try {
      subscriber.fail(error);
    } catch {
      // A subscriber that cannot even report its failure is already gone.
    }
  }
  private schedule(key: string, group: Group<E>) {
    group.timer = setTimeout(() => void this.poll(key, group), this.ms);
    group.timer.unref();
  }
  private async poll(key: string, group: Group<E>) {
    try {
      await this.cycle(key, group);
    } finally {
      // Whatever happens inside a cycle, a group that still has subscribers keeps being polled.
      if (group.subscribers.size && this.groups.get(key) === group) this.schedule(key, group);
    }
  }
  private async cycle(key: string, group: Group<E>) {
    const prepared = await Promise.all(
      [...group.subscribers].map(async (subscriber) => {
        try {
          return (await bounded(this.callTimeoutMs, () => subscriber.prepare())) ? subscriber : undefined;
        } catch (error) {
          this.fail(key, group, subscriber, error);
          return undefined;
        }
      }),
    );
    let pending = prepared.filter(
      (subscriber): subscriber is Subscriber<E> => !!subscriber && group.subscribers.has(subscriber),
    );
    while (pending.length) {
      const base = Math.min(...pending.map((subscriber) => subscriber.cursor));
      let batch: Batch<E> | undefined;
      try {
        batch = (await bounded(this.callTimeoutMs, () => group.source.changed(base)))
          ? await bounded(this.callTimeoutMs, () => group.source.read(base))
          : undefined;
      } catch (error) {
        for (const subscriber of pending) this.fail(key, group, subscriber, error);
        return;
      }
      // One read serves every subscriber its page covers; a subscriber far ahead gets its own read next.
      const covered = (subscriber: Subscriber<E>) =>
        !batch ||
        subscriber.cursor <= base ||
        subscriber.cursor < batch.cursor ||
        batch.terminal ||
        batch.events.length === 0;
      const served = pending.filter(covered);
      pending = pending.filter((subscriber) => !served.includes(subscriber));
      for (const subscriber of served) {
        if (!group.subscribers.has(subscriber)) continue;
        try {
          if (batch)
            subscriber.send({
              ...batch,
              events: batch.events.filter((event) => event.sequence > subscriber.cursor),
              cursor: Math.max(subscriber.cursor, batch.cursor),
            });
          subscriber.keepalive();
        } catch (error) {
          this.fail(key, group, subscriber, error);
        }
      }
      pending = pending.filter((subscriber) => group.subscribers.has(subscriber));
    }
  }
}
