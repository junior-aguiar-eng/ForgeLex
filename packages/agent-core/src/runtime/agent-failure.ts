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
  'DOCUMENT_RECORD_SOURCE_INVALID',
  'DOCUMENT_RECORD_NOT_LITERAL',
  'DOCUMENT_ASSESSMENT_SOURCE_INVALID',
  'DOCUMENT_ASSESSMENT_INCOMPLETE',
  'DOCUMENT_ASSESSMENT_QUOTE_REQUIRED',
  'DOCUMENT_ASSESSMENT_QUOTE_MISMATCH',
  'INTEGRITY_SIGNAL_INVALID',
  'CONSOLIDATION_REFERENCE_INVALID',
  'CONSOLIDATION_INCOMPATIBLE',
  'CONSOLIDATION_MATRIX_REFERENCE_CONFLICT',
  'INTERNAL_IDENTIFIER_IN_OUTPUT',
] as const;
const errorTypes = [
  'Error',
  'ModelBehaviorError',
  'UserError',
  'APIConnectionError',
  'ZodError',
  'MaxTurnsExceededError',
] as const;
const transportCodes = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
] as const;
const failureClasses = ['TRANSIENT_TRANSPORT', 'CONTRACT', 'RESOURCE_LIMIT', 'AUTHORIZATION'] as const;
const failureStages = [
  'RECORD_RESERVATION',
  'REVALIDATE',
  'DISPATCH',
  'READ_RESPONSE',
  'PARSE_USAGE',
  'SETTLE_USAGE',
  'ADAPT_RESPONSE',
] as const;
const correlationId = /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|editorial:[a-f0-9]{64})$/;
const publicFields = ['statement', 'content', 'title', 'conclusion', 'quote', 'prompt', 'reason'] as const;
export interface AgentFailureDiagnostic {
  publicField?: (typeof publicFields)[number];
  identifierHash?: string;
  clientRequestId?: string;
  failureStage?: (typeof failureStages)[number];
  failureCode?: (typeof failureCodes)[number];
  errorType: (typeof errorTypes)[number] | 'OTHER';
  failureClass?: (typeof failureClasses)[number];
  transportCode?: (typeof transportCodes)[number];
  httpStatus?: number;
  requestId?: string;
}
export function safeAgentFailure(error: unknown): AgentFailureDiagnostic {
  const diagnostic: AgentFailureDiagnostic = { errorType: 'OTHER' };
  let current = error;
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 5 && current && typeof current === 'object' && !visited.has(current); depth++) {
    visited.add(current);
    const value = current as {
      name?: unknown;
      message?: unknown;
      cause?: unknown;
      code?: unknown;
      status?: unknown;
      requestId?: unknown;
      clientRequestId?: unknown;
      failureStage?: unknown;
    };
    if (depth === 0 && errorTypes.includes(value.name as any))
      diagnostic.errorType = value.name as (typeof errorTypes)[number];
    if (failureCodes.includes(value.message as any) && !diagnostic.failureCode) {
      diagnostic.failureCode = value.message as (typeof failureCodes)[number];
    }
    if (transportCodes.includes(value.code as any))
      diagnostic.transportCode = value.code as (typeof transportCodes)[number];
    if (
      typeof value.status === 'number' &&
      Number.isInteger(value.status) &&
      value.status >= 100 &&
      value.status <= 599
    )
      diagnostic.httpStatus ??= value.status;
    if (typeof value.requestId === 'string' && /^req_[A-Za-z0-9_-]{1,120}$/.test(value.requestId))
      diagnostic.requestId ??= value.requestId;
    if (typeof value.clientRequestId === 'string' && correlationId.test(value.clientRequestId))
      diagnostic.clientRequestId ??= value.clientRequestId;
    if (failureStages.includes(value.failureStage as any))
      diagnostic.failureStage ??= value.failureStage as AgentFailureDiagnostic['failureStage'];
    if (['ZodError', 'ModelBehaviorError', 'UserError'].includes(String(value.name)))
      diagnostic.failureClass ??= 'CONTRACT';
    if (['APIConnectionError', 'TimeoutError'].includes(String(value.name)))
      diagnostic.failureClass ??= 'TRANSIENT_TRANSPORT';
    if (value.name === 'MaxTurnsExceededError') diagnostic.failureClass ??= 'RESOURCE_LIMIT';
    current = value.cause;
  }
  const code = diagnostic.failureCode ?? '';
  if (/BUDGET|LIMIT|DEADLINE/.test(code) || [413, 429].includes(diagnostic.httpStatus ?? 0))
    diagnostic.failureClass = 'RESOURCE_LIMIT';
  else if (code === 'ACCESS_REVOKED' || [401, 403].includes(diagnostic.httpStatus ?? 0))
    diagnostic.failureClass = 'AUTHORIZATION';
  else if (diagnostic.transportCode || diagnostic.httpStatus === 408 || (diagnostic.httpStatus ?? 0) >= 500)
    diagnostic.failureClass = 'TRANSIENT_TRANSPORT';
  else if (
    /INVALID|HANDOFF_REQUIRED|DOCUMENT_RECORD_|DOCUMENT_ASSESSMENT_|CONSOLIDATION_|INTERNAL_IDENTIFIER_/.test(code) ||
    (diagnostic.httpStatus ?? 0) >= 400
  )
    diagnostic.failureClass = 'CONTRACT';
  return diagnostic;
}
export function safeAgentFailureDetails(details: Record<string, unknown> | undefined): AgentFailureDiagnostic {
  return {
    ...(publicFields.includes(details?.publicField as any)
      ? { publicField: details!.publicField as AgentFailureDiagnostic['publicField'] }
      : {}),
    ...(typeof details?.identifierHash === 'string' && /^[a-f0-9]{64}$/.test(details.identifierHash)
      ? { identifierHash: details.identifierHash }
      : {}),
    ...(typeof details?.clientRequestId === 'string' && correlationId.test(details.clientRequestId)
      ? { clientRequestId: details.clientRequestId }
      : {}),
    ...(failureStages.includes(details?.failureStage as any)
      ? { failureStage: details!.failureStage as AgentFailureDiagnostic['failureStage'] }
      : {}),
    errorType: errorTypes.includes(details?.errorType as any)
      ? (details!.errorType as (typeof errorTypes)[number])
      : 'OTHER',
    ...(failureCodes.includes(details?.failureCode as any)
      ? { failureCode: details!.failureCode as (typeof failureCodes)[number] }
      : {}),
    ...(failureClasses.includes(details?.failureClass as any)
      ? { failureClass: details!.failureClass as AgentFailureDiagnostic['failureClass'] }
      : {}),
    ...(transportCodes.includes(details?.transportCode as any)
      ? { transportCode: details!.transportCode as AgentFailureDiagnostic['transportCode'] }
      : {}),
    ...(typeof details?.httpStatus === 'number' &&
    Number.isInteger(details.httpStatus) &&
    details.httpStatus >= 100 &&
    details.httpStatus <= 599
      ? { httpStatus: details.httpStatus }
      : {}),
    ...(typeof details?.requestId === 'string' && /^req_[A-Za-z0-9_-]{1,120}$/.test(details.requestId)
      ? { requestId: details.requestId }
      : {}),
  };
}
