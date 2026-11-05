import { structuredLog } from '../observability.js';
import { safeAgentFailureDetails } from '@forgelex/agent-core';

const CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
/** Only stable error codes are logged; free-form messages may carry hosts, SQL or user data. */
export const failureCode = (error: unknown) =>
  error instanceof Error && CODE.test(error.message) ? error.message : 'UNEXPECTED_ERROR';

export function reportAgenticFailure(event: string, error: unknown, fields: Record<string, unknown> = {}) {
  const diagnostic =
    error &&
    typeof error === 'object' &&
    'diagnostic' in error &&
    error.diagnostic &&
    typeof error.diagnostic === 'object'
      ? safeAgentFailureDetails(error.diagnostic as Record<string, unknown>)
      : undefined;
  structuredLog('error', event, {
    ...fields,
    errorCode: failureCode(error),
    errorName: error instanceof Error ? error.name : typeof error,
    ...(diagnostic ? { diagnostic } : {}),
  });
}

/** Periodic loops retry every second; report a repeating failure once per interval and code. */
export function throttledReporter(intervalMs = 60000, now: () => number = Date.now) {
  const last = new Map<string, number>();
  return (event: string, error: unknown, fields: Record<string, unknown> = {}) => {
    const key = `${event}:${failureCode(error)}`,
      at = now();
    if (at - (last.get(key) ?? -Infinity) < intervalMs) return;
    last.set(key, at);
    reportAgenticFailure(event, error, fields);
  };
}
