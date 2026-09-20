import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { installGracefulShutdown } from './graceful-shutdown.js';

class FakeProcess extends EventEmitter {
  public exitCode: number | undefined;
}

describe('installGracefulShutdown', () => {
  it('fecha o servidor uma única vez e remove os listeners', async () => {
    const processLike = new FakeProcess();
    const close = vi.fn(async () => undefined);
    const log = vi.fn();
    installGracefulShutdown({ close }, processLike, log);

    processLike.emit('SIGTERM');
    processLike.emit('SIGINT');
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));

    expect(processLike.exitCode).toBe(0);
    expect(processLike.listenerCount('SIGTERM')).toBe(0);
    expect(processLike.listenerCount('SIGINT')).toBe(0);
    expect(log).toHaveBeenCalledWith('info', 'server.shutdown', { signal: 'SIGTERM' });
  });

  it('marca falha quando o fechamento não conclui', async () => {
    const processLike = new FakeProcess();
    const close = vi.fn(async () => { throw new Error('close failed'); });
    const log = vi.fn();
    installGracefulShutdown({ close }, processLike, log);

    processLike.emit('SIGTERM');
    await vi.waitFor(() => expect(processLike.exitCode).toBe(1));

    expect(log).toHaveBeenLastCalledWith('error', 'server.shutdown.failed', {
      signal: 'SIGTERM',
      error: 'close failed',
    });
  });
});
