import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { BillingService, LedgerService } from '@forgelex/billing-ledger';
import { BillingOperationsService, type PaymentProvider } from './billing-operations.js';

class FakePaymentProvider implements PaymentProvider {
  public checkouts: Array<Record<string, unknown>> = [];
  public autoPayments: Array<Record<string, unknown>> = [];

  public async createCustomer(input: { tenantId: string }): Promise<{ id: string }> { return { id: `cus_${input.tenantId}` }; }

  public async createCheckout(input: Record<string, unknown>): Promise<{ id: string; url: string }> {
    this.checkouts.push(input);
    return { id: `cs_${String(input.purchaseId)}`, url: `https://checkout.test/${String(input.purchaseId)}` };
  }

  public async createPaymentMethodSetup(): Promise<{ id: string; clientSecret: string }> {
    return { id: 'setup_test', clientSecret: 'setup_secret_test' };
  }

  public async listPaymentMethods(): Promise<Array<{ id: string; type: string }>> { return []; }

  public async createOffSessionPayment(input: Record<string, unknown>): Promise<Record<string, unknown>> { this.autoPayments.push(input); return { id: `pi_auto_${this.autoPayments.length}`, status: 'processing' }; }
  public async refundPayment(): Promise<Record<string, unknown>> { return { id: 're_test', status: 'succeeded' }; }
}

describe('BillingOperationsService', () => {
  let operations: BillingOperationsService;
  let provider: FakePaymentProvider;

  beforeEach(async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    provider = new FakePaymentProvider();
    operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), provider);
  });

  it('cria Checkout idempotente para pacote em BRL', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const first = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_50', idempotencyKey: `checkout_${tenantId}` });
    const replay = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_50', idempotencyKey: `checkout_${tenantId}` });

    expect(first).toMatchObject({ status: 'PENDING', amountCents: 5000, checkoutUrl: 'https://checkout.test/' + first.purchaseId });
    expect(replay.purchaseId).toBe(first.purchaseId);
    expect(provider.checkouts).toHaveLength(1);
  });

  it('processa pagamento confirmado e não duplica o crédito em replay do webhook', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    const event = {
      id: `evt_paid_${tenantId}`,
      type: 'payment.approved',
      data: { object: { id: `checkout_test_${tenantId}`, payment_status: 'paid', provider_payment_id: `payment_test_${tenantId}`, metadata: { purchase_id: purchase.purchaseId } } },
    };

    await operations.processWebhook(event);
    await operations.processWebhook(event);

    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
  });

  it('cria solicitação de reembolso somente dentro de sete dias e limita ao saldo não usado', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_50', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook({
      id: `evt_paid_${tenantId}`,
      type: 'payment.approved',
      data: { object: { id: `checkout_test_${tenantId}`, payment_status: 'paid', provider_payment_id: `payment_test_${tenantId}`, metadata: { purchase_id: purchase.purchaseId } } },
    });
    await operations.getBillingService().debitPaidCredits({ tenantId, amountCents: 1800, idempotencyKey: `usage_${tenantId}` });

    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId, now: new Date().toISOString() });

    expect(request).toMatchObject({ status: 'PENDING', eligibleAmountCents: 3200 });
  });

  it('inicia uma única recarga automática no cruzamento do limite e aguarda webhook', async () => {
    const tenantId = `tenant_auto_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook({ id: `evt_paid_${tenantId}`, type: 'payment.approved', data: { object: { payment_status: 'paid', provider_payment_id: `payment_test_${tenantId}`, metadata: { purchase_id: purchase.purchaseId } } } });
    const account = await operations.getBillingAccount(tenantId);
    await operations.updateAutoRecharge({ tenantId, enabled: true, amountCents: 2500, paymentMethodId: 'pm_test' });
    await operations.getBillingService().debitPaidCredits({ tenantId, amountCents: 2300, idempotencyKey: `usage_${tenantId}` });

    const first = await operations.startAutoRecharge(tenantId);
    const replay = await operations.startAutoRecharge(tenantId);

    expect(first.started).toBe(true);
    expect(replay.started).toBe(false);
    expect(provider.autoPayments).toHaveLength(1);
    await operations.processWebhook({ id: `evt_auto_${tenantId}`, type: 'payment.succeeded', data: { object: { id: 'payment_auto_1', metadata: { tenant_id: tenantId, purchase_id: first.purchaseId, auto_recharge: 'true' } } } });
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2700);
    expect(account.providerCustomerId).toBeTruthy();
  });

  it('aprova reembolso real somente pelo saldo não consumido do lote', async () => {
    const tenantId = `tenant_review_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook({ id: `evt_paid_${tenantId}`, type: 'payment.approved', data: { object: { payment_status: 'paid', provider_payment_id: `payment_test_${tenantId}`, metadata: { purchase_id: purchase.purchaseId } } } });
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    const reviewed = await operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin_1', decision: 'APPROVED' });

    expect(reviewed.status).toBe('APPROVED');
    expect(reviewed.approvedAmountCents).toBe(2500);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
  });

  it('recusa solicitação fora da janela de sete dias antes de chamar provider', async () => {
    const tenantId = `tenant_expired_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook({ id: `evt_paid_${tenantId}`, type: 'payment.approved', data: { object: { payment_status: 'paid', provider_payment_id: `payment_test_${tenantId}`, metadata: { purchase_id: purchase.purchaseId } } } });
    await expect(operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId, now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() })).rejects.toThrow('BILLING_REFUND_WINDOW_EXPIRED');
  });

  it('impede solicitações de reembolso duplicadas enquanto a compra está em análise', async () => {
    const tenantId = `tenant_refund_duplicate_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook({ id: `evt_paid_${tenantId}`, type: 'payment.approved', data: { object: { payment_status: 'paid', provider_payment_id: `payment_test_${tenantId}`, metadata: { purchase_id: purchase.purchaseId } } } });

    await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });

    await expect(operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId })).rejects.toThrow('BILLING_REFUND_REQUEST_ALREADY_EXISTS');
  });
});
