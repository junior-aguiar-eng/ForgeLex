/**
 * In-process mutual exclusion per key: tasks for the same key run one at a time, in arrival order; different keys do
 * not wait for each other. It only orders work inside one process. Cross-replica safety still needs a database lock or
 * a conditional write.
 *
 * Not reentrant: a task that calls `run` again for its own key waits for itself forever. Each owner should hold its own
 * instance, so that unrelated services never contend for (or deadlock on) the same key.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<void>>();

  /** Number of keys that currently have a task running or waiting. Idle keys are dropped. */
  public get size(): number {
    return this.tails.size;
  }

  public async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
