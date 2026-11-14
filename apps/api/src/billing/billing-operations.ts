import type { MercadoPagoPaymentProvider, MercadoPagoWebhookInput } from './mercado-pago-payment-provider.js';
import { randomUUID } from 'node:crypto';
import type { Client } from '@forgelex/persistence';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { ForgeLexDatabase } from '@forgelex/persistence';
import {
  BILLING_CURRENCY,
  calculateRefundableCents,
  validateCreditPurchase,
} from '@forgelex/billing-ledger';
import { BillingService } from '@forgelex/billing-ledger';
import {
  billingAccounts,
  billingInvoices,
  billingPayments,
  billingPurchases,
  billingRefundRequests,
  billingPaymentMethods,
  billingWebhookEvents,
} from '@forgelex/billing-ledger';
import { ledgerEntries, usageEvents } from '@forgelex/billing-ledger';

type ActivityChannel = 'WEB' | 'REST' | 'MCP';

function activityChannel(sessionId: string | null): ActivityChannel | null {
  if (!sessionId) return null;
  if (sessionId.startsWith('web_')) return 'WEB';
  if (sessionId.startsWith('rest_')) return 'REST';
  if (sessionId.startsWith('mcp_')) return 'MCP';
  return null;
}

function activityCapability(capability: string): string {
  if (capability === 'research.search_case_law') return 'Pesquisa jurisprudencial';
  return 'Operação ForgeLex';
}

export interface PaymentProvider {
  readonly providerName?: string;
  readonly supportsAutoRecharge?: boolean;
  createCustomer(input: { tenantId: string; idempotencyKey: string }): Promise<{ id: string }>;
  createCheckout(input: {
    amountCents: number;
    tenantId: string;
    userId: string;
    purchaseId: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
    customerId?: string;
  }): Promise<{ id: string; url: string }>;
  createPaymentMethodSetup(input: { customerId: string; idempotencyKey: string; tenantId?: string }): Promise<{ id: string; clientSecret: string }>;
  listPaymentMethods(customerId: string): Promise<Array<{ id: string; type: string; brand?: string; last4?: string; expMonth?: number; expYear?: number }>>;
  createOffSessionPayment(input: {
    customerId: string;
    paymentMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
  }): Promise<Record<string, unknown>>;
  refundPayment(input: { providerPaymentId: string; amountCents: number; idempotencyKey: string }): Promise<Record<string, unknown>>;
}

export class BillingOperationsService {
  private readonly autoRechargeLocks = new Map<string, Promise<void>>();
  public constructor(
    private readonly db: ForgeLexDatabase,
    client: Client,
    private readonly billing: BillingService,
    private readonly provider: PaymentProvider,
    private readonly origin = 'http://localhost:3000',
  ) { void client; }

  public getBillingService(): BillingService { return this.billing; }

  public isAutoRechargeAvailable(): boolean {
    return this.provider.supportsAutoRecharge !== false;
  }

  public async createCheckout(input: {
    tenantId: string;
    userId: string;
    packageId?: string;
    amountCents?: number;
    idempotencyKey: string;
  }): Promise<{
    purchaseId: string;
    amountCents: number;
    currency: string;
    status: string;
    checkoutUrl: string;
  }> {
    const validated = validateCreditPurchase({ packageId: input.packageId, amountCents: input.amountCents });
    await this.billing.runMigrations();
    await this.ensureBillingAccount(input.tenantId);
    const existing = await this.db.select().from(billingPurchases).where(and(eq(billingPurchases.tenantId, input.tenantId), eq(billingPurchases.idempotencyKey, input.idempotencyKey)));
    const existingPurchase = existing[0];
    if (existingPurchase && (
      existingPurchase.tenantId !== input.tenantId ||
      existingPurchase.userId !== input.userId ||
      existingPurchase.packageId !== validated.packageId ||
      existingPurchase.amountCents !== validated.amountCents ||
      existingPurchase.currency !== BILLING_CURRENCY
    )) throw new Error('IDEMPOTENCY_CONFLICT');
    if (existingPurchase?.checkoutUrl) return this.purchaseResponse(existingPurchase);

    const purchase = existingPurchase ?? {
      id: randomUUID(),
      tenantId: input.tenantId,
      userId: input.userId,
      packageId: validated.packageId,
      idempotencyKey: input.idempotencyKey,
      amountCents: validated.amountCents,
      currency: BILLING_CURRENCY,
      status: 'PENDING',
      providerCheckoutId: null,
      checkoutUrl: null,
      providerPaymentId: null,
      receiptUrl: null,
      createdAt: new Date().toISOString(),
      paidAt: null,
      updatedAt: new Date().toISOString(),
    };
    if (!existingPurchase) await this.db.insert(billingPurchases).values(purchase);

    const billingAccount = await this.db.select().from(billingAccounts).where(eq(billingAccounts.tenantId, purchase.tenantId));
    const checkout = await this.provider.createCheckout({
      amountCents: purchase.amountCents,
      tenantId: purchase.tenantId,
      userId: purchase.userId,
      purchaseId: purchase.id,
      successUrl: `${this.origin}/?billing_purchase=${purchase.id}`,
      cancelUrl: `${this.origin}/?billing_canceled=${purchase.id}`,
      idempotencyKey: purchase.id,
      customerId: billingAccount[0]?.providerCustomerId ?? undefined,
    });
    const updated = new Date().toISOString();
    await this.db.update(billingPurchases).set({ providerCheckoutId: checkout.id, checkoutUrl: checkout.url, updatedAt: updated }).where(eq(billingPurchases.id, purchase.id));
    return { purchaseId: purchase.id, amountCents: purchase.amountCents, currency: purchase.currency, status: 'PENDING', checkoutUrl: checkout.url };
  }

  /** Durable signed-delivery receipt: legitimate long retries reuse the same authenticated tuple. */
  public async processMercadoPagoWebhook(provider: MercadoPagoPaymentProvider, input: MercadoPagoWebhookInput): Promise<void> {
    const id = provider.verifiedDeliveryId(input);
    await this.billing.runMigrations();
    const known = (await this.db.select().from(billingWebhookEvents).where(and(eq(billingWebhookEvents.id, id), eq(billingWebhookEvents.provider, 'mercadopago'))))[0];
    if (known?.status === 'PROCESSED') return;
    if (!known) provider.verifyWebhook(input);
    const receivedAt = new Date().toISOString();
    const lease = and(eq(billingWebhookEvents.id, id), eq(billingWebhookEvents.provider, 'mercadopago'), eq(billingWebhookEvents.receivedAt, receivedAt));
    const inserted = await this.db.insert(billingWebhookEvents).values({ id, provider: 'mercadopago', eventType: 'delivery.received', payload: JSON.stringify(input), status: 'RECEIVED', receivedAt }).onConflictDoNothing().returning({ id: billingWebhookEvents.id });
    if (!inserted[0]) {
      const claimed = await this.db.update(billingWebhookEvents).set({ status: 'RECEIVED', receivedAt, errorMessage: null })
        .where(and(eq(billingWebhookEvents.id, id), eq(billingWebhookEvents.provider, 'mercadopago'),
          or(and(eq(billingWebhookEvents.status, 'FAILED'), lt(billingWebhookEvents.receivedAt, new Date(Date.now() - 15_000).toISOString())),
            and(eq(billingWebhookEvents.status, 'RECEIVED'), lt(billingWebhookEvents.receivedAt, new Date(Date.now() - 300_000).toISOString())))))
        .returning({ id: billingWebhookEvents.id });
      if (!claimed[0]) throw new Error('BILLING_WEBHOOK_RETRY_LATER');
    }
    try {
      const event = await provider.normalizeWebhook(input, { allowExpiredDelivery: Boolean(known) });
      await this.processWebhook(event);
      await this.db.update(billingWebhookEvents).set({ status: 'PROCESSED', processedAt: new Date().toISOString() }).where(lease);
    } catch (error) {
      await this.db.update(billingWebhookEvents).set({ status: 'FAILED', errorMessage: error instanceof Error ? error.message : 'WEBHOOK_PROCESSING_FAILED' }).where(lease);
      throw error;
    }
  }

  public async processWebhook(event: {
    id: string;
    type: string;
    provider?: string;
    data: { object: Record<string, unknown> };
  }): Promise<void> {
    await this.billing.runMigrations();
    const provider = event.provider ?? 'mercadopago';
    const receivedAt = new Date().toISOString();
    const inserted = await this.db.insert(billingWebhookEvents)
      .values({ id: event.id, provider, eventType: event.type, payload: JSON.stringify(event), status: 'RECEIVED', receivedAt, processedAt: null, errorMessage: null })
      .onConflictDoNothing()
      .returning({ id: billingWebhookEvents.id });
    if (!inserted[0]) {
      const claimed = await this.db.update(billingWebhookEvents)
        .set({ status: 'RECEIVED', payload: JSON.stringify(event), receivedAt, errorMessage: null })
        .where(and(eq(billingWebhookEvents.provider, provider), eq(billingWebhookEvents.id, event.id),
          or(eq(billingWebhookEvents.status, 'FAILED'), and(eq(billingWebhookEvents.status, 'RECEIVED'), lt(billingWebhookEvents.receivedAt, new Date(Date.now() - 300_000).toISOString())))))
        .returning({ id: billingWebhookEvents.id });
      if (!claimed[0]) {
        const current = (await this.db.select().from(billingWebhookEvents).where(and(eq(billingWebhookEvents.provider, provider), eq(billingWebhookEvents.id, event.id))))[0];
        if (current?.status === 'PROCESSED') return;
        throw new Error('BILLING_WEBHOOK_RETRY_LATER');
      }
    }

    try {
      const object: Record<string, unknown> = { ...event.data.object, ...(event.type === 'payment.succeeded' && typeof event.data.object.provider_payment_id !== 'string' ? { provider_payment_id: event.data.object.id } : {}) };
      const metadata = typeof object.metadata === 'object' && object.metadata !== null ? object.metadata as Record<string, unknown> : {};
      const purchaseId = typeof metadata.purchase_id === 'string' ? metadata.purchase_id : undefined;
      if (purchaseId) {
        const purchases = await this.db.select({ tenantId: billingPurchases.tenantId })
          .from(billingPurchases)
          .where(eq(billingPurchases.id, purchaseId));
        if (purchases[0]) {
          await this.db.update(billingWebhookEvents)
            .set({ tenantId: purchases[0].tenantId })
            .where(and(
              eq(billingWebhookEvents.provider, provider),
              eq(billingWebhookEvents.id, event.id),
            ));
        }
      }
      if (purchaseId && ['payment.approved', 'payment.succeeded'].includes(event.type)) {
        const paymentStatus = typeof object.payment_status === 'string' ? object.payment_status : 'paid';
        if (paymentStatus === 'paid' || event.type === 'payment.succeeded') await this.completePurchase(purchaseId, object, provider);
        else await this.transitionPurchase(purchaseId, 'PROCESSING');
      }
      if (purchaseId && event.type === 'payment.processing') await this.transitionPurchase(purchaseId, 'PROCESSING');
      if (purchaseId && ['payment.failed', 'payment.canceled'].includes(event.type)) {
        const changed = await this.transitionPurchase(purchaseId, 'FAILED');
        if (changed && metadata.auto_recharge === 'true') {
          await this.db.update(billingAccounts).set({ autoRechargeEnabled: 0, updatedAt: new Date().toISOString() }).where(eq(billingAccounts.tenantId, (await this.db.select().from(billingPurchases).where(eq(billingPurchases.id, purchaseId)))[0]!.tenantId));
        }
      }
      await this.db.update(billingWebhookEvents).set({ status: 'PROCESSED', processedAt: new Date().toISOString() }).where(and(eq(billingWebhookEvents.provider, provider), eq(billingWebhookEvents.id, event.id), eq(billingWebhookEvents.receivedAt, receivedAt)));
    } catch (error) {
      await this.db.update(billingWebhookEvents).set({ status: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error) }).where(and(eq(billingWebhookEvents.provider, provider), eq(billingWebhookEvents.id, event.id), eq(billingWebhookEvents.receivedAt, receivedAt)));
      throw error;
    }
  }

  public async getPurchase(purchaseId: string, tenantId: string): Promise<typeof billingPurchases.$inferSelect | undefined> {
    await this.billing.runMigrations();
    const rows = await this.db.select().from(billingPurchases).where(and(eq(billingPurchases.id, purchaseId), eq(billingPurchases.tenantId, tenantId)));
    return rows[0];
  }

  public async getAccount(tenantId: string): Promise<Awaited<ReturnType<BillingService['getAccount']>>> {
    return this.billing.getAccount(tenantId);
  }

  public async getBillingAccount(tenantId: string): Promise<typeof billingAccounts.$inferSelect> {
    await this.ensureBillingAccount(tenantId);
    const rows = await this.db.select().from(billingAccounts).where(eq(billingAccounts.tenantId, tenantId));
    if (!rows[0]) throw new Error('BILLING_ACCOUNT_NOT_FOUND');
    return rows[0];
  }

  public async listTransactions(tenantId: string, limit = 50, offset = 0): Promise<{
    items: Array<Record<string, unknown>>;
    purchases: Array<typeof billingPurchases.$inferSelect>;
    payments: Array<typeof billingPayments.$inferSelect>;
    refunds: Array<typeof billingRefundRequests.$inferSelect>;
    nextOffset: number | null;
  }> {
    const account = await this.billing.getAccount(tenantId);
    const entries = await this.db.select({ entry: ledgerEntries, usage: usageEvents }).from(ledgerEntries)
      .leftJoin(usageEvents, eq(ledgerEntries.usageEventId, usageEvents.id))
      .where(eq(ledgerEntries.accountId, account.id))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(limit + 1)
      .offset(offset);
    const purchases = await this.db.select().from(billingPurchases).where(eq(billingPurchases.tenantId, tenantId)).orderBy(desc(billingPurchases.createdAt));
    const payments = await this.db.select().from(billingPayments).where(eq(billingPayments.tenantId, tenantId)).orderBy(desc(billingPayments.createdAt));
    const refunds = await this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.tenantId, tenantId)).orderBy(desc(billingRefundRequests.createdAt));
    return {
      items: entries.slice(0, limit).map(({ entry, usage }) => ({
        id: entry.id,
        type: entry.kind,
        wallet: entry.bucket,
        amountCents: entry.amountCents,
        status: 'SETTLED',
        date: entry.createdAt,
        idempotencyKey: entry.idempotencyKey,
        capability: usage ? activityCapability(usage.capability) : null,
        channel: usage ? activityChannel(usage.sessionId) : null,
        technical: usage ? {
          capability: usage.capability,
          provider: usage.provider,
          requestId: usage.requestId,
          sessionId: usage.sessionId,
        } : null,
      })),
      purchases,
      payments,
      refunds,
      nextOffset: entries.length > limit ? offset + limit : null,
    };
  }

  public async listInvoices(tenantId: string): Promise<Array<typeof billingInvoices.$inferSelect>> {
    await this.billing.runMigrations();
    return this.db.select().from(billingInvoices).where(eq(billingInvoices.tenantId, tenantId)).orderBy(desc(billingInvoices.issuedAt));
  }

  public async setupPaymentMethod(input: { tenantId: string; idempotencyKey: string }): Promise<{ setupId: string; clientSecret: string }> {
    const account = await this.getBillingAccount(input.tenantId);
    if (!account.providerCustomerId) throw new Error('PAYMENT_PROVIDER_CUSTOMER_NOT_READY');
    const setup = await this.provider.createPaymentMethodSetup({ customerId: account.providerCustomerId, tenantId: input.tenantId, idempotencyKey: input.idempotencyKey });
    return { setupId: setup.id, clientSecret: setup.clientSecret };
  }

  public async listPaymentMethods(tenantId: string): Promise<Array<typeof billingPaymentMethods.$inferSelect>> {
    const account = await this.getBillingAccount(tenantId);
    if (!account.providerCustomerId) return [];
    const methods = await this.provider.listPaymentMethods(account.providerCustomerId);
    const providerName = this.provider.providerName ?? 'mercadopago';
    const now = new Date().toISOString();
    for (const method of methods) {
      await this.db.insert(billingPaymentMethods).values({
        id: randomUUID(), tenantId, provider: providerName, providerPaymentMethodId: method.id,
        type: method.type, brand: method.brand ?? null, last4: method.last4 ?? null,
        expMonth: method.expMonth ?? null, expYear: method.expYear ?? null,
        isDefault: account.defaultPaymentMethodId === method.id ? 1 : 0, createdAt: now, revokedAt: null,
      }).onConflictDoNothing({ target: billingPaymentMethods.providerPaymentMethodId });
    }
    return this.db.select().from(billingPaymentMethods).where(and(eq(billingPaymentMethods.tenantId, tenantId), eq(billingPaymentMethods.provider, providerName)));
  }

  public async updateAutoRecharge(input: { tenantId: string; enabled: boolean; amountCents?: number; paymentMethodId?: string }): Promise<typeof billingAccounts.$inferSelect> {
    if (input.enabled && this.provider.supportsAutoRecharge === false) throw new Error('MERCADOPAGO_AUTO_RECHARGE_UNAVAILABLE');
    const account = await this.getBillingAccount(input.tenantId);
    const amountCents = input.amountCents ?? account.lastRechargeAmountCents;
    if (input.enabled && (!amountCents || amountCents < 2500)) throw new Error('AUTO_RECHARGE_AMOUNT_REQUIRED');
    if (input.enabled && !input.paymentMethodId && !account.defaultPaymentMethodId) throw new Error('AUTO_RECHARGE_PAYMENT_METHOD_REQUIRED');
    if (input.amountCents !== undefined && (!Number.isInteger(input.amountCents) || input.amountCents < 2500 || input.amountCents > 50000)) throw new Error('INVALID_CUSTOM_AMOUNT');
    const now = new Date().toISOString();
    await this.db.update(billingAccounts).set({
      autoRechargeEnabled: input.enabled ? 1 : 0,
      autoRechargeThresholdCents: 500,
      lastRechargeAmountCents: amountCents ?? null,
      defaultPaymentMethodId: input.paymentMethodId ?? account.defaultPaymentMethodId,
      autoRechargeArmed: input.enabled ? 1 : account.autoRechargeArmed,
      updatedAt: now,
    }).where(eq(billingAccounts.tenantId, input.tenantId));
    return this.getBillingAccount(input.tenantId);
  }

  public async startAutoRecharge(tenantId: string): Promise<{ started: boolean; purchaseId?: string; reason?: string }> {
    const previous = this.autoRechargeLocks.get(tenantId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.autoRechargeLocks.set(tenantId, tail);
    await previous;
    try { return await this.startAutoRechargeOnce(tenantId); } finally {
      release();
      if (this.autoRechargeLocks.get(tenantId) === tail) this.autoRechargeLocks.delete(tenantId);
    }
  }

  private async startAutoRechargeOnce(tenantId: string): Promise<{ started: boolean; purchaseId?: string; reason?: string }> {
    const account = await this.getBillingAccount(tenantId);
    const ledgerAccount = await this.billing.getAccount(tenantId);
    if (!account.autoRechargeEnabled || !account.autoRechargeArmed || !account.defaultPaymentMethodId || !account.lastRechargeAmountCents) return { started: false, reason: 'AUTO_RECHARGE_NOT_READY' };
    if (ledgerAccount.paidBalanceCents > account.autoRechargeThresholdCents) {
      if (!account.autoRechargeArmed) await this.db.update(billingAccounts).set({ autoRechargeArmed: 1, updatedAt: new Date().toISOString() }).where(eq(billingAccounts.id, account.id));
      return { started: false, reason: 'BALANCE_ABOVE_THRESHOLD' };
    }
    const purchaseId = randomUUID();
    const now = new Date().toISOString();
    const claimed = await this.db.transaction(async (transaction) => {
      const tx = transaction as unknown as ForgeLexDatabase;
      const claim = await tx.update(billingAccounts).set({ autoRechargeArmed: 0, updatedAt: now })
        .where(and(eq(billingAccounts.id, account.id), eq(billingAccounts.autoRechargeEnabled, 1), eq(billingAccounts.autoRechargeArmed, 1),
          eq(billingAccounts.defaultPaymentMethodId, account.defaultPaymentMethodId!), eq(billingAccounts.lastRechargeAmountCents, account.lastRechargeAmountCents!),
          eq(billingAccounts.autoRechargeThresholdCents, account.autoRechargeThresholdCents),
          sql`EXISTS (SELECT 1 FROM ledger_accounts WHERE tenant_id = ${tenantId} AND paid_balance_cents <= ${account.autoRechargeThresholdCents})`))
        .returning({ id: billingAccounts.id });
      if (!claim[0]) return false;
      await tx.insert(billingPurchases).values({
      id: purchaseId, tenantId, userId: tenantId, packageId: 'auto_recharge', idempotencyKey: `auto-recharge:${tenantId}:${purchaseId}`,
      amountCents: account.lastRechargeAmountCents!, currency: BILLING_CURRENCY, status: 'PROCESSING',
      providerCheckoutId: null, checkoutUrl: null, providerPaymentId: null, receiptUrl: null,
      createdAt: now, paidAt: null, updatedAt: now,
    });
      return true;
    });
    if (!claimed) return { started: false, reason: 'AUTO_RECHARGE_NOT_READY' };
    try {
      const payment = await this.provider.createOffSessionPayment({
        customerId: account.providerCustomerId ?? '', paymentMethodId: account.defaultPaymentMethodId,
        amountCents: account.lastRechargeAmountCents!, idempotencyKey: `auto-payment:${purchaseId}`,
        metadata: { tenant_id: tenantId, purchase_id: purchaseId, auto_recharge: 'true' },
      });
      const providerPaymentId = typeof payment.id === 'string' ? payment.id : null;
      await this.db.update(billingPurchases).set({ providerPaymentId, updatedAt: new Date().toISOString() }).where(eq(billingPurchases.id, purchaseId));
      return { started: true, purchaseId };
    } catch (error) {
      await this.db.update(billingPurchases).set({ status: 'FAILED', updatedAt: new Date().toISOString() }).where(eq(billingPurchases.id, purchaseId));
      await this.db.update(billingAccounts).set({ autoRechargeEnabled: 0, updatedAt: new Date().toISOString() }).where(eq(billingAccounts.id, account.id));
      return { started: false, reason: error instanceof Error ? error.message : 'AUTO_RECHARGE_FAILED' };
    }
  }

  public async createRefundRequest(input: { tenantId: string; userId: string; purchaseId: string; reason?: string; now?: string }): Promise<typeof billingRefundRequests.$inferSelect> {
    const purchase = await this.getPurchase(input.purchaseId, input.tenantId);
    if (!purchase) throw new Error('BILLING_PURCHASE_NOT_FOUND');
    if (purchase.status !== 'PAID') throw new Error('BILLING_PURCHASE_NOT_PAID');
    const now = new Date(input.now ?? Date.now()).getTime();
    const createdAt = new Date(purchase.createdAt).getTime();
    if (now - createdAt > 7 * 24 * 60 * 60 * 1000) throw new Error('BILLING_REFUND_WINDOW_EXPIRED');
    const lot = (await this.billing.getCreditLots(input.tenantId)).find((item) => item.purchaseId === input.purchaseId);
    const eligibleAmountCents = calculateRefundableCents({ purchaseAmountCents: purchase.amountCents, remainingCreditCents: lot?.remainingCents ?? 0 });
    const nowIso = new Date().toISOString();
    const request = { id: randomUUID(), tenantId: input.tenantId, purchaseId: input.purchaseId, requestedBy: input.userId, status: 'PENDING', openKey: input.purchaseId, eligibleAmountCents, approvedAmountCents: null, reason: input.reason ?? null, reviewedBy: null, reviewedAt: null, createdAt: nowIso, updatedAt: nowIso };
    try {
      const created = await this.db.insert(billingRefundRequests).values(request).returning();
      if (!created[0]) throw new Error('REFUND_REQUEST_CREATE_FAILED');
      return created[0];
    } catch (error) {
      if (this.isRefundOpenKeyConflict(error)) {
        throw new Error('REFUND_REQUEST_ALREADY_PENDING', { cause: error });
      }
      throw error;
    }
  }

  public async listRefundRequests(tenantId?: string): Promise<Array<typeof billingRefundRequests.$inferSelect>> {
    await this.billing.runMigrations();
    return tenantId
      ? this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.tenantId, tenantId)).orderBy(desc(billingRefundRequests.createdAt))
      : this.db.select().from(billingRefundRequests).orderBy(desc(billingRefundRequests.createdAt));
  }

  public async reviewRefundRequest(input: {
    requestId: string;
    reviewerId: string;
    decision: 'APPROVED' | 'REJECTED';
    approvedAmountCents?: number;
    reason?: string;
  }): Promise<typeof billingRefundRequests.$inferSelect> {
    const request = await this.billing.prepareRefund(input);
    if (input.decision === 'REJECTED') return request;
    return this.recoverRefundRequest(request.id);
  }

  /** Explicit recovery only: never releases held value on timeout or unknown outcome.
   * Re-dispatch uses the same provider key and frozen amount/payment identity.
   */
  public async recoverRefundRequest(requestId: string): Promise<typeof billingRefundRequests.$inferSelect> {
    await this.billing.runMigrations();
    const request = (await this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, requestId)))[0];
    if (!request) throw new Error('BILLING_REFUND_REQUEST_NOT_FOUND');
    if (request.operationState === 'LEDGER_SETTLED') return request;
    if (request.operationState === 'PROVIDER_SUCCEEDED') return this.billing.settlePreparedRefund(requestId);
    if (!['PREPARED', 'PROVIDER_PENDING', 'RECONCILIATION_REQUIRED'].includes(request.operationState) || !request.approvedAmountCents || !request.providerPaymentId) throw new Error('BILLING_REFUND_MANUAL_RECONCILIATION_REQUIRED');
    await this.db.update(billingRefundRequests).set({ operationState: 'PROVIDER_PENDING', updatedAt: new Date().toISOString() })
      .where(and(eq(billingRefundRequests.id, request.id), inArray(billingRefundRequests.operationState, ['PREPARED', 'PROVIDER_PENDING', 'RECONCILIATION_REQUIRED'])));
    try {
      const result = await this.provider.refundPayment({ providerPaymentId: request.providerPaymentId, amountCents: request.approvedAmountCents, idempotencyKey: `refund:${request.id}` });
      if (!['succeeded', 'approved', 'refunded', 'processed'].includes(String(result.status))) throw new Error('BILLING_REFUND_PROVIDER_OUTCOME_UNKNOWN');
      await this.db.update(billingRefundRequests).set({ operationState: 'PROVIDER_SUCCEEDED', providerResult: JSON.stringify(result), operationError: null, updatedAt: new Date().toISOString() })
        .where(and(eq(billingRefundRequests.id, request.id), inArray(billingRefundRequests.operationState, ['PROVIDER_PENDING', 'RECONCILIATION_REQUIRED'])));
    } catch (error) {
      await this.db.update(billingRefundRequests).set({ operationState: 'RECONCILIATION_REQUIRED', operationError: error instanceof Error ? error.message : String(error), updatedAt: new Date().toISOString() })
        .where(and(eq(billingRefundRequests.id, request.id), eq(billingRefundRequests.operationState, 'PROVIDER_PENDING')));
      throw error;
    }
    // A failed transaction leaves PROVIDER_SUCCEEDED and the hold durable for local-only retry.
    return this.billing.settlePreparedRefund(requestId);
  }

  public async ensureBillingAccount(tenantId: string): Promise<void> {
    await this.billing.runMigrations();
    const existing = await this.db.select().from(billingAccounts).where(eq(billingAccounts.tenantId, tenantId));
    if (existing[0]) return;
    const now = new Date().toISOString();
    const providerCustomer = await this.provider.createCustomer({ tenantId, idempotencyKey: `customer:${tenantId}` });
    await this.db.insert(billingAccounts).values({ id: randomUUID(), tenantId, providerCustomerId: providerCustomer.id, autoRechargeEnabled: 0, autoRechargeThresholdCents: 500, lastRechargeAmountCents: null, defaultPaymentMethodId: null, autoRechargeArmed: 1, createdAt: now, updatedAt: now });
  }

  private async completePurchase(purchaseId: string, object: Record<string, unknown>, provider = 'mercadopago'): Promise<void> {
    const initial = (await this.db.select().from(billingPurchases).where(eq(billingPurchases.id, purchaseId)))[0];
    if (!initial) return;
    let failure: string | undefined;
    const paymentId = typeof object.provider_payment_id === 'string' && object.provider_payment_id.length > 0 ? object.provider_payment_id : null;
    const eligible = ['PENDING', 'PROCESSING', 'FAILED'];
    await this.billing.creditPurchase({ tenantId: initial.tenantId, purchaseId, amountCents: initial.amountCents, idempotencyKey: `${provider}:purchase:${purchaseId}` }, {
      validate: async (tx) => {
        const purchase = (await tx.select().from(billingPurchases).where(eq(billingPurchases.id, purchaseId)))[0];
        if (!purchase || !eligible.includes(purchase.status)) return false;
        const amountsMatch = object.amount_total === purchase.amountCents && typeof object.currency === 'string'
          && object.currency.toLowerCase() === purchase.currency.toLowerCase() && object.external_reference === purchase.id && paymentId !== null;
        if (amountsMatch && !purchase.providerCheckoutId && !purchase.providerPaymentId) {
          failure = 'BILLING_SETTLEMENT_IDENTITY_PENDING';
          return false;
        }
        const identityMatches = purchase.providerCheckoutId ? object.provider_checkout_id === purchase.providerCheckoutId
          : purchase.providerPaymentId !== null && paymentId === purchase.providerPaymentId;
        if (!amountsMatch || !identityMatches) {
          await tx.update(billingPurchases).set({ status: 'RECONCILIATION_REQUIRED', updatedAt: new Date().toISOString() }).where(eq(billingPurchases.id, purchaseId));
          failure = 'BILLING_SETTLEMENT_RECONCILIATION_REQUIRED';
          return false;
        }
        return true;
      },
      complete: async (tx) => {
        const now = new Date().toISOString();
        const receiptUrl = typeof object.receipt_url === 'string' ? object.receipt_url : null;
        await tx.update(billingPurchases).set({ status: 'PAID', providerPaymentId: paymentId, paidAt: now, receiptUrl, updatedAt: now }).where(eq(billingPurchases.id, purchaseId));
        await tx.insert(billingPayments).values({ id: randomUUID(), tenantId: initial.tenantId, purchaseId, provider, providerPaymentId: paymentId!, amountCents: initial.amountCents, currency: initial.currency, status: 'SUCCEEDED', paymentMethodType: null, createdAt: now, updatedAt: now }).onConflictDoNothing();
        await tx.insert(billingInvoices).values({ id: randomUUID(), tenantId: initial.tenantId, purchaseId, number: `FL-${purchaseId.slice(0, 8).toUpperCase()}`, status: 'PAID', amountCents: initial.amountCents, currency: initial.currency, receiptUrl, issuedAt: now }).onConflictDoNothing({ target: billingInvoices.purchaseId });
        const metadata = typeof object.metadata === 'object' && object.metadata !== null ? object.metadata as Record<string, unknown> : {};
        if (metadata.auto_recharge === 'true') await tx.update(billingAccounts).set({ autoRechargeArmed: 1, updatedAt: now }).where(eq(billingAccounts.tenantId, initial.tenantId));
      },
    });
    if (failure) throw new Error(failure);
  }

  private async transitionPurchase(purchaseId: string, target: 'PROCESSING' | 'FAILED'): Promise<boolean> {
    const allowedFrom = target === 'PROCESSING' ? ['PENDING'] : ['PENDING', 'PROCESSING'];
    const updated = await this.db.update(billingPurchases)
      .set({ status: target, updatedAt: new Date().toISOString() })
      .where(and(eq(billingPurchases.id, purchaseId), inArray(billingPurchases.status, allowedFrom))).returning({ id: billingPurchases.id });
    return updated.length > 0;
  }

  private isRefundOpenKeyConflict(error: unknown): boolean {
    let current: unknown = error;
    while (current instanceof Error) {
      const code = 'code' in current ? String(current.code) : '';
      if (
        code.includes('CONSTRAINT_UNIQUE') ||
        current.message.includes('billing_refund_requests_tenant_open_unique') ||
        current.message.includes('billing_refund_requests.tenant_id, billing_refund_requests.open_key')
      ) return true;
      current = 'cause' in current ? current.cause : undefined;
    }
    return false;
  }

  private purchaseResponse(purchase: typeof billingPurchases.$inferSelect) {
    return { purchaseId: purchase.id, amountCents: purchase.amountCents, currency: purchase.currency, status: purchase.status, checkoutUrl: purchase.checkoutUrl ?? '' };
  }
}
