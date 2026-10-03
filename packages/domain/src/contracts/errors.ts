export type CanonicalErrorCode =
  | 'PROVENANCE_REQUIRED'
  | 'AUTHORITY_NOT_VERIFIED'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'INVALID_CANONICAL_STATE'
  | 'UNAUTHORIZED_CAPABILITY'
  | 'TENANT_VIOLATION'
  | 'TOOL_EXECUTION_FAILED'
  | 'TOOL_TIMEOUT'
  | 'BILLING_INSUFFICIENT_BALANCE'
  | 'BILLING_ACCOUNT_NOT_PROVISIONED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_RESULT_EXPIRED'
  | 'IDEMPOTENCY_RESULT_INVALID'
  | 'OPERATION_LEASE_EXPIRED'
  | 'OPERATION_RESULT_TOO_LARGE'
  | 'SESSION_CANCELLED'
  | 'SESSION_RESUME_UNSUPPORTED'
  | 'POLICY_VIOLATION';

export class DomainError extends Error {
  public readonly code: CanonicalErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: CanonicalErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/** Obtém o código preservado por wrappers de driver sem expor SQL ou parâmetros. */
export function getErrorCode(error: unknown, fallback: string): string {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') return candidate.code;
    current = candidate.cause;
  }
  return fallback;
}
