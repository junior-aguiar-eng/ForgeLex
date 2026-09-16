export type CanonicalErrorCode =
  | 'PROVENANCE_REQUIRED'
  | 'AUTHORITY_NOT_VERIFIED'
  | 'HUMAN_APPROVAL_REQUIRED'
  | 'INVALID_CANONICAL_STATE'
  | 'UNAUTHORIZED_CAPABILITY'
  | 'TENANT_VIOLATION'
  | 'TOOL_EXECUTION_FAILED'
  | 'SESSION_CANCELLED'
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
