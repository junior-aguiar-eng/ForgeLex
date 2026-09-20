export interface RequestAbortableRaw {
  aborted?: boolean;
  once(event: 'aborted', listener: () => void): unknown;
  removeListener(event: 'aborted', listener: () => void): unknown;
}

export function createRequestAbortSignal(raw: RequestAbortableRaw): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const onAborted = () => controller.abort();
  if (raw.aborted) controller.abort();
  else raw.once('aborted', onAborted);
  return {
    signal: controller.signal,
    dispose: () => raw.removeListener('aborted', onAborted),
  };
}
