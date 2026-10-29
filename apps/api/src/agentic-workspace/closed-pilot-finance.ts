import { InferenceBudgetService } from '@forgelex/billing-ledger';
import { AgenticWorkspaceRepository, type ForgeLexDatabase, type Client } from '@forgelex/persistence';
import type { AgenticOwner } from '@forgelex/domain';
import { PILOT_POLICY } from './real-provider.js';

export const CLOSED_PILOT_FUNDING_OWNER = { tenantId: 'boni-task6-synthetic-only', userId: 'boni' };
export interface HistoricalObservation {
  callId: string;
  status: string;
  costCents?: number;
}
export function createClosedFinance(
  db: ForgeLexDatabase,
  client: Client,
  application: ForgeLexDatabase,
  owner: AgenticOwner,
  history: HistoricalObservation[],
) {
  const assertOwner = (candidate: AgenticOwner) => {
    if (candidate.tenantId !== owner.tenantId || candidate.userId !== owner.userId)
      throw new Error('CLOSED_PILOT_FORBIDDEN');
  };
  const funding = CLOSED_PILOT_FUNDING_OWNER;
  const budget = new InferenceBudgetService(db, client, {
    lookupExecution: async (identity, id) => {
      if (identity.tenantId !== funding.tenantId || identity.userId !== funding.userId) return undefined;
      return new AgenticWorkspaceRepository(application).getExecution(owner, id);
    },
  });
  const snapshot = async () => {
    let account: Awaited<ReturnType<typeof budget.inspectAccount>>;
    try {
      account = await budget.inspectAccount(funding);
    } catch {
      throw new Error('CLOSED_PILOT_HISTORY_REQUIRED');
    }
    if (history.length !== 55) throw new Error('CLOSED_PILOT_HISTORY_REQUIRED');
    for (const old of history) {
      const call = account.calls.find((candidate) => candidate.id === old.callId || candidate.callId === old.callId);
      if (!call || call.kind !== 'PROVIDER') throw new Error('CLOSED_PILOT_HISTORY_REQUIRED');
      if (old.status === 'SETTLED') {
        if (call.status !== 'SETTLED' || call.settlement?.actualCostCents !== old.costCents)
          throw new Error('CLOSED_PILOT_HISTORY_REQUIRED');
      } else if (
        call.status !== 'PROVISIONED' ||
        call.provision?.amountCents !== 4 ||
        call.provision.actualCostCents !== null ||
        call.provision.usage !== null
      )
        throw new Error('CLOSED_PILOT_HISTORY_REQUIRED');
    }
    const values = account.budgets
      .map((b) => [b.consumedCents, b.provisionedCents ?? 0, b.remainingPaidCents, b.remainingPromoCents])
      .flat();
    if (
      [account.paidBalanceCents, account.promotionalBalanceCents, ...values].some(
        (n) => !Number.isSafeInteger(n) || n < 0,
      )
    )
      throw new Error('CLOSED_PILOT_BUDGET_INVARIANT');
    const settledCents = account.budgets.reduce((n, b) => n + b.consumedCents, 0);
    const provisionedCents = account.budgets.reduce((n, b) => n + (b.provisionedCents ?? 0), 0);
    const escrowCents = account.budgets.reduce((n, b) => n + b.remainingPaidCents + b.remainingPromoCents, 0);
    if (
      account.promotionalBalanceCents !== 0 ||
      account.budgets.some((b) => b.remainingPromoCents !== 0) ||
      account.paidBalanceCents + settledCents + provisionedCents + escrowCents !== 500
    )
      throw new Error('CLOSED_PILOT_BUDGET_INVARIANT');
    return {
      currency: 'USD' as const,
      ceilingCents: 500,
      availableCents: account.paidBalanceCents,
      settledCents,
      provisionedCents,
      escrowCents,
      // AUTHORIZED may outlive a crashed sender. Until usage is settled, serialize
      // sends across restarts rather than assuming that no HTTP reached OpenAI.
      reconciliationRequired: account.calls.some((c) => ['AUTHORIZED', 'RECONCILIATION_REQUIRED'].includes(c.status)),
      invoiceReconciled: false,
      legacyPilotClosed: true,
    };
  };
  const canSpend = async () => {
    if ((await snapshot()).reconciliationRequired) throw new Error('CLOSED_PILOT_RECONCILIATION_REQUIRED');
  };
  return {
    assertOwner,
    snapshot,
    async reserve(executionId: string, maximum: number) {
      await canSpend();
      return budget.reserveExecutionBudget({
        ...funding,
        executionId,
        maxCostCents: maximum,
        idempotencyKey: `closed:${executionId}`,
        policy: { ...PILOT_POLICY, id: 'boni-closed-pilot-v1' },
      });
    },
    gateway: {
      async authorizeProviderCall(
        identity: AgenticOwner,
        id: string,
        quote: Parameters<InferenceBudgetService['authorizeProviderCall']>[2],
      ) {
        assertOwner(identity);
        await canSpend();
        return budget.authorizeProviderCall(funding, id, quote);
      },
      async settleProviderCall(
        identity: AgenticOwner,
        id: string,
        result: Parameters<InferenceBudgetService['settleProviderCall']>[2],
      ) {
        assertOwner(identity);
        return budget.settleProviderCall(funding, id, result);
      },
    },
    cleanup: {
      async releaseUnusedBudget(identity: AgenticOwner, id: string) {
        assertOwner(identity);
        return budget.releaseUnusedBudget(funding, id);
      },
      async getExecutionBudget(identity: AgenticOwner, id: string) {
        assertOwner(identity);
        return budget.getExecutionBudget(funding, id);
      },
    },
  };
}
