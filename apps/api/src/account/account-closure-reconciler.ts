import {
  type AccountClosureRepository,
  type AccountClosureStatus,
  type AccountClosureStepType,
  type ClaimedClosureStep,
} from '@forgelex/persistence';
import { structuredLog } from '../observability.js';
import type { AccountIdentityAdmin } from './supabase-account-admin.js';

export interface AccountClosureStepHandler {
  execute(step: ClaimedClosureStep): Promise<void>;
}

const nextStatusByStep: Record<AccountClosureStepType, AccountClosureStatus> = {
  DELETE_SUPABASE_IDENTITY: 'IDENTITY_REMOVED',
  PURGE_PRIVATE_CONTENT: 'CREDENTIALS_REVOKED',
  MINIMIZE_RETAINED_RECORDS: 'CONTENT_PURGING',
  REMOVE_LOCAL_IDENTITY: 'RETAINED_ONLY',
  VERIFY_RESIDUALS: 'COMPLETED',
};

function unavailableHandler(): AccountClosureStepHandler {
  return {
    execute: async () => {
      throw Object.assign(new Error('ACCOUNT_CLOSURE_HANDLER_NOT_CONFIGURED'), {
        code: 'ACCOUNT_CLOSURE_HANDLER_NOT_CONFIGURED',
      });
    },
  };
}

export function createAccountClosureStepHandlers(input: {
  identityAdmin: AccountIdentityAdmin;
}): Record<AccountClosureStepType, AccountClosureStepHandler> {
  return {
    DELETE_SUPABASE_IDENTITY: {
      execute: async ({ closure }) => {
        if (!closure.subjectId) throw new Error('ACCOUNT_CLOSURE_SUBJECT_NOT_AVAILABLE');
        await input.identityAdmin.deleteUser(closure.subjectId);
      },
    },
    PURGE_PRIVATE_CONTENT: unavailableHandler(),
    MINIMIZE_RETAINED_RECORDS: unavailableHandler(),
    REMOVE_LOCAL_IDENTITY: unavailableHandler(),
    VERIFY_RESIDUALS: unavailableHandler(),
  };
}

function stableErrorCode(error: unknown): string {
  const value = error as { code?: unknown; message?: unknown };
  const candidate = typeof value.code === 'string'
    ? value.code
    : typeof value.message === 'string'
      ? value.message
      : '';
  return /^(?:ACCOUNT_CLOSURE|SUPABASE)_[A-Z0-9_]{1,112}$/.test(candidate)
    ? candidate
    : 'ACCOUNT_CLOSURE_STEP_FAILED';
}

export class AccountClosureReconciler {
  private readonly leaseMs: number;
  private readonly maxAttempts: number;

  public constructor(private readonly input: {
    repository: AccountClosureRepository;
    handlers: Record<AccountClosureStepType, AccountClosureStepHandler>;
    leaseOwner: string;
    leaseMs?: number;
    maxAttempts?: number;
  }) {
    this.leaseMs = input.leaseMs ?? 60_000;
    this.maxAttempts = input.maxAttempts ?? 12;
  }

  public async runOne(now = new Date()): Promise<'completed' | 'retrying' | 'failed' | 'idle'> {
    const nowIso = now.toISOString();
    const claimed = await this.input.repository.claimNextStep({
      now: nowIso,
      leaseOwner: this.input.leaseOwner,
      leaseExpiresAt: new Date(now.getTime() + this.leaseMs).toISOString(),
    });
    if (!claimed) return 'idle';

    const handler = this.input.handlers[claimed.step.stepType];
    try {
      await handler.execute(claimed);
    } catch (error) {
      const terminal = claimed.step.attemptCount >= this.maxAttempts;
      const errorCode = stableErrorCode(error);
      const retryDelayMs = Math.min(
        60_000 * 2 ** Math.max(0, claimed.step.attemptCount - 1),
        21_600_000,
      );
      await this.input.repository.retryStep({
        closureId: claimed.closure.id,
        stepType: claimed.step.stepType,
        now: nowIso,
        nextAttemptAt: new Date(now.getTime() + retryDelayMs).toISOString(),
        errorCode,
        terminal,
      });
      structuredLog(terminal ? 'error' : 'warn', 'account_closure.step.failed', {
        closureId: claimed.closure.id,
        stepType: claimed.step.stepType,
        attemptCount: claimed.step.attemptCount,
        errorCode,
        terminal,
      });
      return terminal ? 'failed' : 'retrying';
    }

    await this.input.repository.completeStep({
      closureId: claimed.closure.id,
      stepType: claimed.step.stepType,
      now: nowIso,
      nextStatus: nextStatusByStep[claimed.step.stepType],
    });
    structuredLog('info', 'account_closure.step.completed', {
      closureId: claimed.closure.id,
      stepType: claimed.step.stepType,
      attemptCount: claimed.step.attemptCount,
    });
    return 'completed';
  }
}
