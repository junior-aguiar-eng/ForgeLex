import type { FastifyInstance } from 'fastify';
import { structuredLog } from './observability.js';

type ShutdownLog = typeof structuredLog;

export interface SignalProcess {
  exitCode: string | number | null | undefined;
  once(event: NodeJS.Signals, listener: () => void): unknown;
  removeListener(event: NodeJS.Signals, listener: () => void): unknown;
}

export function installGracefulShutdown(
  app: Pick<FastifyInstance, 'close'>,
  processLike: SignalProcess = process,
  log: ShutdownLog = structuredLog,
): () => void {
  let stopping = false;

  const cleanup = () => {
    processLike.removeListener('SIGTERM', onSigterm);
    processLike.removeListener('SIGINT', onSigint);
  };
  const stop = async (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    cleanup();
    log('info', 'server.shutdown', { signal });
    try {
      await app.close();
      processLike.exitCode = 0;
    } catch (error) {
      processLike.exitCode = 1;
      log('error', 'server.shutdown.failed', {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const onSigterm = () => void stop('SIGTERM');
  const onSigint = () => void stop('SIGINT');

  processLike.once('SIGTERM', onSigterm);
  processLike.once('SIGINT', onSigint);
  return cleanup;
}
