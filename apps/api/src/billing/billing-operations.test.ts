import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  runPersistenceMigrations,
  type Client,
  type ForgeLexDatabase,
} from '@forgelex/persistence';
import {
  billingWebhookEvents,
  BillingService,
  LedgerService,
} from '@forgelex/billing-ledger';
import { BillingOperationsService, type PaymentProvider } from './billing-operations.js';

class FakePaymentProvider implements PaymentProvider {
  public checkouts: Array<Record<string, unknown>> = [];
  public autoPayments: Array<Record<string, unknown>> = [];
  public failNextCheckout = false;

  public async createCustomer(input: { tenantId: string }): Promise<{ id: string }> { return { id: `cus_${input.tenantId}` }; }

  public async createCheckout(input: Record<string, unknown>): Promise<{ id: string; url: string }> {
    this.checkouts.push(input);
    if (this.failNextCheckout) {
      this.failNextCheckout = false;
      throw new Error('PAYMENT_PROVIDER_UNAVAILABLE');
    }
    return { id: `cs_${String(input.purchaseId)}`, url: `https://checkout.test/${String(input.purchaseId)}` };
  }

  public async createPaymentMethodSetup(): Promise<{ id: string; clientSecret: string }> {
    return { id: 'setup_test', clientSecret: 'setup_secret_test' };
  }

  public async listPaymentMethods(): Promise<Array<{ id: string; type: string }>> { return []; }

  public async createOffSessionPayment(input: Record<string, unknown>): Promise<Record<string, unknown>> { this.autoPayments.push(input); return { id: `pi_auto_${this.autoPayments.length}`, status: 'processing' }; }
  public async refundPayment(): Promise<Record<string, unknown>> { return { id: 're_test', status: 'succeeded' }; }
}

function paidCheckoutEvent(
  purchase: { purchaseId: string; amountCents: number; currency: string },
  eventId: string,
  overrides: Record<string, unknown> = {},
) {
  const providerCheckoutId = `cs_${purchase.purchaseId}`;
  return {
    id: eventId,
    type: 'payment.approved',
    data: { object: {
      id: providerCheckoutId,
      payment_status: 'paid',
      provider_payment_id: providerCheckoutId,
      provider_checkout_id: providerCheckoutId,
      amount_total: purchase.amountCents,
      currency: purchase.currency,
      external_reference: purchase.purchaseId,
      metadata: { purchase_id: purchase.purchaseId },
      ...overrides,
    } },
  };
}

describe('BillingOperationsService', () => {
  let operations: BillingOperationsService;
  let provider: FakePaymentProvider;
  let client: Client;
  let db: ForgeLexDatabase;

  beforeEach(async () => {
    const connection = await createDatabase();
    client = connection.client;
    db = connection.db;
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    provider = new FakePaymentProvider();
    operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), provider);
  });

  it('cria uma única order idempotente para credits_25', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const first = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    const replay = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });

    expect(first).toMatchObject({ status: 'PENDING', amountCents: 2500, checkoutUrl: 'https://checkout.test/' + first.purchaseId });
    expect(replay.purchaseId).toBe(first.purchaseId);
    expect(provider.checkouts).toHaveLength(1);
  });

  it('rejeita parâmetros divergentes ao retomar checkout incompleto', async () => {
    const tenantId = `tenant_conflict_${randomUUID()}`;
    provider.failNextCheckout = true;
    await expect(operations.createCheckout({
      tenantId,
      userId: 'user_a',
      packageId: 'credits_50',
      idempotencyKey: `checkout_${tenantId}`,
    })).rejects.toThrow('PAYMENT_PROVIDER_UNAVAILABLE');

    await expect(operations.createCheckout({
      tenantId,
      userId: 'user_a',
      packageId: 'credits_25',
      idempotencyKey: `checkout_${tenantId}`,
    })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(provider.checkouts).toHaveLength(1);
  });

  it('retoma checkout incompleto com os campos persistidos e uma chave canônica', async () => {
    const tenantId = `tenant_resume_${randomUUID()}`;
    provider.failNextCheckout = true;
    await expect(operations.createCheckout({
      tenantId,
      userId: 'user_a',
      packageId: 'credits_50',
      idempotencyKey: `checkout_${tenantId}`,
    })).rejects.toThrow('PAYMENT_PROVIDER_UNAVAILABLE');
    const purchaseId = String(provider.checkouts[0]?.purchaseId);

    const resumed = await operations.createCheckout({
      tenantId,
      userId: 'user_a',
      packageId: 'credits_50',
      idempotencyKey: `checkout_${tenantId}`,
    });

    expect(resumed).toMatchObject({ purchaseId, amountCents: 5000, currency: 'brl' });
    expect(provider.checkouts).toHaveLength(2);
    expect(provider.checkouts).toEqual(expect.arrayContaining([
      expect.objectContaining({ purchaseId, amountCents: 5000, userId: 'user_a', idempotencyKey: purchaseId }),
    ]));
  });

  it('processa pagamento confirmado e não duplica o crédito em replay do webhook', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    const event = paidCheckoutEvent(purchase, `evt_paid_${tenantId}`);

    await operations.processWebhook(event);
    await operations.processWebhook(event);

    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
  });

  it.each([
    ['amount', { amount_total: 2500 }],
    ['currency', { currency: 'usd' }],
    ['external reference', { external_reference: 'purchase_other' }],
    ['checkout identity', { provider_checkout_id: 'cs_other' }],
  ])('envia liquidação com %s divergente para reconciliação', async (_field, overrides) => {
    const tenantId = `tenant_settlement_${randomUUID()}`;
    const purchase = await operations.createCheckout({
      tenantId,
      userId: 'user_a',
      packageId: 'credits_50',
      idempotencyKey: `checkout_${tenantId}`,
    });

    await expect(operations.processWebhook(
      paidCheckoutEvent(purchase, `evt_mismatch_${tenantId}`, overrides),
    )).rejects.toThrow('BILLING_SETTLEMENT_RECONCILIATION_REQUIRED');

    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('RECONCILIATION_REQUIRED');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
  });

  it('atribui ownership do webhook pela compra persistida, não pelo metadata', async () => {
    const tenantId = `tenant_owner_${randomUUID()}`;
    const purchase = await operations.createCheckout({
      tenantId,
      userId: 'user_a',
      packageId: 'credits_25',
      idempotencyKey: `checkout_${tenantId}`,
    });

    await operations.processWebhook({
      id: `evt_owner_${tenantId}`,
      type: 'payment.processing',
      data: {
        object: {
          metadata: {
            purchase_id: purchase.purchaseId,
            tenant_id: 'tenant_spoofed',
          },
        },
      },
    });

    const stored = await client.execute({
      sql: 'SELECT tenant_id FROM billing_webhook_events WHERE id = ?',
      args: [`evt_owner_${tenantId}`],
    });
    expect(stored.rows[0]?.tenant_id).toBe(tenantId);
  });

  it('cria solicitação de reembolso somente dentro de sete dias e limita ao saldo não usado', async () => {
    const tenantId = `tenant_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_50', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_paid_${tenantId}`));
    await operations.getBillingService().debitPaidCredits({ tenantId, amountCents: 1800, idempotencyKey: `usage_${tenantId}` });

    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId, now: new Date().toISOString() });

    expect(request).toMatchObject({ status: 'PENDING', eligibleAmountCents: 3200 });
  });

  it('inicia uma única recarga automática no cruzamento do limite e aguarda webhook', async () => {
    const tenantId = `tenant_auto_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_paid_${tenantId}`));
    const account = await operations.getBillingAccount(tenantId);
    await operations.updateAutoRecharge({ tenantId, enabled: true, amountCents: 2500, paymentMethodId: 'pm_test' });
    await operations.getBillingService().debitPaidCredits({ tenantId, amountCents: 2300, idempotencyKey: `usage_${tenantId}` });

    const first = await operations.startAutoRecharge(tenantId);
    const replay = await operations.startAutoRecharge(tenantId);

    expect(first.started).toBe(true);
    expect(replay.started).toBe(false);
    expect(provider.autoPayments).toHaveLength(1);
    await operations.processWebhook({
      id: `evt_auto_${tenantId}`,
      type: 'payment.succeeded',
      data: { object: {
        id: 'pi_auto_1',
        payment_status: 'paid',
        provider_payment_id: 'pi_auto_1',
        amount_total: 2500,
        currency: 'brl',
        external_reference: first.purchaseId,
        metadata: { tenant_id: tenantId, purchase_id: first.purchaseId, auto_recharge: 'true' },
      } },
    });
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2700);
    expect(account.providerCustomerId).toBeTruthy();
  });

  it('aprova reembolso real somente pelo saldo não consumido do lote', async () => {
    const tenantId = `tenant_review_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_paid_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    const reviewed = await operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin_1', decision: 'APPROVED' });

    expect(reviewed.status).toBe('APPROVED');
    expect(reviewed.approvedAmountCents).toBe(2500);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
  });

  it('recusa solicitação fora da janela de sete dias antes de chamar provider', async () => {
    const tenantId = `tenant_expired_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_paid_${tenantId}`));
    await expect(operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId, now: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString() })).rejects.toThrow('BILLING_REFUND_WINDOW_EXPIRED');
  });

  it('impede solicitações de reembolso duplicadas enquanto a compra está em análise', async () => {
    const tenantId = `tenant_refund_duplicate_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_paid_${tenantId}`));

    await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });

    await expect(operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId })).rejects.toThrow('REFUND_REQUEST_ALREADY_PENDING');
  });

  it('serializa solicitações concorrentes de reembolso para a mesma compra', async () => {
    const tenantId = `tenant_refund_concurrent_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_paid_${tenantId}`));

    const results = await Promise.allSettled([
      operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId }),
      operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ message: 'REFUND_REQUEST_ALREADY_PENDING' });
  });

  it('não regride compra paga quando recebe falha posterior', async () => {
    const tenantId = `tenant_monotonic_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    const paidEvent = paidCheckoutEvent(purchase, `evt_paid_${tenantId}`);
    const object = paidEvent.data.object;
    await operations.processWebhook(paidEvent);
    await operations.processWebhook({ id: `evt_failed_${tenantId}`, type: 'payment.failed', data: { object } });

    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });

  it('processa simultaneamente o mesmo evento do provedor sem duplicar crédito', async () => {
    const tenantId = `tenant_event_concurrent_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });
    const event = paidCheckoutEvent(purchase, `evt_concurrent_${tenantId}`);

    await Promise.all([operations.processWebhook(event), operations.processWebhook(event)]);

    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });
});
