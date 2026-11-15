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
/** One serialized poll per tenant/execution. Authentication remains a separate subscriber operation. */
export class SharedExecutionStreams<E extends { sequence: number } = { sequence: number }> {
  private readonly groups = new Map<string, Group<E>>();
  constructor(private readonly ms: number) {}
  subscribe(key: string, source: Source<E>, subscriber: Subscriber<E>): () => void {
    let group = this.groups.get(key);
    if (!group) {
      group = { source, subscribers: new Set() };
      this.groups.set(key, group);
      this.schedule(key, group);
    }
    group.subscribers.add(subscriber);
    const current = group;
    return () => {
      current.subscribers.delete(subscriber);
      if (!current.subscribers.size) {
        if (current.timer) clearTimeout(current.timer);
        if (this.groups.get(key) === current) this.groups.delete(key);
      }
    };
  }
  private schedule(key: string, group: Group<E>) {
    group.timer = setTimeout(() => void this.poll(key, group), this.ms);
    group.timer.unref();
  }
  private async poll(key: string, group: Group<E>) {
    const ready: Subscriber<E>[] = [];
    for (const subscriber of group.subscribers) {
      try {
        if ((await subscriber.prepare()) && group.subscribers.has(subscriber)) ready.push(subscriber);
      } catch (error) {
        subscriber.fail(error);
      }
    }
    try {
      if (ready.length) {
        const cursor = Math.min(...ready.map((subscriber) => subscriber.cursor));
        const batch = (await group.source.changed(cursor)) ? await group.source.read(cursor) : undefined;
        for (const subscriber of ready) {
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
            subscriber.fail(error);
          }
        }
      }
    } catch (error) {
      for (const subscriber of [...group.subscribers]) subscriber.fail(error);
    }
    if (group.subscribers.size && this.groups.get(key) === group) this.schedule(key, group);
  }
}
