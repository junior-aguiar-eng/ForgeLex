import { randomUUID } from 'node:crypto';
import type { Client } from '@forgelex/persistence';
import { and, desc, eq, inArray } from 'drizzle-orm';
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
    if (existing[0]?.checkoutUrl) return this.purchaseResponse(existing[0]);

    const purchase = existing[0] ?? {
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
    if (!existing[0]) await this.db.insert(billingPurchases).values(purchase);

    const billingAccount = await this.db.select().from(billingAccounts).where(eq(billingAccounts.tenantId, input.tenantId));
    const checkout = await this.provider.createCheckout({
      amountCents: validated.amountCents,
      tenantId: input.tenantId,
      userId: input.userId,
      purchaseId: purchase.id,
      successUrl: `${this.origin}/?billing_purchase=${purchase.id}`,
      cancelUrl: `${this.origin}/?billing_canceled=${purchase.id}`,
      idempotencyKey: input.idempotencyKey,
      customerId: billingAccount[0]?.providerCustomerId ?? undefined,
    });
    const updated = new Date().toISOString();
    await this.db.update(billingPurchases).set({ providerCheckoutId: checkout.id, checkoutUrl: checkout.url, updatedAt: updated }).where(eq(billingPurchases.id, purchase.id));
    return { purchaseId: purchase.id, amountCents: validated.amountCents, currency: BILLING_CURRENCY, status: 'PENDING', checkoutUrl: checkout.url };
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
    if (!inserted[0]) return;

    try {
      const object = event.data.object;
      const metadata = typeof object.metadata === 'object' && object.metadata !== null ? object.metadata as Record<string, unknown> : {};
      const purchaseId = typeof metadata.purchase_id === 'string' ? metadata.purchase_id : undefined;
      if (purchaseId && ['payment.approved', 'payment.succeeded'].includes(event.type)) {
        const paymentStatus = typeof object.payment_status === 'string' ? object.payment_status : 'paid';
        if (paymentStatus === 'paid' || event.type === 'payment.succeeded') await this.completePurchase(purchaseId, object, provider);
        else await this.transitionPurchase(purchaseId, 'PROCESSING');
      }
      if (purchaseId && event.type === 'payment.processing') await this.transitionPurchase(purchaseId, 'PROCESSING');
      if (purchaseId && event.type === 'payment.failed') await this.transitionPurchase(purchaseId, 'FAILED');
      if (purchaseId && event.type === 'payment.succeeded') await this.completePurchase(purchaseId, { ...object, provider_payment_id: object.id }, provider);
      if (purchaseId && ['payment.failed', 'payment.canceled'].includes(event.type)) {
        await this.transitionPurchase(purchaseId, 'FAILED');
        if (metadata.auto_recharge === 'true') {
          await this.db.update(billingAccounts).set({ autoRechargeEnabled: 0, updatedAt: new Date().toISOString() }).where(eq(billingAccounts.tenantId, typeof metadata.tenant_id === 'string' ? metadata.tenant_id : ''));
        }
      }
      await this.db.update(billingWebhookEvents).set({ status: 'PROCESSED', processedAt: new Date().toISOString() }).where(and(eq(billingWebhookEvents.provider, provider), eq(billingWebhookEvents.id, event.id)));
    } catch (error) {
      await this.db.update(billingWebhookEvents).set({ status: 'FAILED', errorMessage: error instanceof Error ? error.message : String(error) }).where(and(eq(billingWebhookEvents.provider, provider), eq(billingWebhookEvents.id, event.id)));
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
    const account = await this.getBillingAccount(tenantId);
    const ledgerAccount = await this.billing.getAccount(tenantId);
    if (!account.autoRechargeEnabled || !account.autoRechargeArmed || !account.defaultPaymentMethodId || !account.lastRechargeAmountCents) return { started: false, reason: 'AUTO_RECHARGE_NOT_READY' };
    if (ledgerAccount.paidBalanceCents > account.autoRechargeThresholdCents) {
      if (!account.autoRechargeArmed) await this.db.update(billingAccounts).set({ autoRechargeArmed: 1, updatedAt: new Date().toISOString() }).where(eq(billingAccounts.id, account.id));
      return { started: false, reason: 'BALANCE_ABOVE_THRESHOLD' };
    }
    const purchaseId = randomUUID();
    const now = new Date().toISOString();
    await this.db.insert(billingPurchases).values({
      id: purchaseId, tenantId, userId: tenantId, packageId: 'auto_recharge', idempotencyKey: `auto-recharge:${tenantId}:${purchaseId}`,
      amountCents: account.lastRechargeAmountCents, currency: BILLING_CURRENCY, status: 'PROCESSING',
      providerCheckoutId: null, checkoutUrl: null, providerPaymentId: null, receiptUrl: null,
      createdAt: now, paidAt: null, updatedAt: now,
    });
    try {
      const payment = await this.provider.createOffSessionPayment({
        customerId: account.providerCustomerId ?? '', paymentMethodId: account.defaultPaymentMethodId,
        amountCents: account.lastRechargeAmountCents, idempotencyKey: `auto-payment:${purchaseId}`,
        metadata: { tenant_id: tenantId, purchase_id: purchaseId, auto_recharge: 'true' },
      });
      const providerPaymentId = typeof payment.id === 'string' ? payment.id : null;
      await this.db.update(billingPurchases).set({ providerPaymentId, updatedAt: new Date().toISOString() }).where(eq(billingPurchases.id, purchaseId));
      await this.db.update(billingAccounts).set({ autoRechargeArmed: 0, updatedAt: new Date().toISOString() }).where(eq(billingAccounts.id, account.id));
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
    await this.billing.runMigrations();
    const rows = await this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId));
    const request = rows[0];
    if (!request) throw new Error('BILLING_REFUND_REQUEST_NOT_FOUND');
    if (request.status !== 'PENDING') throw new Error('BILLING_REFUND_REQUEST_ALREADY_REVIEWED');
    const now = new Date().toISOString();
    if (input.decision === 'REJECTED') {
      await this.db.update(billingRefundRequests).set({ status: 'REJECTED', openKey: null, approvedAmountCents: 0, reason: input.reason ?? request.reason, reviewedBy: input.reviewerId, reviewedAt: now, updatedAt: now }).where(eq(billingRefundRequests.id, input.requestId));
      return (await this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)))[0] as typeof request;
    }
    const approvedAmountCents = Math.min(request.eligibleAmountCents, input.approvedAmountCents ?? request.eligibleAmountCents);
    if (!Number.isInteger(approvedAmountCents) || approvedAmountCents <= 0) throw new Error('BILLING_REFUND_AMOUNT_INVALID');
    const purchases = await this.db.select().from(billingPurchases).where(eq(billingPurchases.id, request.purchaseId));
    const purchase = purchases[0];
    if (!purchase?.providerPaymentId) throw new Error('BILLING_PROVIDER_PAYMENT_NOT_FOUND');
    await this.provider.refundPayment({ providerPaymentId: purchase.providerPaymentId, amountCents: approvedAmountCents, idempotencyKey: `refund:${request.id}` });
    await this.billing.refundUnusedCredits({ tenantId: request.tenantId, purchaseId: request.purchaseId, amountCents: approvedAmountCents, idempotencyKey: `refund-ledger:${request.id}` });
    await this.db.update(billingRefundRequests).set({ status: 'APPROVED', openKey: null, approvedAmountCents, reason: input.reason ?? request.reason, reviewedBy: input.reviewerId, reviewedAt: now, updatedAt: now }).where(eq(billingRefundRequests.id, input.requestId));
    await this.db.update(billingPayments).set({ status: 'REFUNDED', updatedAt: now }).where(eq(billingPayments.purchaseId, request.purchaseId));
    return (await this.db.select().from(billingRefundRequests).where(eq(billingRefundRequests.id, input.requestId)))[0] as typeof request;
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
    const purchases = await this.db.select().from(billingPurchases).where(eq(billingPurchases.id, purchaseId));
    const purchase = purchases[0];
    if (!purchase || !['PENDING', 'PROCESSING'].includes(purchase.status)) return;
    const providerPaymentId = typeof object.provider_payment_id === 'string' ? object.provider_payment_id : null;
    await this.billing.creditPurchase({ tenantId: purchase.tenantId, purchaseId: purchase.id, amountCents: purchase.amountCents, idempotencyKey: `${provider}:purchase:${purchase.id}` });
    const now = new Date().toISOString();
    await this.db.update(billingPurchases).set({ status: 'PAID', providerPaymentId, paidAt: now, receiptUrl: typeof object.receipt_url === 'string' ? object.receipt_url : null, updatedAt: now }).where(and(eq(billingPurchases.id, purchase.id), inArray(billingPurchases.status, ['PENDING', 'PROCESSING'])));
    if (providerPaymentId) await this.db.insert(billingPayments).values({ id: randomUUID(), tenantId: purchase.tenantId, purchaseId: purchase.id, provider, providerPaymentId, amountCents: purchase.amountCents, currency: purchase.currency, status: 'SUCCEEDED', paymentMethodType: null, createdAt: now, updatedAt: now }).onConflictDoNothing();
    await this.db.insert(billingInvoices).values({ id: randomUUID(), tenantId: purchase.tenantId, purchaseId: purchase.id, number: `FL-${purchase.id.slice(0, 8).toUpperCase()}`, status: 'PAID', amountCents: purchase.amountCents, currency: purchase.currency, receiptUrl: typeof object.receipt_url === 'string' ? object.receipt_url : null, issuedAt: now }).onConflictDoNothing({ target: billingInvoices.purchaseId });
    const metadata = typeof object.metadata === 'object' && object.metadata !== null ? object.metadata as Record<string, unknown> : {};
    if (metadata.auto_recharge === 'true') {
      await this.db.update(billingAccounts).set({ autoRechargeArmed: 1, updatedAt: now }).where(eq(billingAccounts.tenantId, purchase.tenantId));
    }
  }

  private async transitionPurchase(purchaseId: string, target: 'PROCESSING' | 'FAILED'): Promise<void> {
    const allowedFrom = target === 'PROCESSING' ? ['PENDING'] : ['PENDING', 'PROCESSING'];
    await this.db.update(billingPurchases)
      .set({ status: target, updatedAt: new Date().toISOString() })
      .where(and(eq(billingPurchases.id, purchaseId), inArray(billingPurchases.status, allowedFrom)));
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
