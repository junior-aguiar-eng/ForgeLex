import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { DomainError } from '@forgelex/domain';
import { lockAgenticTenant, type ForgeLexDatabase } from '@forgelex/persistence';
import { billingCreditLots, billingRefundRequests, billingPurchases, billingPayments } from './schema/billing-schema.js';
import { ledgerAccounts, ledgerEntries, billingOperations } from './schema/ledger-schema.js';
import { calculateRefundableCents } from './billing-rules.js';
import { LedgerService } from './ledger-service.js';

export interface CreditSettlementInput {
  tenantId: string;
  purchaseId: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface BillingLedgerResult {
  creditedCents?: number;
  refundedCents?: number;
  isReplay: boolean;
  remainingBalanceCents: number;
}

export class BillingService {
  private readonly ledger: LedgerService;
  private readonly tenantLocks = new Map<string, Promise<void>>();

  public constructor(private readonly db: ForgeLexDatabase, client?: Client) {
    this.ledger = new LedgerService(db, client);
  }

  public async runMigrations(): Promise<void> {
    await this.ledger.runMigrations();
  }

  public async getAccount(tenantId: string): Promise<typeof ledgerAccounts.$inferSelect> {
    await this.runMigrations();
    return this.ledger.provisionAccount(tenantId);
  }

  public async getCreditLots(tenantId: string): Promise<typeof billingCreditLots.$inferSelect[]> {
    await this.runMigrations();
    return this.db
      .select()
      .from(billingCreditLots)
      .where(eq(billingCreditLots.tenantId, tenantId))
      .orderBy(asc(billingCreditLots.createdAt));
  }

  public async creditPurchase(input: CreditSettlementInput, settlement?: { validate: (tx: ForgeLexDatabase) => Promise<boolean>; complete: (tx: ForgeLexDatabase) => Promise<void> }): Promise<BillingLedgerResult> {
    this.validateAmount(input.amountCents);
    this.validateKey(input.idempotencyKey);
    await this.runMigrations();

    return this.withTenantLock(input.tenantId, async () => this.db.transaction(async (transaction) => {
      const account = await this.lockAccount(transaction as unknown as ForgeLexDatabase, input.tenantId);
      if (!account) throw new DomainError('BILLING_ACCOUNT_NOT_PROVISIONED', 'Carteira de billing não provisionada.');

      if (settlement && !await settlement.validate(transaction as unknown as ForgeLexDatabase)) return { creditedCents: 0, isReplay: true, remainingBalanceCents: account.paidBalanceCents + account.promotionalBalanceCents };

      const existingPurchaseLot = await transaction
        .select()
        .from(billingCreditLots)
        .where(and(eq(billingCreditLots.tenantId, input.tenantId), eq(billingCreditLots.purchaseId, input.purchaseId)));
      if (existingPurchaseLot[0]) {
        await settlement?.complete(transaction as unknown as ForgeLexDatabase);
        return { creditedCents: 0, isReplay: true, remainingBalanceCents: account.paidBalanceCents + account.promotionalBalanceCents };
      }

      const existingEntry = await transaction
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, account.id), eq(ledgerEntries.idempotencyKey, input.idempotencyKey)));
      if (existingEntry[0]) {
        await settlement?.complete(transaction as unknown as ForgeLexDatabase);
        return { creditedCents: 0, isReplay: true, remainingBalanceCents: account.paidBalanceCents + account.promotionalBalanceCents };
      }

      const now = new Date().toISOString();
      const nextBalance = account.paidBalanceCents + input.amountCents;
      await transaction
        .update(ledgerAccounts)
        .set({ paidBalanceCents: nextBalance, updatedAt: now })
        .where(eq(ledgerAccounts.id, account.id));
      await transaction.insert(ledgerEntries).values({
        id: randomUUID(),
        accountId: account.id,
        usageEventId: null,
        idempotencyKey: input.idempotencyKey,
        kind: 'CREDIT',
        bucket: 'PAID',
        amountCents: input.amountCents,
        operationResultSnapshot: JSON.stringify({ purchaseId: input.purchaseId, amountCents: input.amountCents }),
        createdAt: now,
      });
      await transaction.insert(billingCreditLots).values({
        id: randomUUID(),
        tenantId: input.tenantId,
        purchaseId: input.purchaseId,
        accountId: account.id,
        grantedCents: input.amountCents,
        remainingCents: input.amountCents,
        createdAt: now,
        updatedAt: now,
      });

      await settlement?.complete(transaction as unknown as ForgeLexDatabase);
      return { creditedCents: input.amountCents, isReplay: false, remainingBalanceCents: nextBalance + account.promotionalBalanceCents };
    }));
  }

  public async debitPaidCredits(input: {
    tenantId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<BillingLedgerResult> {
    this.validateAmount(input.amountCents);
    this.validateKey(input.idempotencyKey);
    await this.runMigrations();

    return this.withTenantLock(input.tenantId, async () => this.db.transaction(async (transaction) => {
      const account = await this.lockAccount(transaction as unknown as ForgeLexDatabase, input.tenantId);
      if (!account) throw new DomainError('BILLING_ACCOUNT_NOT_PROVISIONED', 'Carteira de billing não provisionada.');
      const existingEntry = await transaction
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, account.id), eq(ledgerEntries.idempotencyKey, input.idempotencyKey)));
      if (existingEntry[0]) return { creditedCents: 0, isReplay: true, remainingBalanceCents: account.paidBalanceCents + account.promotionalBalanceCents };
      if (account.paidBalanceCents < input.amountCents) throw new DomainError('TOOL_EXECUTION_FAILED', 'BILLING_INSUFFICIENT_PAID_BALANCE');

      const now = new Date().toISOString();
      const nextBalance = account.paidBalanceCents - input.amountCents;
      await transaction.update(ledgerAccounts).set({ paidBalanceCents: nextBalance, updatedAt: now }).where(eq(ledgerAccounts.id, account.id));
      await this.consumeLots(transaction, input.tenantId, input.amountCents, now);
      await transaction.insert(ledgerEntries).values({
        id: randomUUID(),
        accountId: account.id,
        usageEventId: null,
        idempotencyKey: input.idempotencyKey,
        kind: 'DEBIT',
        bucket: 'PAID',
        amountCents: input.amountCents,
        operationResultSnapshot: null,
        createdAt: now,
      });
      return { creditedCents: 0, isReplay: false, remainingBalanceCents: nextBalance + account.promotionalBalanceCents };
    }));
  }

  public async refundUnusedCredits(input: {
    tenantId: string;
    purchaseId: string;
    idempotencyKey: string;
    amountCents?: number;
  }): Promise<BillingLedgerResult> {
    this.validateKey(input.idempotencyKey);
    await this.runMigrations();

    return this.withTenantLock(input.tenantId, async () => this.db.transaction(async (transaction) => {
      const account = await this.lockAccount(transaction as unknown as ForgeLexDatabase, input.tenantId);
      if (!account) throw new DomainError('BILLING_ACCOUNT_NOT_PROVISIONED', 'Carteira de billing não provisionada.');
      const existingEntry = await transaction
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, account.id), eq(ledgerEntries.idempotencyKey, input.idempotencyKey)));
      if (existingEntry[0]) return { refundedCents: 0, isReplay: true, remainingBalanceCents: account.paidBalanceCents + account.promotionalBalanceCents };

      const lotRows = await transaction
        .select()
        .from(billingCreditLots)
        .where(and(eq(billingCreditLots.tenantId, input.tenantId), eq(billingCreditLots.purchaseId, input.purchaseId)));
      const lot = lotRows[0];
      if (!lot) throw new DomainError('TOOL_EXECUTION_FAILED', 'BILLING_PURCHASE_NOT_FOUND');
      const refundableCents = calculateRefundableCents({ purchaseAmountCents: lot.grantedCents, remainingCreditCents: lot.remainingCents });
      const refundCents = input.amountCents === undefined
        ? refundableCents
        : Math.min(refundableCents, input.amountCents);
      if (!Number.isInteger(refundCents) || refundCents <= 0) throw new DomainError('TOOL_EXECUTION_FAILED', 'BILLING_REFUND_AMOUNT_INVALID');
      if (refundCents > account.paidBalanceCents) throw new DomainError('TOOL_EXECUTION_FAILED', 'BILLING_REFUND_BALANCE_INCONSISTENT');

      const now = new Date().toISOString();
      await transaction.update(billingCreditLots).set({ remainingCents: lot.remainingCents - refundCents, updatedAt: now }).where(eq(billingCreditLots.id, lot.id));
      await transaction.update(ledgerAccounts).set({ paidBalanceCents: account.paidBalanceCents - refundCents, updatedAt: now }).where(eq(ledgerAccounts.id, account.id));
      await transaction.insert(ledgerEntries).values({
        id: randomUUID(),
        accountId: account.id,
        usageEventId: null,
        idempotencyKey: input.idempotencyKey,
        kind: 'REFUND',
        bucket: 'PAID',
        amountCents: refundCents,
        operationResultSnapshot: JSON.stringify({ purchaseId: input.purchaseId, refundedCents: refundCents }),
        createdAt: now,
      });
      return { refundedCents: refundCents, isReplay: false, remainingBalanceCents: account.paidBalanceCents - refundCents + account.promotionalBalanceCents };
    }));
  }

  /** Reserve by removing spendable value, atomically with the durable provider intent. */
  public async prepareRefund(input: { requestId: string; reviewerId: string; decision: 'APPROVED' | 'REJECTED'; approvedAmountCents?: number; reason?: string }): Promise<typeof billingRefundRequests.$inferSelect> {
    await this.runMigrations();
    const initial = (await this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)))[0];
    if (!initial) throw new Error('BILLING_REFUND_REQUEST_NOT_FOUND');
    return this.withTenantLock(initial.tenantId, () => this.db.transaction(async (transaction) => {
      const account = await this.lockAccount(transaction as unknown as ForgeLexDatabase, initial.tenantId);
      if (!account) throw new Error('BILLING_ACCOUNT_NOT_PROVISIONED');
      const request = (await transaction.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)))[0]!;
      if (request.status !== 'PENDING' || request.operationState !== 'UNPREPARED') throw new Error('BILLING_REFUND_REQUEST_ALREADY_REVIEWED');
      const now = new Date().toISOString();
      const review = { reason: input.reason ?? request.reason, reviewedBy: input.reviewerId, reviewedAt: now, updatedAt: now };
      if (input.decision === 'REJECTED') {
        return (await transaction.update(billingRefundRequests).set({ ...review, status: 'REJECTED', openKey: null, approvedAmountCents: 0 }).where(eq(billingRefundRequests.id, request.id)).returning())[0]!;
      }
      if (input.approvedAmountCents !== undefined && (!Number.isInteger(input.approvedAmountCents) || input.approvedAmountCents <= 0)) throw new Error('BILLING_REFUND_AMOUNT_INVALID');
      const purchase = (await transaction.select().from(billingPurchases).where(and(eq(billingPurchases.id, request.purchaseId), eq(billingPurchases.tenantId, request.tenantId))))[0];
      if (!purchase?.providerPaymentId || purchase.status !== 'PAID') throw new Error('BILLING_PROVIDER_PAYMENT_NOT_FOUND');
      const lot = (await transaction.select().from(billingCreditLots).where(and(eq(billingCreditLots.purchaseId, request.purchaseId), eq(billingCreditLots.tenantId, request.tenantId))))[0];
      const pending = await transaction.select().from(billingOperations).where(and(eq(billingOperations.accountId, account.id), eq(billingOperations.status, 'PENDING')));
      // Reserve conservatively against every unfunded pending operation, even an expired lease:
      // a worker may still complete it. Commercial escrow has already left the wallet balance.
      const reserved = pending.filter((p) => !p.fundingExecutionId).reduce((sum, p) => sum + p.reservedAmountCents, 0);
      const amount = Math.min(request.eligibleAmountCents, input.approvedAmountCents ?? request.eligibleAmountCents,
        purchase.amountCents, lot?.remainingCents ?? 0, Math.max(0, account.paidBalanceCents - reserved));
      if (!Number.isInteger(amount) || amount <= 0) throw new Error('BILLING_REFUND_AMOUNT_INVALID');
      await transaction.update(billingCreditLots).set({ remainingCents: lot!.remainingCents - amount, updatedAt: now }).where(eq(billingCreditLots.id, lot!.id));
      await transaction.update(ledgerAccounts).set({ paidBalanceCents: account.paidBalanceCents - amount, updatedAt: now }).where(eq(ledgerAccounts.id, account.id));
      await transaction.insert(ledgerEntries).values({ id: randomUUID(), accountId: account.id, usageEventId: null,
        idempotencyKey: `refund-reserve:${request.id}`, kind: 'RESERVE', bucket: 'PAID', amountCents: amount,
        operationResultSnapshot: JSON.stringify({ requestId: request.id, purchaseId: request.purchaseId }), createdAt: now });
      return (await transaction.update(billingRefundRequests).set({ ...review, operationState: 'PREPARED', approvedAmountCents: amount, providerPaymentId: purchase.providerPaymentId }).where(eq(billingRefundRequests.id, request.id)).returning())[0]!;
    }));
  }

  /** Finalize an already withheld refund. Replay never debits the wallet twice. */
  public async settlePreparedRefund(requestId: string): Promise<typeof billingRefundRequests.$inferSelect> {
    await this.runMigrations();
    const initial = (await this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, requestId)))[0];
    if (!initial) throw new Error('BILLING_REFUND_REQUEST_NOT_FOUND');
    return this.withTenantLock(initial.tenantId, () => this.db.transaction(async (transaction) => {
      const account = await this.lockAccount(transaction as unknown as ForgeLexDatabase, initial.tenantId);
      const request = (await transaction.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, requestId)))[0]!;
      if (request.operationState === 'LEDGER_SETTLED') return request;
      if (request.operationState !== 'PROVIDER_SUCCEEDED' || !account || !request.approvedAmountCents) throw new Error('BILLING_REFUND_NOT_SETTLEABLE');
      const now = new Date().toISOString();
      for (const kind of ['RELEASE', 'REFUND']) await transaction.insert(ledgerEntries).values({
        id: randomUUID(), accountId: account.id, usageEventId: null, idempotencyKey: kind === 'REFUND' ? `refund-ledger:${request.id}` : `refund-release:${request.id}`,
        kind, bucket: 'PAID', amountCents: request.approvedAmountCents, operationResultSnapshot: JSON.stringify({ requestId, purchaseId: request.purchaseId }), createdAt: now,
      });
      await transaction.update(billingPayments).set({ status: 'REFUNDED', updatedAt: now }).where(and(eq(billingPayments.purchaseId, request.purchaseId), eq(billingPayments.tenantId, request.tenantId)));
      return (await transaction.update(billingRefundRequests).set({ status: 'APPROVED', openKey: null, operationState: 'LEDGER_SETTLED', operationError: null, updatedAt: now }).where(eq(billingRefundRequests.id, request.id)).returning())[0]!;
    }));
  }

  private async consumeLots(transaction: any, tenantId: string, amountCents: number, now: string): Promise<void> {
    let remaining = amountCents;
    const lots = await transaction.select().from(billingCreditLots).where(and(eq(billingCreditLots.tenantId, tenantId), gt(billingCreditLots.remainingCents, 0))).orderBy(asc(billingCreditLots.createdAt));
    for (const lot of lots) {
      if (remaining <= 0) break;
      const consumed = Math.min(remaining, lot.remainingCents);
      await transaction.update(billingCreditLots).set({ remainingCents: lot.remainingCents - consumed, updatedAt: now }).where(eq(billingCreditLots.id, lot.id));
      remaining -= consumed;
    }
  }

  private async lockAccount(transaction: ForgeLexDatabase, tenantId: string): Promise<typeof ledgerAccounts.$inferSelect | undefined> {
    // Match commercial escrow/closure ordering across processes: tenant, wallet, then lots/entries.
    await lockAgenticTenant(transaction, tenantId);
    const now = new Date().toISOString();
    await transaction.insert(ledgerAccounts).values({
      id: randomUUID(), tenantId, paidBalanceCents: 0, promotionalBalanceCents: 0,
      promoExpiresAt: null, createdAt: now, updatedAt: now,
    }).onConflictDoNothing({ target: ledgerAccounts.tenantId });
    // UPDATE acquires PostgreSQL's row lock and RETURNING observes the balance after waiting.
    const rows = await transaction.update(ledgerAccounts)
      .set({ updatedAt: sql`${ledgerAccounts.updatedAt}` })
      .where(eq(ledgerAccounts.tenantId, tenantId)).returning();
    return rows[0];
  }

  private validateAmount(amountCents: number): void {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new DomainError('INVALID_CANONICAL_STATE', 'O valor deve ser inteiro positivo em centavos.');
  }

  private validateKey(key: string): void {
    if (!key.trim()) throw new DomainError('INVALID_CANONICAL_STATE', 'A chave de idempotência é obrigatória.');
  }

  private async withTenantLock<T>(tenantId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tenantLocks.get(tenantId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const chain = previous.then(() => current);
    this.tenantLocks.set(tenantId, chain);
    await previous;
    try { return await task(); } finally {
      release();
      if (this.tenantLocks.get(tenantId) === chain) this.tenantLocks.delete(tenantId);
    }
  }
}
