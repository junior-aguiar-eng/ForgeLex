import { DomainError } from '@forgelex/domain';
import { randomUUID } from 'node:crypto';

export type SessionStatus =
  | 'STARTING'
  | 'RUNNING'
  | 'WAITING_HUMAN_APPROVAL'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED';

export interface ApprovalRequest {
  toolName: string;
  callId: string;
  approvalToken: string;
  proposedAction: string;
  parametersSummary: string;
  requestedAt: string;
}

export class SessionStateMachine {
  private status: SessionStatus = 'STARTING';
  private currentApprovalRequest?: ApprovalRequest;
  private failureReason?: string;
  private readonly sessionId: string;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getStatus(): SessionStatus {
    return this.status;
  }

  public getApprovalRequest(): ApprovalRequest | undefined {
    return this.currentApprovalRequest;
  }

  public getFailureReason(): string | undefined {
    return this.failureReason;
  }

  public start(): void {
    if (this.status !== 'STARTING') {
      throw new DomainError('INVALID_CANONICAL_STATE', `Não é possível iniciar sessão em estado '${this.status}'`);
    }
    this.status = 'RUNNING';
  }

  public suspendForApproval(toolName: string, callId: string, proposedAction: string, parametersSummary: string): string {
    if (this.status !== 'RUNNING') {
      throw new DomainError('INVALID_CANONICAL_STATE', `Não é possível suspender sessão em estado '${this.status}'`);
    }

    const token = randomUUID();
    this.currentApprovalRequest = {
      toolName,
      callId,
      approvalToken: token,
      proposedAction,
      parametersSummary,
      requestedAt: new Date().toISOString(),
    };

    this.status = 'WAITING_HUMAN_APPROVAL';
    return token;
  }

  public resumeWithApproval(token: string): void {
    if (this.status !== 'WAITING_HUMAN_APPROVAL' || !this.currentApprovalRequest) {
      throw new DomainError('INVALID_CANONICAL_STATE', `Sessão não está aguardando aprovação humana.`);
    }

    if (this.currentApprovalRequest.approvalToken !== token) {
      throw new DomainError('INVALID_CANONICAL_STATE', `Token de aprovação inválido ou expirado.`);
    }

    this.currentApprovalRequest = undefined;
    this.status = 'RUNNING';
  }

  public complete(): void {
    if (this.status !== 'RUNNING') {
      throw new DomainError('INVALID_CANONICAL_STATE', `Não é possível finalizar sessão em estado '${this.status}'`);
    }
    this.status = 'COMPLETED';
  }

  public fail(reason: string): void {
    this.failureReason = reason;
    this.status = 'FAILED';
  }

  public cancel(): void {
    this.status = 'CANCELLED';
  }
}
