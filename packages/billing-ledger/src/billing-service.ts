import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { and, asc, eq, gt } from 'drizzle-orm';
import { DomainError } from '@forgelex/domain';
import type { ForgeLexDatabase } from '@forgelex/persistence';
import { billingCreditLots } from './schema/billing-schema.js';
import { ledgerAccounts, ledgerEntries } from './schema/ledger-schema.js';
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

  public async creditPurchase(input: CreditSettlementInput): Promise<BillingLedgerResult> {
    this.validateAmount(input.amountCents);
    this.validateKey(input.idempotencyKey);
    await this.runMigrations();
    await this.ledger.provisionAccount(input.tenantId);

    return this.withTenantLock(input.tenantId, async () => this.db.transaction(async (transaction) => {
      const account = await this.findAccount(transaction, input.tenantId);
      if (!account) throw new DomainError('BILLING_ACCOUNT_NOT_PROVISIONED', 'Carteira de billing não provisionada.');

      const existingPurchaseLot = await transaction
        .select()
        .from(billingCreditLots)
        .where(and(eq(billingCreditLots.tenantId, input.tenantId), eq(billingCreditLots.purchaseId, input.purchaseId)));
      if (existingPurchaseLot[0]) {
        return { creditedCents: 0, isReplay: true, remainingBalanceCents: account.paidBalanceCents + account.promotionalBalanceCents };
      }

      const existingEntry = await transaction
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.accountId, account.id), eq(ledgerEntries.idempotencyKey, input.idempotencyKey)));
      if (existingEntry[0]) {
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
    await this.ledger.provisionAccount(input.tenantId);

    return this.withTenantLock(input.tenantId, async () => this.db.transaction(async (transaction) => {
      const account = await this.findAccount(transaction, input.tenantId);
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
    await this.ledger.provisionAccount(input.tenantId);

    return this.withTenantLock(input.tenantId, async () => this.db.transaction(async (transaction) => {
      const account = await this.findAccount(transaction, input.tenantId);
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

  private async findAccount(transaction: any, tenantId: string): Promise<typeof ledgerAccounts.$inferSelect | undefined> {
    const rows = await transaction.select().from(ledgerAccounts).where(eq(ledgerAccounts.tenantId, tenantId));
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
