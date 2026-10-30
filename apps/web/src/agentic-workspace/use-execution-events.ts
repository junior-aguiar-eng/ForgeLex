import { useEffect, useState } from 'react';
import { ApiRequestError } from '../api-client';
import type { WorkspaceClient } from './client';
import { applyEvent, emptyEvents, parseEventFrames, type EventState } from './execution-model';

export function useExecutionEvents(client: WorkspaceClient, executionId: string | null) {
  const [state, setState] = useState<EventState>(() => emptyEvents(executionId ?? ''));
  useEffect(() => {
    if (!executionId) {
      setState(emptyEvents(''));
      return;
    }
    const controller = new AbortController();
    let current = emptyEvents(executionId),
      retries = 0;
    setState(current);
    const listen = async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await client.events(executionId, current.cursor, controller.signal);
          const reader = response.body?.getReader();
          if (!reader) throw new Error('STREAM_UNAVAILABLE');
          let buffer = '';
          const decoder = new TextDecoder();
          try {
            while (!controller.signal.aborted) {
              const chunk = await reader.read();
              if (chunk.done) break;
              buffer += decoder.decode(chunk.value, { stream: true });
              if (buffer.length > 256000) throw new Error('STREAM_LIMIT');
              const frames = parseEventFrames(buffer);
              buffer = frames.rest;
              for (const event of frames.events) current = applyEvent(current, event);
              if (frames.error) current = { ...current, error: frames.error };
              if (!controller.signal.aborted) setState(current);
              if (frames.error) return;
            }
          } finally {
            await reader.cancel().catch(() => undefined);
          }
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(current.status)) return;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof ApiRequestError && [401, 403, 404].includes(error.status)) {
            setState({ ...current, error: error.code });
            return;
          }
        }
        if (++retries > 5) {
          setState({ ...current, error: 'EXECUTION_UNAVAILABLE' });
          return;
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, Math.min(5000, 500 * retries));
          controller.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    };
    void listen();
    return () => controller.abort();
  }, [client, executionId]);
  return state;
}
