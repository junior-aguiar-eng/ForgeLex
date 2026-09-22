import {
  type AccountClosureRepository,
  type AccountClosureStatus,
  type AccountClosureStepType,
  type ClaimedClosureStep,
} from '@forgelex/persistence';
import { structuredLog } from '../observability.js';
import type { AccountClosureBillingRetention } from './account-closure-billing-retention.js';
import type { AccountClosurePurgeService } from './account-closure-purge-service.js';
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
  purgeService?: Pick<
    AccountClosurePurgeService,
    'purgePrivateContent' | 'removeLocalIdentity' | 'verifyResiduals'
  >;
  billingRetention?: Pick<AccountClosureBillingRetention, 'minimize'>;
}): Record<AccountClosureStepType, AccountClosureStepHandler> {
  const pseudonyms = (step: ClaimedClosureStep) => ({
    tenantPseudonym: `tenant_closed_${step.closure.tenantHash.slice(0, 24)}`,
    userPseudonym: `user_closed_${step.closure.userHash.slice(0, 24)}`,
    closurePseudonym: `closure_${step.closure.id}`,
  });
  return {
    DELETE_SUPABASE_IDENTITY: {
      execute: async ({ closure }) => {
        if (!closure.subjectId) throw new Error('ACCOUNT_CLOSURE_SUBJECT_NOT_AVAILABLE');
        await input.identityAdmin.deleteUser(closure.subjectId);
      },
    },
    PURGE_PRIVATE_CONTENT: input.purgeService
      ? {
          execute: async ({ closure }) => {
            if (!closure.tenantId) throw new Error('ACCOUNT_CLOSURE_TENANT_NOT_AVAILABLE');
            await input.purgeService?.purgePrivateContent({
              tenantId: closure.tenantId,
              closureId: closure.id,
            });
          },
        }
      : unavailableHandler(),
    MINIMIZE_RETAINED_RECORDS: input.billingRetention
      ? {
          execute: async (step) => {
            const { closure } = step;
            if (!closure.tenantId || !closure.userId) {
              throw new Error('ACCOUNT_CLOSURE_IDENTITY_NOT_AVAILABLE');
            }
            await input.billingRetention?.minimize({
              tenantId: closure.tenantId,
              userId: closure.userId,
              ...pseudonyms(step),
            });
          },
        }
      : unavailableHandler(),
    REMOVE_LOCAL_IDENTITY: input.purgeService
      ? {
          execute: async (step) => {
            const { closure } = step;
            if (Boolean(closure.tenantId) !== Boolean(closure.userId)) {
              throw new Error('ACCOUNT_CLOSURE_IDENTITY_NOT_AVAILABLE');
            }
            await input.purgeService?.removeLocalIdentity({
              closureId: closure.id,
              tenantId: closure.tenantId ?? undefined,
              userId: closure.userId ?? undefined,
              ...pseudonyms(step),
            });
          },
        }
      : unavailableHandler(),
    VERIFY_RESIDUALS: input.purgeService
      ? {
          execute: async (step) => {
            await input.purgeService?.verifyResiduals({
              closureId: step.closure.id,
              tenantId: step.closure.tenantId ?? undefined,
              tenantPseudonym: pseudonyms(step).tenantPseudonym,
            });
          },
        }
      : unavailableHandler(),
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
