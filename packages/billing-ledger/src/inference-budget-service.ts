import { createHash, randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AgenticOwnerSchema, type AgenticOwner, type AgenticExecution } from '@forgelex/domain';
import { NormalizedUsageSchema, type NormalizedUsage } from '@forgelex/agent-core';
import { AgenticWorkspaceRepository, type ForgeLexDatabase } from '@forgelex/persistence';
import { LedgerService } from './ledger-service.js';
import { ledgerAccounts, billingOperations } from './schema/ledger-schema.js';
import { inferenceBudgets, inferenceCalls } from './schema/inference-budget-schema.js';
import {
  readBudget,
  readCall,
  saveBudget,
  saveCall,
  type BudgetCall,
  type BudgetPolicy,
  type BudgetRecord,
} from './inference-budget-funding.js';

const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id = z.string().trim().min(1).max(200);
const policySchema = z
  .object({
    id,
    version: id,
    approvalReference: id,
    provider: id,
    model: id,
    maxCalls: z.number().int().positive(),
    maxInputTokens: cents,
    maxOutputTokens: cents,
    inputCentsPerMillion: cents,
    outputCentsPerMillion: cents,
    cachedInputCentsPerMillion: cents.optional(),
  })
  .strict();
const quoteSchema = z
  .object({ callId: id, upperBoundCents: cents, inputTokens: cents, maxOutputTokens: cents })
  .strict();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pending = (c: BudgetCall) => ['AUTHORIZED', 'SETTLING', 'RECONCILIATION_REQUIRED'].includes(c.status);

/** Internal only. Configuration/approval references must be supplied by trusted server code. No default tariff. */
export class InferenceBudgetService {
  private readonly ledger: LedgerService;
  constructor(
    private readonly db: ForgeLexDatabase,
    client: Client,
    private readonly options: {
      /** Trusted composition only: an isolated currency ledger may validate execution in its application store. */
      lookupExecution?: (owner: AgenticOwner, executionId: string) => Promise<AgenticExecution | undefined>;
    } = {},
  ) {
    this.ledger = new LedgerService(db, client, { migrationMode: 'verify' });
  }
  private execution(db: ForgeLexDatabase, owner: AgenticOwner, executionId: string) {
    return this.options.lookupExecution
      ? this.options.lookupExecution(owner, executionId)
      : new AgenticWorkspaceRepository(db).getExecution(owner, executionId);
  }
  /** Internal inspection under the same account lock as reservations; never provisions funds. */
  async inspectAccount(owner: AgenticOwner) {
    return this.locked(owner, async (db, account) => ({
      paidBalanceCents: account.paidBalanceCents,
      promotionalBalanceCents: account.promotionalBalanceCents,
      budgets: (
        await db
          .select()
          .from(inferenceBudgets)
          .where(and(eq(inferenceBudgets.tenantId, owner.tenantId), eq(inferenceBudgets.userId, owner.userId)))
      ).map((row) => JSON.parse(row.payloadJson) as BudgetRecord),
      calls: (await db.select().from(inferenceCalls).where(eq(inferenceCalls.tenantId, owner.tenantId)))
        .map((row) => JSON.parse(row.payloadJson) as BudgetCall)
        .filter((call) => call.userId === owner.userId),
    }));
  }
  private async locked<T>(
    owner: AgenticOwner,
    write: (db: ForgeLexDatabase, account: typeof ledgerAccounts.$inferSelect) => Promise<T>,
  ): Promise<T> {
    AgenticOwnerSchema.parse(owner);
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as ForgeLexDatabase;
      const [account] = await db
        .update(ledgerAccounts)
        .set({ updatedAt: sql`${ledgerAccounts.updatedAt}` })
        .where(eq(ledgerAccounts.tenantId, owner.tenantId))
        .returning();
      if (!account) throw new Error('BUDGET_NOT_FOUND');
      return write(db, account);
    });
  }
  private async owned(db: ForgeLexDatabase, owner: AgenticOwner, executionId: string) {
    const budget = await readBudget(db, owner.tenantId, executionId);
    if (budget.userId !== owner.userId) throw new Error('BUDGET_NOT_FOUND');
    return budget;
  }
  private async calls(db: ForgeLexDatabase, executionId: string): Promise<BudgetCall[]> {
    return (await db.select().from(inferenceCalls).where(eq(inferenceCalls.executionId, executionId))).map((row) =>
      JSON.parse(row.payloadJson),
    );
  }
  /** Read persisted escrow independently of wallet existence; used by durable cleanup/reconciliation. */
  async getExecutionBudget(owner: AgenticOwner, executionId: string): Promise<BudgetRecord | undefined> {
    AgenticOwnerSchema.parse(owner);
    try {
      const budget = await readBudget(this.db, owner.tenantId, executionId);
      return budget.userId === owner.userId ? budget : undefined;
    } catch (error) {
      if (error instanceof Error && error.message === 'BUDGET_NOT_FOUND') return undefined;
      throw error;
    }
  }
  async reserveExecutionBudget(
    raw: AgenticOwner & { executionId: string; maxCostCents: number; idempotencyKey: string; policy: BudgetPolicy },
  ): Promise<BudgetRecord> {
    const owner = AgenticOwnerSchema.parse({ tenantId: raw.tenantId, userId: raw.userId });
    const input = z
      .object({ executionId: id, maxCostCents: cents.positive(), idempotencyKey: id, policy: policySchema })
      .parse(raw);
    const inputHash = hash(input);
    return this.locked(owner, async (db, account) => {
      const execution = await this.execution(db, owner, input.executionId);
      if (!execution) throw new Error('EXECUTION_NOT_FOUND');
      const existingRows = await db
        .select()
        .from(inferenceBudgets)
        .where(
          and(
            eq(inferenceBudgets.tenantId, owner.tenantId),
            eq(inferenceBudgets.userId, owner.userId),
            eq(inferenceBudgets.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (existingRows[0]) {
        const previous: BudgetRecord = JSON.parse(existingRows[0].payloadJson);
        if (previous.inputHash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return previous;
      }
      if (
        ['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution.status) ||
        !execution.authorizationId ||
        execution.requiresReevaluation
      )
        throw new Error('EXECUTION_NOT_AUTHORIZED');
      const [existing] = await db
        .select()
        .from(inferenceBudgets)
        .where(eq(inferenceBudgets.executionId, input.executionId));
      if (existing) throw new Error('IDEMPOTENCY_CONFLICT');
      const pendingOperations = await db
        .select()
        .from(billingOperations)
        .where(and(eq(billingOperations.accountId, account.id), eq(billingOperations.status, 'PENDING')));
      const reserved = pendingOperations
        .filter((op) => !op.fundingExecutionId)
        .reduce((sum, op) => sum + op.reservedAmountCents, 0);
      const effectivePromo =
        account.promoExpiresAt && Date.parse(account.promoExpiresAt) > Date.now() ? account.promotionalBalanceCents : 0;
      if (account.paidBalanceCents + effectivePromo - reserved < input.maxCostCents)
        throw new Error('BILLING_INSUFFICIENT_BALANCE');
      const promo = Math.min(input.maxCostCents, effectivePromo),
        paid = input.maxCostCents - promo;
      // Escrow is not a charge. The durable budget preserves the original buckets until settlement/release.
      const budget: BudgetRecord = {
        ...owner,
        ...input,
        id: randomUUID(),
        inputHash,
        remainingPaidCents: paid,
        remainingPromoCents: promo,
        consumedCents: 0,
        releasedCents: 0,
        expiredPromoCents: 0,
        promoExpiresAt: account.promoExpiresAt,
        status: 'ACTIVE',
      };
      await db.insert(inferenceBudgets).values({
        id: budget.id,
        ...owner,
        executionId: input.executionId,
        idempotencyKey: input.idempotencyKey,
        payloadJson: JSON.stringify(budget),
      });
      await db
        .update(ledgerAccounts)
        .set({
          paidBalanceCents: account.paidBalanceCents - paid,
          promotionalBalanceCents: account.promotionalBalanceCents - promo,
        })
        .where(eq(ledgerAccounts.id, account.id));
      return budget;
    });
  }
  private price(policy: BudgetPolicy, input: number, output: number, cached = 0): number {
    if (cached > input || (cached > 0 && policy.cachedInputCentsPerMillion === undefined))
      throw new Error('USAGE_PRICE_UNAVAILABLE');
    const amount =
      BigInt(input - cached) * BigInt(policy.inputCentsPerMillion) +
      BigInt(cached) * BigInt(policy.cachedInputCentsPerMillion ?? policy.inputCentsPerMillion) +
      BigInt(output) * BigInt(policy.outputCentsPerMillion);
    return cents.parse(Number((amount + 999999n) / 1000000n));
  }
  async authorizeProviderCall(owner: AgenticOwner, executionId: string, raw: z.infer<typeof quoteSchema>) {
    const input = quoteSchema.parse(raw);
    return this.authorize(owner, executionId, {
      ...input,
      kind: 'PROVIDER',
      operationKey: `inference:${executionId}:${input.callId}`,
    });
  }
  private async authorize(
    owner: AgenticOwner,
    executionId: string,
    input: {
      callId: string;
      upperBoundCents: number;
      inputTokens: number;
      maxOutputTokens: number;
      kind: 'PROVIDER' | 'RESEARCH';
      operationKey: string;
      requestFingerprint?: string;
    },
  ) {
    const inputHash = hash(input);
    return this.locked(owner, async (db) => {
      const budget = await this.owned(db, owner, executionId);
      const existing = await readCall(db, executionId, input.callId);
      if (existing) {
        if (existing.inputHash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return { ...existing, shouldExecute: false };
      }
      if (budget.status !== 'ACTIVE') throw new Error('BUDGET_NOT_ACTIVE');
      const execution = await this.execution(db, owner, executionId);
      if (
        !execution ||
        ['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution.status) ||
        execution.requiresReevaluation
      )
        throw new Error('EXECUTION_NOT_AUTHORIZED');
      if (budget.remainingPromoCents > 0 && (!budget.promoExpiresAt || Date.parse(budget.promoExpiresAt) <= Date.now()))
        throw new Error('PROMOTION_EXPIRED');
      const calls = await this.calls(db, executionId);
      if (calls.length >= budget.policy.maxCalls) throw new Error('CALL_LIMIT');
      if (
        input.kind === 'PROVIDER' &&
        (input.inputTokens > budget.policy.maxInputTokens ||
          input.maxOutputTokens > budget.policy.maxOutputTokens ||
          input.upperBoundCents <
            this.price(
              {
                ...budget.policy,
                inputCentsPerMillion: Math.max(
                  budget.policy.inputCentsPerMillion,
                  budget.policy.cachedInputCentsPerMillion ?? 0,
                ),
              },
              input.inputTokens,
              input.maxOutputTokens,
            ))
      )
        throw new Error('PROVIDER_LIMIT');
      const live = calls.filter(pending);
      const freePromo = budget.remainingPromoCents - live.reduce((n, c) => n + c.reservedPromoCents, 0);
      const freePaid = budget.remainingPaidCents - live.reduce((n, c) => n + c.reservedPaidCents, 0);
      if (input.upperBoundCents > freePromo + freePaid) throw new Error('BUDGET_EXCEEDED');
      const [previousOperation] = await db
        .select()
        .from(billingOperations)
        .where(
          and(eq(billingOperations.tenantId, owner.tenantId), eq(billingOperations.idempotencyKey, input.operationKey)),
        );
      if (previousOperation) throw new Error('OPERATION_ALREADY_EXISTS');
      const promo = Math.min(freePromo, input.upperBoundCents);
      const call: BudgetCall = {
        id: randomUUID(),
        ...owner,
        ...input,
        executionId,
        inputHash,
        reservedPromoCents: promo,
        reservedPaidCents: input.upperBoundCents - promo,
        status: 'AUTHORIZED',
      };
      await db.insert(inferenceCalls).values({
        id: call.id,
        tenantId: owner.tenantId,
        executionId,
        callId: input.callId,
        operationKey: input.operationKey,
        payloadJson: JSON.stringify(call),
      });
      return { ...call, shouldExecute: true };
    });
  }
  private async reconcile(
    owner: AgenticOwner,
    executionId: string,
    callId: string,
    reason: string,
  ): Promise<BudgetCall> {
    return this.locked(owner, async (db) => {
      const budget = await this.owned(db, owner, executionId);
      const call = await readCall(db, executionId, callId);
      if (!call) throw new Error('CALL_NOT_FOUND');
      if (['SETTLED', 'CANCELLED', 'PROVISIONED'].includes(call.status)) throw new Error('CALL_TERMINAL');
      const updated: BudgetCall = { ...call, status: 'RECONCILIATION_REQUIRED', reason };
      await saveCall(db, updated);
      await saveBudget(db, { ...budget, status: 'RECONCILIATION_REQUIRED' });
      return updated;
    });
  }
  private async prepareSettlement(
    owner: AgenticOwner,
    executionId: string,
    callId: string,
    actualCostCents: number,
    fingerprint: string,
    kind: BudgetCall['kind'],
  ) {
    return this.locked(owner, async (db) => {
      await this.owned(db, owner, executionId);
      const call = await readCall(db, executionId, callId);
      if (!call || call.kind !== kind) throw new Error('CALL_NOT_FOUND');
      if (call.status === 'PROVISIONED') throw new Error('CALL_TERMINAL');
      if (call.status === 'CANCELLED' || call.status === 'RECONCILIATION_REQUIRED')
        throw new Error('CALL_REQUIRES_RECONCILIATION');
      if (
        call.settlement &&
        (call.settlement.fingerprint !== fingerprint || call.settlement.actualCostCents !== actualCostCents)
      )
        throw new Error('IDEMPOTENCY_CONFLICT');
      if (actualCostCents > call.upperBoundCents) throw new Error('BUDGET_EXCEEDED');
      const updated: BudgetCall =
        call.status === 'SETTLED'
          ? call
          : { ...call, status: 'SETTLING', settlement: { actualCostCents, fingerprint } };
      await saveCall(db, updated);
      return updated;
    });
  }
  /**
   * Internal accounting closure for an authorized, terminal execution with no measurable usage.
   * Retains the complete preauthorized upper bound as a provision, never as reported usage,
   * provider actual cost, a customer debit, or a claim that an external invoice was reconciled.
   */
  async provisionCancelledProviderCall(
    owner: AgenticOwner,
    executionId: string,
    raw: {
      callId: string;
      approvalReference: string;
      evidenceReference: string;
    },
  ): Promise<BudgetCall> {
    const input = z.object({ callId: id, approvalReference: id, evidenceReference: id }).strict().parse(raw);
    return this.locked(owner, async (db) => {
      const budget = await this.owned(db, owner, executionId);
      if (input.approvalReference !== budget.policy.approvalReference) throw new Error('APPROVAL_MISMATCH');
      const call = await readCall(db, executionId, input.callId);
      if (!call || call.kind !== 'PROVIDER' || call.tenantId !== owner.tenantId || call.userId !== owner.userId)
        throw new Error('CALL_NOT_FOUND');
      const fingerprint = hash({ ...input, amountCents: call.upperBoundCents, basis: 'UPPER_BOUND' });
      if (call.status === 'PROVISIONED') {
        if (call.provision?.fingerprint !== fingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
        return call;
      }
      const execution = await this.execution(db, owner, executionId);
      if (!execution || !['CANCELLED', 'FAILED'].includes(execution.status)) throw new Error('EXECUTION_NOT_TERMINAL');
      if (call.status !== 'RECONCILIATION_REQUIRED') throw new Error('CALL_REQUIRES_RECONCILIATION');
      if (
        call.settlement ||
        call.reservedPaidCents + call.reservedPromoCents !== call.upperBoundCents ||
        call.reservedPaidCents > budget.remainingPaidCents ||
        call.reservedPromoCents > budget.remainingPromoCents
      )
        throw new Error('BUDGET_INVARIANT');
      const updated: BudgetCall = {
        ...call,
        status: 'PROVISIONED',
        provision: {
          basis: 'UPPER_BOUND',
          amountCents: call.upperBoundCents,
          actualCostCents: null,
          usage: null,
          approvalReference: input.approvalReference,
          evidenceReference: input.evidenceReference,
          fingerprint,
          recordedAt: new Date().toISOString(),
        },
      };
      await saveCall(db, updated);
      const remaining = (await this.calls(db, executionId)).filter(pending);
      await saveBudget(db, {
        ...budget,
        remainingPaidCents: budget.remainingPaidCents - call.reservedPaidCents,
        remainingPromoCents: budget.remainingPromoCents - call.reservedPromoCents,
        provisionedCents: (budget.provisionedCents ?? 0) + call.upperBoundCents,
        status: remaining.length ? 'RECONCILIATION_REQUIRED' : 'CLOSING',
      });
      return updated;
    });
  }
  async settleProviderCall(
    owner: AgenticOwner,
    executionId: string,
    input: { callId: string; usage: NormalizedUsage | null; actualCostCents: number | null },
  ): Promise<BudgetCall> {
    const budget = await this.locked(owner, (db) => this.owned(db, owner, executionId));
    const call = await readCall(this.db, executionId, input.callId);
    if (!call || call.kind !== 'PROVIDER') throw new Error('CALL_NOT_FOUND');
    const parsed = NormalizedUsageSchema.safeParse(input.usage);
    if (!parsed.success || input.actualCostCents === null)
      return this.reconcile(owner, executionId, input.callId, 'USAGE_UNMEASURABLE');
    const usage = parsed.data;
    let expected: number;
    try {
      expected = this.price(budget.policy, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens);
    } catch {
      return this.reconcile(owner, executionId, input.callId, 'PRICE_UNAVAILABLE');
    }
    if (
      !cents.safeParse(input.actualCostCents).success ||
      usage.provider !== budget.policy.provider ||
      usage.model !== budget.policy.model ||
      usage.inputTokens > call.inputTokens ||
      usage.outputTokens > call.maxOutputTokens ||
      input.actualCostCents !== expected ||
      expected > call.upperBoundCents
    )
      return this.reconcile(owner, executionId, input.callId, 'PROVIDER_LIMIT_OR_PRICE_MISMATCH');
    const ready = await this.prepareSettlement(
      owner,
      executionId,
      input.callId,
      expected,
      hash({ usage, actualCostCents: expected }),
      'PROVIDER',
    );
    if (ready.status === 'SETTLED') return ready;
    await this.ledger.executeBillableOperation({
      ...owner,
      idempotencyKey: ready.operationKey,
      requestFingerprint: ready.settlement!.fingerprint,
      costCents: expected,
      budgetFunding: { executionId, callId: input.callId },
      usage: {
        provider: usage.provider,
        model: usage.model,
        capability: 'agentic.inference',
        sessionId: executionId,
        monetaryCostCents: expected,
      },
      operation: async () => ({ usage, actualCostCents: expected }),
    });
    return (await readCall(this.db, executionId, input.callId))!;
  }
  async executeResearchCall<T>(
    owner: AgenticOwner,
    executionId: string,
    input: {
      callId: string;
      idempotencyKey: string;
      costCents: number;
      requestFingerprint: string;
      operation: () => Promise<T>;
    },
  ) {
    id.parse(input.callId);
    id.parse(input.idempotencyKey);
    id.parse(input.requestFingerprint);
    cents.positive().parse(input.costCents);
    const authorization = await this.authorize(owner, executionId, {
      callId: input.callId,
      upperBoundCents: input.costCents,
      kind: 'RESEARCH',
      inputTokens: 0,
      maxOutputTokens: 0,
      operationKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
    });
    // A durable authorization is single-dispatch, even if the legacy operation lease expires.
    if (!authorization.shouldExecute && authorization.status !== 'SETTLED') throw new Error('CALL_ALREADY_AUTHORIZED');
    const ready = await this.prepareSettlement(
      owner,
      executionId,
      input.callId,
      input.costCents,
      input.requestFingerprint,
      'RESEARCH',
    );
    try {
      return await this.ledger.executeBillableOperation({
        ...owner,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        costCents: input.costCents,
        budgetFunding: { executionId, callId: ready.callId },
        usage: { capability: 'legal.research', toolName: 'search_case_law', sessionId: executionId },
        operation: input.operation,
      });
    } catch (error) {
      const current = await readCall(this.db, executionId, input.callId);
      if (current?.status !== 'SETTLED')
        await this.reconcile(owner, executionId, input.callId, 'RESEARCH_OUTCOME_UNCERTAIN');
      throw error;
    }
  }
  async executeProviderCall<T>(
    owner: AgenticOwner,
    executionId: string,
    quote: z.infer<typeof quoteSchema>,
    operation: () => Promise<{ data: T; usage: NormalizedUsage | null; actualCostCents: number | null }>,
  ) {
    const authorization = await this.authorizeProviderCall(owner, executionId, quote);
    if (!authorization.shouldExecute) throw new Error('CALL_ALREADY_AUTHORIZED');
    let result: Awaited<ReturnType<typeof operation>>;
    try {
      result = await operation();
    } catch (error) {
      await this.reconcile(owner, executionId, quote.callId, 'PROVIDER_OUTCOME_UNCERTAIN');
      throw error;
    }
    const settlement = await this.settleProviderCall(owner, executionId, {
      callId: quote.callId,
      usage: result.usage,
      actualCostCents: result.actualCostCents,
    });
    return { ...result, settlement };
  }
  async releaseUnusedBudget(owner: AgenticOwner, executionId: string): Promise<BudgetRecord> {
    return this.locked(owner, async (db, account) => {
      const budget = await this.owned(db, owner, executionId);
      const calls = (await this.calls(db, executionId)).filter(pending);
      const heldPaid = calls.reduce((n, c) => n + c.reservedPaidCents, 0),
        heldPromo = calls.reduce((n, c) => n + c.reservedPromoCents, 0);
      const paid = budget.remainingPaidCents - heldPaid,
        promo = budget.remainingPromoCents - heldPromo;
      const validPromo = budget.promoExpiresAt && Date.parse(budget.promoExpiresAt) > Date.now() ? promo : 0;
      if (paid < 0 || promo < 0) throw new Error('BUDGET_INVARIANT');
      await db
        .update(ledgerAccounts)
        .set({
          paidBalanceCents: account.paidBalanceCents + paid,
          promotionalBalanceCents: account.promotionalBalanceCents + validPromo,
        })
        .where(eq(ledgerAccounts.id, account.id));
      const updated: BudgetRecord = {
        ...budget,
        remainingPaidCents: heldPaid,
        remainingPromoCents: heldPromo,
        releasedCents: budget.releasedCents + paid + validPromo,
        expiredPromoCents: budget.expiredPromoCents + promo - validPromo,
        status: calls.length
          ? budget.status === 'RECONCILIATION_REQUIRED'
            ? 'RECONCILIATION_REQUIRED'
            : 'CLOSING'
          : 'RELEASED',
      };
      await saveBudget(db, updated);
      return updated;
    });
  }
}
