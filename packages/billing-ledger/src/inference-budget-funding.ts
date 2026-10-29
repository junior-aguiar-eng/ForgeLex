import { and, eq } from 'drizzle-orm';
import type { ForgeLexDatabase } from '@forgelex/persistence';
import { inferenceBudgets, inferenceCalls } from './schema/inference-budget-schema.js';

export interface BudgetFunding {
  executionId: string;
  callId: string;
}
export interface BudgetRecord {
  id: string;
  tenantId: string;
  userId: string;
  executionId: string;
  idempotencyKey: string;
  inputHash: string;
  maxCostCents: number;
  remainingPaidCents: number;
  remainingPromoCents: number;
  consumedCents: number;
  /** Conservative exposure recognized without asserting a provider-reported charge. */
  provisionedCents?: number;
  releasedCents: number;
  expiredPromoCents: number;
  promoExpiresAt: string | null;
  status: 'ACTIVE' | 'CLOSING' | 'RECONCILIATION_REQUIRED' | 'RELEASED';
  policy: BudgetPolicy;
}
export interface BudgetPolicy {
  id: string;
  version: string;
  approvalReference: string;
  provider: string;
  model: string;
  maxCalls: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
  cachedInputCentsPerMillion?: number;
}
export interface BudgetCall {
  id: string;
  tenantId: string;
  userId: string;
  executionId: string;
  callId: string;
  operationKey: string;
  kind: 'PROVIDER' | 'RESEARCH';
  inputHash: string;
  upperBoundCents: number;
  inputTokens: number;
  maxOutputTokens: number;
  reservedPaidCents: number;
  reservedPromoCents: number;
  status: 'AUTHORIZED' | 'SETTLING' | 'SETTLED' | 'RECONCILIATION_REQUIRED' | 'CANCELLED' | 'PROVISIONED';
  provision?: {
    basis: 'UPPER_BOUND';
    amountCents: number;
    actualCostCents: null;
    usage: null;
    approvalReference: string;
    evidenceReference: string;
    fingerprint: string;
    recordedAt: string;
  };
  settlement?: { actualCostCents: number; fingerprint: string };
  reason?: string;
}
export async function readBudget(db: ForgeLexDatabase, tenantId: string, executionId: string): Promise<BudgetRecord> {
  const [row] = await db
    .select()
    .from(inferenceBudgets)
    .where(and(eq(inferenceBudgets.tenantId, tenantId), eq(inferenceBudgets.executionId, executionId)))
    .limit(1);
  if (!row) throw new Error('BUDGET_NOT_FOUND');
  return JSON.parse(row.payloadJson);
}
export async function readCall(
  db: ForgeLexDatabase,
  executionId: string,
  callId: string,
): Promise<BudgetCall | undefined> {
  const [row] = await db
    .select()
    .from(inferenceCalls)
    .where(and(eq(inferenceCalls.executionId, executionId), eq(inferenceCalls.callId, callId)))
    .limit(1);
  return row ? JSON.parse(row.payloadJson) : undefined;
}
export async function saveBudget(db: ForgeLexDatabase, budget: BudgetRecord) {
  await db
    .update(inferenceBudgets)
    .set({ payloadJson: JSON.stringify(budget) })
    .where(eq(inferenceBudgets.id, budget.id));
}
export async function saveCall(db: ForgeLexDatabase, call: BudgetCall) {
  await db
    .update(inferenceCalls)
    .set({ payloadJson: JSON.stringify(call) })
    .where(eq(inferenceCalls.id, call.id));
}
/** Caller must hold the account row lock. Escrow was removed from spendable wallet at reservation. */
export async function validateBudgetFunding(
  db: ForgeLexDatabase,
  tenantId: string,
  userId: string | undefined,
  funding: BudgetFunding,
  operationKey: string,
  costCents: number,
) {
  const budget = await readBudget(db, tenantId, funding.executionId);
  const call = await readCall(db, funding.executionId, funding.callId);
  if (
    budget.userId !== userId ||
    !call ||
    call.userId !== userId ||
    call.tenantId !== tenantId ||
    call.operationKey !== operationKey ||
    call.status !== 'SETTLING' ||
    call.settlement?.actualCostCents !== costCents ||
    costCents > call.upperBoundCents ||
    budget.status === 'RELEASED'
  )
    throw new Error('BUDGET_FUNDING_INVALID');
  return { budget, call };
}
export async function consumeBudgetFunding(
  db: ForgeLexDatabase,
  tenantId: string,
  userId: string | undefined,
  funding: BudgetFunding,
  operationKey: string,
  costCents: number,
): Promise<'PAID' | 'PROMOTIONAL'> {
  const { budget, call } = await validateBudgetFunding(db, tenantId, userId, funding, operationKey, costCents);
  const promo = Math.min(call.reservedPromoCents, costCents),
    paid = costCents - promo;
  if (paid > budget.remainingPaidCents || promo > budget.remainingPromoCents) throw new Error('BUDGET_FUNDING_INVALID');
  await saveBudget(db, {
    ...budget,
    remainingPaidCents: budget.remainingPaidCents - paid,
    remainingPromoCents: budget.remainingPromoCents - promo,
    consumedCents: budget.consumedCents + costCents,
  });
  await saveCall(db, { ...call, status: 'SETTLED' });
  return promo > 0 ? 'PROMOTIONAL' : 'PAID';
}
