import { createHash, randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AgenticOwnerSchema, type AgenticOwner, type AgenticExecution } from '@forgelex/domain';
import { AgenticWorkspaceRepository, lockAgenticTenant, type ForgeLexDatabase } from '@forgelex/persistence';
import { LedgerService } from './ledger-service.js';
import { billingOperations, ledgerAccounts, ledgerEntries, usageEvents } from './schema/ledger-schema.js';
import { billingCreditLots } from './schema/billing-schema.js';
import { commercialCalls, commercialExecutions } from './schema/commercial-inference-schema.js';

export const COMMERCIAL_POLICY_VERSION = 'commercial-brl-2026-10-30-v1';
export const COMMERCIAL_POLICY = Object.freeze({
  version: COMMERCIAL_POLICY_VERSION,
  currency: 'BRL' as const,
  reserveCents: 500,
  minimumCents: 50,
  maxInferenceMicroUsd: 250000,
  maxCalls: 24,
  dailyLimitCents: 2000,
  monthlyLimitCents: 10000,
  maxOutputTokens: 2048,
  maxDurationMs: 300000,
  provider: 'openai',
  model: 'gpt-6.1-sol',
  inputMicroUsdPerMillion: 2000000,
  outputMicroUsdPerMillion: 10000000,
  cachedInputMicroUsdPerMillion: 100000,
  centsPerUsd: 1800,
  fixedCents: 25,
  timezone: 'America/Fortaleza',
});
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const identifier = z.string().trim().min(1).max(200);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const callInput = z.object({
  callId: identifier,
  inputTokens: integer,
  maxOutputTokens: integer.positive(),
  upperBoundMicroUsd: integer.positive(),
});
const usageInput = z.object({ inputTokens: integer, outputTokens: integer, cachedInputTokens: integer.optional() });
export interface CommercialCall {
  id: string;
  tenantId: string;
  userId: string;
  executionId: string;
  callId: string;
  status: 'AUTHORIZED' | 'SETTLED' | 'UNCERTAIN' | 'VOID';
  inputTokens: number;
  maxOutputTokens: number;
  upperBoundMicroUsd: number;
  actualMicroUsd: number | null;
  inputHash: string;
  usageHash?: string;
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
  authorizedAt: string;
  settledAt?: string;
}
export interface CommercialReceipt {
  executionId: string;
  tenantId: string;
  userId: string;
  currency: 'BRL';
  policyVersion: string;
  reservedCents: number;
  chargedCents: number;
  releasedCents: number;
  expiredPromoCents: number;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  measuredMicroUsd: number;
  /** Upper bound of unresolved operational liability, never an invented actual cost. */
  uncertainMicroUsd: number;
  createdAt: string;
  finalizedAt?: string;
}
interface CommercialRecord extends CommercialReceipt {
  id: string;
  accountId: string;
  idempotencyKey: string;
  inputHash: string;
  policy: typeof COMMERCIAL_POLICY;
  reservedPaidCents: number;
  reservedPromoCents: number;
  promoExpiresAt: string | null;
  firstAuthorizedAt?: string;
}
export interface CommercialQuote {
  currency: 'BRL';
  policyVersion: string;
  minCostCents: number;
  maxCostCents: number;
  availableCents: number;
  dailyLimitCents: number;
  monthlyLimitCents: number;
}
export function commercialPriceCents(microUsd: number): number {
  integer.parse(microUsd);
  return priceForPolicy(COMMERCIAL_POLICY, microUsd);
}
function priceForPolicy(policy: typeof COMMERCIAL_POLICY, microUsd: number): number {
  return Math.max(
    policy.minimumCents,
    Number((BigInt(microUsd) * BigInt(policy.centsPerUsd) + 999999n) / 1000000n) + policy.fixedCents,
  );
}
function providerPrice(
  policy: {
    inputMicroUsdPerMillion: number;
    outputMicroUsdPerMillion: number;
    cachedInputMicroUsdPerMillion: number;
  },
  input: number,
  output: number,
  cached = 0,
): number {
  if (cached > input) throw new Error('COMMERCIAL_USAGE_INVALID');
  const cost =
    BigInt(input - cached) * BigInt(policy.inputMicroUsdPerMillion) +
    BigInt(cached) * BigInt(policy.cachedInputMicroUsdPerMillion) +
    BigInt(output) * BigInt(policy.outputMicroUsdPerMillion);
  return Number((cost + 999999n) / 1000000n);
}
function periods(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return { day: `${part('year')}-${part('month')}-${part('day')}`, month: `${part('year')}-${part('month')}` };
}
function receipt(record: CommercialRecord): CommercialReceipt {
  const {
    executionId,
    tenantId,
    userId,
    currency,
    policyVersion,
    reservedCents,
    chargedCents,
    releasedCents,
    expiredPromoCents,
    status,
    measuredMicroUsd,
    uncertainMicroUsd,
    createdAt,
    finalizedAt,
  } = record;
  return {
    executionId,
    tenantId,
    userId,
    currency,
    policyVersion,
    reservedCents,
    chargedCents,
    releasedCents,
    expiredPromoCents,
    status,
    measuredMicroUsd,
    uncertainMicroUsd,
    createdAt,
    ...(finalizedAt ? { finalizedAt } : {}),
  };
}

/** Trusted server composition. Wallet is BRL; provider obligations are recorded separately in micro-USD. */
export class CommercialInferenceService {
  private readonly ledger: LedgerService;
  constructor(
    private readonly db: ForgeLexDatabase,
    client: Client,
    private readonly options: {
      now?: () => Date;
      lookupExecution?: (owner: AgenticOwner, executionId: string) => Promise<AgenticExecution | undefined>;
    } = {},
  ) {
    this.ledger = new LedgerService(db, client, { migrationMode: 'verify' });
  }
  async verifyReady(): Promise<void> {
    await this.ledger.runMigrations();
  }
  private now() {
    return (this.options.now?.() ?? new Date()).toISOString();
  }
  private async locked<T>(
    owner: AgenticOwner,
    task: (db: ForgeLexDatabase, account: typeof ledgerAccounts.$inferSelect) => Promise<T>,
  ) {
    AgenticOwnerSchema.parse(owner);
    return this.db.transaction(async (tx) => {
      const db = tx as unknown as ForgeLexDatabase;
      await lockAgenticTenant(db, owner.tenantId);
      const [account] = await db
        .update(ledgerAccounts)
        .set({ updatedAt: sql`${ledgerAccounts.updatedAt}` })
        .where(eq(ledgerAccounts.tenantId, owner.tenantId))
        .returning();
      if (!account) throw new Error('BILLING_ACCOUNT_NOT_PROVISIONED');
      return task(db, account);
    });
  }
  private async record(db: ForgeLexDatabase, owner: AgenticOwner, executionId: string) {
    const [row] = await db
      .select()
      .from(commercialExecutions)
      .where(
        and(
          eq(commercialExecutions.tenantId, owner.tenantId),
          eq(commercialExecutions.userId, owner.userId),
          eq(commercialExecutions.executionId, executionId),
        ),
      );
    if (!row) throw new Error('COMMERCIAL_EXECUTION_NOT_FOUND');
    return JSON.parse(row.payloadJson) as CommercialRecord;
  }
  private async save(db: ForgeLexDatabase, record: CommercialRecord) {
    await db
      .update(commercialExecutions)
      .set({ status: record.status, payloadJson: JSON.stringify(record) })
      .where(eq(commercialExecutions.id, record.id));
  }
  private async calls(db: ForgeLexDatabase, owner: AgenticOwner, executionId: string): Promise<CommercialCall[]> {
    return (
      await db
        .select()
        .from(commercialCalls)
        .where(
          and(
            eq(commercialCalls.tenantId, owner.tenantId),
            eq(commercialCalls.userId, owner.userId),
            eq(commercialCalls.executionId, executionId),
          ),
        )
    ).map((row) => JSON.parse(row.payloadJson));
  }
  private async saveCall(db: ForgeLexDatabase, call: CommercialCall) {
    await db
      .update(commercialCalls)
      .set({ status: call.status, payloadJson: JSON.stringify(call) })
      .where(eq(commercialCalls.id, call.id));
  }
  private async authorized(db: ForgeLexDatabase, owner: AgenticOwner, executionId: string) {
    const execution = this.options.lookupExecution
      ? await this.options.lookupExecution(owner, executionId)
      : await new AgenticWorkspaceRepository(db).getExecution(owner, executionId);
    if (
      !execution ||
      !execution.authorizationId ||
      execution.requiresReevaluation ||
      ['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution.status)
    )
      throw new Error('EXECUTION_NOT_AUTHORIZED');
  }
  private promo(account: typeof ledgerAccounts.$inferSelect) {
    return account.promoExpiresAt && account.promoExpiresAt > this.now() ? account.promotionalBalanceCents : 0;
  }
  private async available(db: ForgeLexDatabase, account: typeof ledgerAccounts.$inferSelect) {
    const pending = await db
      .select()
      .from(billingOperations)
      .where(and(eq(billingOperations.accountId, account.id), eq(billingOperations.status, 'PENDING')));
    // Even expired research leases can still represent an in-flight provider request.
    return (
      account.paidBalanceCents +
      this.promo(account) -
      pending.filter((p) => !p.fundingExecutionId).reduce((sum, p) => sum + p.reservedAmountCents, 0)
    );
  }
  async quote(owner: AgenticOwner): Promise<CommercialQuote> {
    return this.locked(owner, async (db, account) => ({
      currency: 'BRL',
      policyVersion: COMMERCIAL_POLICY_VERSION,
      minCostCents: 50,
      maxCostCents: 500,
      availableCents: Math.max(0, await this.available(db, account)),
      dailyLimitCents: 2000,
      monthlyLimitCents: 10000,
    }));
  }
  async getReceipt(owner: AgenticOwner, executionId: string): Promise<CommercialReceipt | undefined> {
    AgenticOwnerSchema.parse(owner);
    try {
      return receipt(await this.record(this.db, owner, executionId));
    } catch (e) {
      if (e instanceof Error && e.message === 'COMMERCIAL_EXECUTION_NOT_FOUND') return undefined;
      throw e;
    }
  }
  async listActive(owner: AgenticOwner): Promise<CommercialReceipt[]> {
    AgenticOwnerSchema.parse(owner);
    return (
      await this.db
        .select()
        .from(commercialExecutions)
        .where(
          and(
            eq(commercialExecutions.tenantId, owner.tenantId),
            eq(commercialExecutions.userId, owner.userId),
            eq(commercialExecutions.status, 'ACTIVE'),
          ),
        )
    ).map((row) => receipt(JSON.parse(row.payloadJson)));
  }
  async reserve(
    owner: AgenticOwner,
    raw: { executionId: string; idempotencyKey: string; requestFingerprint: string; policyVersion: string },
  ): Promise<CommercialReceipt> {
    const input = z
      .object({
        executionId: identifier,
        idempotencyKey: identifier,
        requestFingerprint: identifier,
        policyVersion: identifier,
      })
      .parse(raw);
    if (input.policyVersion !== COMMERCIAL_POLICY_VERSION) throw new Error('COMMERCIAL_POLICY_MISMATCH');
    const inputHash = hash(input);
    return this.locked(owner, async (db, account) => {
      const [existing] = await db
        .select()
        .from(commercialExecutions)
        .where(
          and(
            eq(commercialExecutions.tenantId, owner.tenantId),
            eq(commercialExecutions.userId, owner.userId),
            eq(commercialExecutions.idempotencyKey, input.idempotencyKey),
          ),
        );
      if (existing) {
        const previous: CommercialRecord = JSON.parse(existing.payloadJson);
        if (previous.inputHash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return receipt(previous);
      }
      await this.authorized(db, owner, input.executionId);
      const records: CommercialRecord[] = (
        await db.select().from(commercialExecutions).where(eq(commercialExecutions.accountId, account.id))
      ).map((row) => JSON.parse(row.payloadJson));
      if (records.some((r) => r.executionId === input.executionId)) throw new Error('IDEMPOTENCY_CONFLICT');
      if (records.some((r) => r.status === 'ACTIVE')) throw new Error('COMMERCIAL_EXECUTION_ACTIVE');
      const now = this.now(),
        period = periods(now);
      const spent = (key: 'day' | 'month') =>
        records.reduce(
          (sum, r) =>
            sum +
            (periods(r.createdAt)[key] === period[key]
              ? r.status === 'ACTIVE'
                ? r.reservedCents
                : r.chargedCents
              : 0),
          0,
        );
      if (spent('day') + 500 > 2000) throw new Error('COMMERCIAL_DAILY_LIMIT');
      if (spent('month') + 500 > 10000) throw new Error('COMMERCIAL_MONTHLY_LIMIT');
      if ((await this.available(db, account)) < 500) throw new Error('BILLING_INSUFFICIENT_BALANCE');
      const reservedPromoCents = Math.min(500, this.promo(account)),
        reservedPaidCents = 500 - reservedPromoCents;
      const record: CommercialRecord = {
        id: randomUUID(),
        ...owner,
        executionId: input.executionId,
        idempotencyKey: input.idempotencyKey,
        inputHash,
        accountId: account.id,
        currency: 'BRL',
        policyVersion: COMMERCIAL_POLICY_VERSION,
        policy: COMMERCIAL_POLICY,
        reservedCents: 500,
        chargedCents: 0,
        releasedCents: 0,
        status: 'ACTIVE',
        measuredMicroUsd: 0,
        uncertainMicroUsd: 0,
        createdAt: now,
        reservedPaidCents,
        reservedPromoCents,
        promoExpiresAt: account.promoExpiresAt,
        expiredPromoCents: 0,
      };
      await db.insert(commercialExecutions).values({
        id: record.id,
        ...owner,
        accountId: account.id,
        executionId: input.executionId,
        idempotencyKey: input.idempotencyKey,
        status: record.status,
        payloadJson: JSON.stringify(record),
      });
      await db
        .update(ledgerAccounts)
        .set({
          paidBalanceCents: account.paidBalanceCents - reservedPaidCents,
          promotionalBalanceCents: account.promotionalBalanceCents - reservedPromoCents,
          updatedAt: now,
        })
        .where(eq(ledgerAccounts.id, account.id));
      await this.entry(db, record, 'RESERVE', 'PAID', reservedPaidCents);
      await this.entry(db, record, 'RESERVE', 'PROMOTIONAL', reservedPromoCents);
      return receipt(record);
    });
  }
  async authorizeCall(
    owner: AgenticOwner,
    executionId: string,
    raw: z.infer<typeof callInput>,
  ): Promise<CommercialCall & { shouldExecute: boolean }> {
    const input = callInput.parse(raw),
      inputHash = hash(input);
    return this.locked(owner, async (db) => {
      const record = await this.record(db, owner, executionId),
        calls = await this.calls(db, owner, executionId);
      const existing = calls.find((c) => c.callId === input.callId);
      if (existing) {
        if (existing.inputHash !== inputHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return { ...existing, shouldExecute: false };
      }
      if (record.status !== 'ACTIVE') throw new Error('COMMERCIAL_EXECUTION_NOT_ACTIVE');
      await this.authorized(db, owner, executionId);
      if (calls.some((c) => c.status === 'AUTHORIZED' || c.status === 'UNCERTAIN'))
        throw new Error('COMMERCIAL_RECONCILIATION_REQUIRED');
      const now = this.now();
      if (
        record.firstAuthorizedAt &&
        Date.parse(now) - Date.parse(record.firstAuthorizedAt) >= record.policy.maxDurationMs
      )
        throw new Error('COMMERCIAL_TIME_LIMIT');
      if (
        calls.length >= record.policy.maxCalls ||
        input.maxOutputTokens > record.policy.maxOutputTokens ||
        input.upperBoundMicroUsd <
          providerPrice(
            {
              ...record.policy,
              inputMicroUsdPerMillion: Math.max(
                record.policy.inputMicroUsdPerMillion,
                record.policy.cachedInputMicroUsdPerMillion,
              ),
            },
            input.inputTokens,
            input.maxOutputTokens,
          )
      )
        throw new Error('COMMERCIAL_CALL_LIMIT');
      if (
        calls.reduce((sum, c) => sum + (c.actualMicroUsd ?? c.upperBoundMicroUsd), 0) + input.upperBoundMicroUsd >
        record.policy.maxInferenceMicroUsd
      )
        throw new Error('COMMERCIAL_INFERENCE_LIMIT');
      const call: CommercialCall = {
        id: randomUUID(),
        ...owner,
        executionId,
        ...input,
        inputHash,
        status: 'AUTHORIZED',
        actualMicroUsd: null,
        authorizedAt: now,
      };
      await db.insert(commercialCalls).values({
        id: call.id,
        ...owner,
        executionId,
        callId: call.callId,
        status: call.status,
        payloadJson: JSON.stringify(call),
      });
      record.firstAuthorizedAt ??= now;
      await this.save(db, record);
      return { ...call, shouldExecute: true };
    });
  }
  async settleCall(
    owner: AgenticOwner,
    executionId: string,
    callId: string,
    raw: z.infer<typeof usageInput>,
  ): Promise<CommercialCall> {
    const usage = usageInput.parse(raw),
      usageHash = hash({ ...usage, cachedInputTokens: usage.cachedInputTokens ?? 0 });
    return this.locked(owner, async (db) => {
      const record = await this.record(db, owner, executionId),
        calls = await this.calls(db, owner, executionId),
        call = calls.find((c) => c.callId === callId);
      if (!call) throw new Error('COMMERCIAL_CALL_NOT_FOUND');
      if (call.status === 'VOID') throw new Error('COMMERCIAL_CALL_NOT_DISPATCHED');
      if (call.status === 'SETTLED') {
        if (call.usageHash !== usageHash) throw new Error('IDEMPOTENCY_CONFLICT');
        return call;
      }
      const actual = providerPrice(record.policy, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens);
      if (
        usage.inputTokens > call.inputTokens ||
        usage.outputTokens > call.maxOutputTokens ||
        actual > call.upperBoundMicroUsd
      )
        throw new Error('COMMERCIAL_USAGE_INVALID');
      call.status = 'SETTLED';
      call.actualMicroUsd = actual;
      call.usageHash = usageHash;
      call.usage = { ...usage, cachedInputTokens: usage.cachedInputTokens ?? 0 };
      call.settledAt = this.now();
      await this.saveCall(db, call);
      record.measuredMicroUsd = calls.reduce((sum, c) => sum + (c.actualMicroUsd ?? 0), 0);
      record.uncertainMicroUsd = calls
        .filter((c) => c.status === 'UNCERTAIN')
        .reduce((sum, c) => sum + c.upperBoundMicroUsd, 0);
      // Late reconciliation resolves only operational liability; it never creates a new customer charge.
      await this.save(db, record);
      return call;
    });
  }
  async markUncertain(owner: AgenticOwner, executionId: string, callId: string): Promise<CommercialCall> {
    return this.locked(owner, async (db) => {
      const record = await this.record(db, owner, executionId),
        calls = await this.calls(db, owner, executionId),
        call = calls.find((c) => c.callId === callId);
      if (!call) throw new Error('COMMERCIAL_CALL_NOT_FOUND');
      if (call.status === 'SETTLED' || call.status === 'VOID') return call;
      call.status = 'UNCERTAIN';
      await this.saveCall(db, call);
      record.uncertainMicroUsd = calls
        .filter((c) => c.status === 'UNCERTAIN')
        .reduce((sum, c) => sum + c.upperBoundMicroUsd, 0);
      await this.save(db, record);
      return call;
    });
  }
  /** Trusted transport must establish that no HTTP request was sent; never use for a timeout. */
  async markNotDispatched(owner: AgenticOwner, executionId: string, callId: string): Promise<CommercialCall> {
    return this.locked(owner, async (db) => {
      const record = await this.record(db, owner, executionId),
        calls = await this.calls(db, owner, executionId),
        call = calls.find((c) => c.callId === callId);
      if (!call) throw new Error('COMMERCIAL_CALL_NOT_FOUND');
      if (call.status === 'VOID') return call;
      if (call.status !== 'AUTHORIZED' && call.status !== 'UNCERTAIN')
        throw new Error('COMMERCIAL_CALL_ALREADY_DISPATCHED');
      call.status = 'VOID';
      call.actualMicroUsd = 0;
      await this.saveCall(db, call);
      record.uncertainMicroUsd = calls
        .filter((c) => c.status === 'UNCERTAIN')
        .reduce((sum, c) => sum + c.upperBoundMicroUsd, 0);
      await this.save(db, record);
      return call;
    });
  }
  private async entry(
    db: ForgeLexDatabase,
    record: CommercialRecord,
    kind: string,
    bucket: string,
    amountCents: number,
    usageEventId?: string,
  ) {
    if (!amountCents) return;
    await db.insert(ledgerEntries).values({
      id: randomUUID(),
      accountId: record.accountId,
      idempotencyKey: `commercial:${record.executionId}:${kind}:${bucket}`,
      kind,
      bucket,
      amountCents,
      createdAt: this.now(),
      usageEventId: usageEventId ?? null,
    });
  }
  async finalize(
    owner: AgenticOwner,
    executionId: string,
    raw: { usableDelivery: boolean; outcome: 'COMPLETED' | 'FAILED' | 'CANCELLED' },
  ): Promise<CommercialReceipt> {
    const input = z
      .object({ usableDelivery: z.boolean(), outcome: z.enum(['COMPLETED', 'FAILED', 'CANCELLED']) })
      .parse(raw);
    return this.locked(owner, async (db, account) => {
      const record = await this.record(db, owner, executionId);
      if (record.status !== 'ACTIVE') return receipt(record);
      const calls = await this.calls(db, owner, executionId);
      for (const call of calls)
        if (call.status === 'AUTHORIZED') {
          call.status = 'UNCERTAIN';
          await this.saveCall(db, call);
        }
      record.measuredMicroUsd = calls.reduce((sum, c) => sum + (c.actualMicroUsd ?? 0), 0);
      record.uncertainMicroUsd = calls
        .filter((c) => c.status === 'UNCERTAIN')
        .reduce((sum, c) => sum + c.upperBoundMicroUsd, 0);
      record.chargedCents =
        input.usableDelivery && calls.some((c) => c.status === 'SETTLED')
          ? Math.min(record.reservedCents, priceForPolicy(record.policy, record.measuredMicroUsd))
          : 0;
      const chargedPromo = Math.min(record.reservedPromoCents, record.chargedCents),
        chargedPaid = record.chargedCents - chargedPromo;
      const releasedPaid = record.reservedPaidCents - chargedPaid,
        unusedPromo = record.reservedPromoCents - chargedPromo;
      const releasedPromo = record.promoExpiresAt && record.promoExpiresAt > this.now() ? unusedPromo : 0;
      record.expiredPromoCents = unusedPromo - releasedPromo;
      record.releasedCents = releasedPaid + releasedPromo;
      record.status = input.outcome;
      record.finalizedAt = this.now();
      await db
        .update(ledgerAccounts)
        .set({
          paidBalanceCents: account.paidBalanceCents + releasedPaid,
          promotionalBalanceCents: account.promotionalBalanceCents + releasedPromo,
          updatedAt: this.now(),
        })
        .where(eq(ledgerAccounts.id, account.id));
      let usageEventId: string | undefined;
      if (record.chargedCents) {
        usageEventId = randomUUID();
        await db.insert(usageEvents).values({
          id: usageEventId,
          ...owner,
          capability: 'agentic.commercial_execution',
          provider: record.policy.provider,
          model: record.policy.model,
          units: 1,
          monetaryCostCents: record.chargedCents,
          requestId: `commercial:${executionId}`,
          occurredAt: this.now(),
        });
        let remaining = chargedPaid;
        const lots = await db
          .select()
          .from(billingCreditLots)
          .where(eq(billingCreditLots.tenantId, owner.tenantId))
          .orderBy(asc(billingCreditLots.createdAt));
        for (const lot of lots) {
          if (!remaining) break;
          const used = Math.min(remaining, lot.remainingCents);
          if (used)
            await db
              .update(billingCreditLots)
              .set({ remainingCents: lot.remainingCents - used, updatedAt: this.now() })
              .where(eq(billingCreditLots.id, lot.id));
          remaining -= used;
        }
      }
      await this.entry(db, record, 'DEBIT', 'PAID', chargedPaid, usageEventId);
      await this.entry(db, record, 'DEBIT', 'PROMOTIONAL', chargedPromo, usageEventId);
      await this.entry(db, record, 'RELEASE', 'PAID', releasedPaid);
      await this.entry(db, record, 'RELEASE', 'PROMOTIONAL', releasedPromo);
      await this.entry(db, record, 'EXPIRATION', 'PROMOTIONAL', record.expiredPromoCents);
      await this.save(db, record);
      return receipt(record);
    });
  }
}
