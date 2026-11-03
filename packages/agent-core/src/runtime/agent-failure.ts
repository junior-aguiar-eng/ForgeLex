// Only enumerated metadata may cross into persisted diagnostics. Never copy messages,
// stack traces, tool arguments, prompts, URLs or arbitrary SDK details.
const failureCodes = [
  'BUDGET_EXCEEDED',
  'CALL_LIMIT',
  'RUN_DEADLINE',
  'UNCERTAIN_COST',
  'INFERENCE_BUDGET_EXCEEDED',
  'INFERENCE_CALL_LIMIT',
  'COMMERCIAL_OUTPUT_LIMIT',
  'COMMERCIAL_RESPONSE_INCOMPLETE',
  'COMMERCIAL_RESPONSE_FAILED',
  'COMMERCIAL_REQUEST_INVALID',
  'COMMERCIAL_RESPONSE_INVALID',
  'COMMERCIAL_HTTP_FAILED',
  'COMMERCIAL_INFERENCE_LIMIT',
  'COMMERCIAL_TIME_LIMIT',
  'COMMERCIAL_CALL_LIMIT',
  'COMMERCIAL_DAILY_LIMIT',
  'COMMERCIAL_MONTHLY_LIMIT',
  'PILOT_RESPONSE_INVALID',
  'ACCESS_REVOKED',
  'SESSION_CANCELLED',
  'SOURCE_REFERENCE_INVALID',
  'ROLE_OUTPUT_INVALID',
  'HANDOFF_REQUIRED',
] as const;
const errorTypes = [
  'Error',
  'ModelBehaviorError',
  'UserError',
  'APIConnectionError',
  'ZodError',
  'MaxTurnsExceededError',
] as const;
export interface AgentFailureDiagnostic {
  failureCode?: (typeof failureCodes)[number];
  errorType: (typeof errorTypes)[number] | 'OTHER';
}
export function safeAgentFailure(error: unknown): AgentFailureDiagnostic {
  const diagnostic: AgentFailureDiagnostic = { errorType: 'OTHER' };
  let current = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 5 && current && typeof current === 'object' && !visited.has(current); depth++) {
    visited.add(current);
    const value = current as { name?: unknown; message?: unknown; cause?: unknown };
    if (depth === 0 && errorTypes.includes(value.name as any))
      diagnostic.errorType = value.name as (typeof errorTypes)[number];
    if (failureCodes.includes(value.message as any)) {
      diagnostic.failureCode = value.message as (typeof failureCodes)[number];
      break;
    }
    current = value.cause;
  }
  return diagnostic;
}
export function safeAgentFailureDetails(details: Record<string, unknown> | undefined): AgentFailureDiagnostic {
  return {
    errorType: errorTypes.includes(details?.errorType as any)
      ? (details!.errorType as (typeof errorTypes)[number])
      : 'OTHER',
    ...(failureCodes.includes(details?.failureCode as any)
      ? { failureCode: details!.failureCode as (typeof failureCodes)[number] }
      : {}),
  };
}
