import { createHmac, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { MercadoPagoPaymentProvider } from './mercado-pago-payment-provider.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  runPersistenceMigrations,
  type Client,
  type ForgeLexDatabase,
} from '@forgelex/persistence';
import {
  billingWebhookEvents,
  billingOperations,
  billingRefundRequests,
  ledgerEntries,
  BillingService,
  LedgerService,
} from '@forgelex/billing-ledger';
import { BillingOperationsService, PaymentProviderRejectedError, type PaymentProvider } from './billing-operations.js';

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
  public async refundPayment(_input: { providerPaymentId: string; amountCents: number; idempotencyKey: string }): Promise<Record<string, unknown>> { return { id: 're_test', status: 'succeeded' }; }
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
    const connection = await createDatabase(process.env.REFUND_DATABASE_URL ? { url: process.env.REFUND_DATABASE_URL } : {});
    client = connection.client;
    db = connection.db;
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    provider = new FakePaymentProvider();
    operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), provider);
  });

  afterEach(() => { client?.close(); });

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

  it('duas requisições simultâneas com a mesma chave resolvem para a mesma compra e o mesmo checkout', async () => {
    const tenantId = `tenant_concurrent_${randomUUID()}`;
    const input = { tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` };

    const [first, second] = await Promise.all([operations.createCheckout(input), operations.createCheckout(input)]);

    expect(second.purchaseId).toBe(first.purchaseId);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    const rows = await client.execute({ sql: 'SELECT id FROM billing_purchases WHERE tenant_id = ?', args: [tenantId] });
    expect(rows.rows).toHaveLength(1);
    expect(new Set(provider.checkouts.map((checkout) => checkout.idempotencyKey))).toEqual(new Set([first.purchaseId]));
  });

  it('duas requisições simultâneas com a mesma chave e parâmetros diferentes aceitam uma e recusam a outra com conflito', async () => {
    const tenantId = `tenant_concurrent_conflict_${randomUUID()}`;
    const key = `checkout_${tenantId}`;

    const results = await Promise.allSettled([
      operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: key }),
      operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_50', idempotencyKey: key }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0]!.reason as Error).message).toBe('IDEMPOTENCY_CONFLICT');
    const rows = await client.execute({ sql: 'SELECT id FROM billing_purchases WHERE tenant_id = ?', args: [tenantId] });
    expect(rows.rows).toHaveLength(1);
  });

  it('isola a chave de idempotência do provedor por compra quando dois tenants usam a mesma chave do cliente', async () => {
    const first = await operations.createCheckout({ tenantId: `tenant_key_a_${randomUUID()}`, userId: 'user_a', packageId: 'credits_25', idempotencyKey: 'checkout' });
    const second = await operations.createCheckout({ tenantId: `tenant_key_b_${randomUUID()}`, userId: 'user_b', packageId: 'credits_25', idempotencyKey: 'checkout' });

    expect(first.purchaseId).not.toBe(second.purchaseId);
    expect(provider.checkouts.map((checkout) => checkout.idempotencyKey)).toEqual([first.purchaseId, second.purchaseId]);
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

  it('não duplica crédito para notificações distintas da mesma compra', async () => {
    const tenantId = `tenant_distinct_events_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });

    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_first_${tenantId}`));
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_second_${tenantId}`));

    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
    expect(await operations.listInvoices(tenantId)).toHaveLength(1);
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

  it.each([
    ['amount', { amount_total: undefined }],
    ['currency', { currency: undefined }],
    ['external reference', { external_reference: undefined }],
    ['checkout identity', { provider_checkout_id: undefined }],
    ['payment identity', { provider_payment_id: undefined }],
  ])('aguarda evidência completa quando a liquidação chega sem %s, sem travar a compra', async (_field, overrides) => {
    const tenantId = `tenant_incomplete_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: `checkout_${tenantId}` });

    await expect(operations.processWebhook(
      paidCheckoutEvent(purchase, `evt_incomplete_${tenantId}`, overrides),
    )).rejects.toThrow('BILLING_SETTLEMENT_EVIDENCE_INCOMPLETE');
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PENDING');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);

    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_complete_${tenantId}`));
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });

  it('notificação de pagamento sem vínculo com a ordem aguarda a notificação da ordem em vez de travar a compra', async () => {
    const tenantId = `tenant_payment_first_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    const orderId = `cs_${purchase.purchaseId}`;
    const remote = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => 1700000000000,
      fetcher: async (url) => String(url).includes('/v1/payments/')
        ? new Response(JSON.stringify({ id: 'PAY1', status: 'approved', external_reference: purchase.purchaseId, transaction_amount: 25, currency_id: 'BRL' }))
        : new Response(JSON.stringify({ id: orderId, status: 'processed', total_amount: '25.00', currency: 'BRL', external_reference: purchase.purchaseId })) });
    const delivery = (type: string, dataId: string, requestId: string) => ({ payload: { type }, dataId, requestId,
      signature: `ts=1700000000000,v1=${createHmac('sha256', 'secret').update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:1700000000000;`).digest('hex')}` });

    await expect(operations.processMercadoPagoWebhook(remote, delivery('payment', 'PAY1', 'req_payment'))).rejects.toThrow('BILLING_SETTLEMENT_EVIDENCE_INCOMPLETE');
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PENDING');

    await operations.processMercadoPagoWebhook(remote, delivery('order', orderId, 'req_order'));
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
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

  it('revalida o lote depois da solicitação e remove o valor antes do provider', async () => {
    const tenantId = `tenant_stale_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    await operations.getBillingService().debitPaidCredits({ tenantId, amountCents: 1000, idempotencyKey: `consume_${tenantId}` });
    let remoteAmount = 0;
    provider.refundPayment = async (input: any) => {
      remoteAmount = input.amountCents;
      expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
      return { id: 'refund_stale', status: 'succeeded' };
    };
    const result = await operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' });
    expect(remoteAmount).toBe(1500);
    expect(result.approvedAmountCents).toBe(1500);
  });

  it('retém fundos no timeout e recupera com a mesma chave sem novo débito', async () => {
    const tenantId = `tenant_timeout_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    const keys: string[] = [];
    provider.refundPayment = async (input) => { keys.push(input.idempotencyKey); throw new Error('TIMEOUT'); };
    await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow('TIMEOUT');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
    expect((await operations.listRefundRequests(tenantId))[0]).toMatchObject({ operationState: 'RECONCILIATION_REQUIRED', openKey: purchase.purchaseId });
    provider.refundPayment = async (input) => { keys.push(input.idempotencyKey); return { id: 'recovered', status: 'succeeded' }; };
    const recovered = await operations.recoverRefundRequest(request.id);
    expect(recovered).toMatchObject({ status: 'APPROVED', operationState: 'LEDGER_SETTLED' });
    expect(keys).toEqual([`refund:${request.id}`, `refund:${request.id}`]);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
    await operations.recoverRefundRequest(request.id);
    expect(keys).toHaveLength(2);
  });

  it('devolve a retenção quando o provedor recusa o estorno de forma definitiva', async () => {
    const tenantId = `tenant_rejected_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    provider.refundPayment = async () => { throw new PaymentProviderRejectedError('MERCADOPAGO_REQUEST_FAILED:422'); };
    await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow('MERCADOPAGO_REQUEST_FAILED:422');

    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    const lot = (await operations.getBillingService().getCreditLots(tenantId)).find((item) => item.purchaseId === purchase.purchaseId);
    expect(lot?.remainingCents).toBe(2500);
    expect((await operations.listRefundRequests(tenantId))[0]).toMatchObject({
      status: 'REJECTED', operationState: 'PROVIDER_REJECTED', openKey: null, approvedAmountCents: 0, operationError: 'MERCADOPAGO_REQUEST_FAILED:422',
    });
    const account = await operations.getBillingService().getAccount(tenantId);
    const entries = await db.select().from(ledgerEntries);
    expect(entries.filter((entry) => entry.accountId === account.id && entry.idempotencyKey === `refund-reserve-release:${request.id}`)).toHaveLength(1);
    await expect(operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId })).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('libera a retenção quando a recuperação após um timeout encontra recusa definitiva', async () => {
    const tenantId = `tenant_rejected_recover_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    provider.refundPayment = async () => { throw new Error('TIMEOUT'); };
    await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow('TIMEOUT');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);

    provider.refundPayment = async () => { throw new PaymentProviderRejectedError('MERCADOPAGO_PAYMENT_NOT_FOUND'); };
    await expect(operations.recoverRefundRequest(request.id)).rejects.toThrow('MERCADOPAGO_PAYMENT_NOT_FOUND');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    expect((await operations.listRefundRequests(tenantId))[0]).toMatchObject({ status: 'REJECTED', operationState: 'PROVIDER_REJECTED', openKey: null });
    await expect(operations.recoverRefundRequest(request.id)).resolves.toMatchObject({ operationState: 'PROVIDER_REJECTED' });
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });

  it('nao libera a retencao quando uma recuperacao concorrente ja confirmou o estorno no provedor', async () => {
    const tenantId = `tenant_rejected_race_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    provider.refundPayment = async () => {
      await db.update(billingRefundRequests).set({ operationState: 'PROVIDER_SUCCEEDED' }).where(eq(billingRefundRequests.id, request.id));
      throw new PaymentProviderRejectedError('MERCADOPAGO_REQUEST_FAILED:422');
    };
    await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow('MERCADOPAGO_REQUEST_FAILED:422');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
    expect((await operations.listRefundRequests(tenantId))[0]).toMatchObject({ operationState: 'PROVIDER_SUCCEEDED' });
  });

  it('aprova uma única vez enquanto provider está suspenso, sem manter lock de carteira', async () => {
    const tenantId = `tenant_barrier_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    provider.refundPayment = async () => { calls++; entered(); await gate; return { id: 'barrier', status: 'succeeded' }; };
    const first = operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED', approvedAmountCents: 1200 });
    await started;
    // Independent BillingService shares only database locks, as separate processes would.
    const independent = new BillingService(db, client);
    await independent.debitPaidCredits({ tenantId, amountCents: 1000, idempotencyKey: `concurrent_${tenantId}` });
    await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'other', decision: 'APPROVED' })).rejects.toThrow('BILLING_REFUND_REQUEST_ALREADY_REVIEWED');
    release();
    expect((await first).approvedAmountCents).toBe(1200);
    expect(calls).toBe(1);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(300);
  });

  it('preserva reservas pendentes e limita o provider ao saldo livre', async () => {
    const tenantId = `tenant_reserved_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    const account = await operations.getAccount(tenantId);
    const now = new Date().toISOString();
    await db.insert(billingOperations).values({ id: randomUUID(), tenantId, accountId: account.id, idempotencyKey: `reserved_${tenantId}`, status: 'PENDING', reservedAmountCents: 1100, leaseExpiresAt: new Date(Date.now() + 60000).toISOString(), createdAt: now, updatedAt: now });
    provider.refundPayment = async (input) => { expect(input.amountCents).toBe(1400); return { status: 'succeeded' }; };
    const result = await operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' });
    expect(result.approvedAmountCents).toBe(1400);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(1100);
  });

  it('recupera sucesso remoto seguido de falha local sem repetir provider', async () => {
    const tenantId = `tenant_local_failure_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    let calls = 0;
    provider.refundPayment = async () => { calls++; return { id: 'remote_success', status: 'succeeded' }; };
    if (db.$forgelexDialect === 'postgres') {
      await client.execute(`CREATE OR REPLACE FUNCTION fail_refund_settlement() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'APPROVED' THEN RAISE EXCEPTION 'INJECTED_LOCAL_FAILURE'; END IF; RETURN NEW; END $$`);
      await client.execute(`CREATE TRIGGER fail_refund_settlement BEFORE UPDATE ON billing_refund_requests FOR EACH ROW EXECUTE FUNCTION fail_refund_settlement()`);
    } else {
      await client.execute(`CREATE TRIGGER fail_refund_settlement BEFORE UPDATE ON billing_refund_requests WHEN NEW.status = 'APPROVED' BEGIN SELECT RAISE(ABORT, 'INJECTED_LOCAL_FAILURE'); END`);
    }
    try {
      await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow();
      expect((await operations.listRefundRequests(tenantId))[0]).toMatchObject({ operationState: 'PROVIDER_SUCCEEDED', status: 'PENDING' });
      expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
    } finally {
      await client.execute(db.$forgelexDialect === 'postgres' ? 'DROP TRIGGER fail_refund_settlement ON billing_refund_requests' : 'DROP TRIGGER fail_refund_settlement');
    }
    const recovered = await operations.recoverRefundRequest(request.id);
    expect(recovered).toMatchObject({ operationState: 'LEDGER_SETTLED', status: 'APPROVED' });
    expect(calls).toBe(1);
    const entries = await db.select().from(ledgerEntries);
    expect(entries.filter((entry) => entry.idempotencyKey === `refund-ledger:${request.id}`)).toHaveLength(1);
  });

  it('rejeição mantém carteira e não chama provider', async () => {
    const tenantId = `tenant_rejected_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    provider.refundPayment = async () => { throw new Error('UNEXPECTED_PROVIDER_CALL'); };
    const result = await operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'REJECTED' });
    expect(result).toMatchObject({ status: 'REJECTED', openKey: null, approvedAmountCents: 0 });
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });

  it('lote consumido depois do pedido impede qualquer reembolso remoto', async () => {
    const tenantId = `tenant_consumed_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    await operations.getBillingService().debitPaidCredits({ tenantId, amountCents: 2500, idempotencyKey: `consume_${tenantId}` });
    provider.refundPayment = async () => { throw new Error('UNEXPECTED_PROVIDER_CALL'); };
    await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow('BILLING_REFUND_AMOUNT_INVALID');
    expect((await operations.listRefundRequests(tenantId))[0]).toMatchObject({ operationState: 'UNPREPARED', status: 'PENDING' });
  });

  it('recupera intenção preparada interrompida antes do envio', async () => {
    const tenantId = `tenant_prepared_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'user_a', packageId: 'credits_25', idempotencyKey: tenantId });
    await operations.processWebhook(paidCheckoutEvent(purchase, `evt_${tenantId}`));
    const request = await operations.createRefundRequest({ tenantId, userId: 'user_a', purchaseId: purchase.purchaseId });
    const prepared = await operations.getBillingService().prepareRefund({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED', approvedAmountCents: 99999 });
    expect(prepared).toMatchObject({ operationState: 'PREPARED', approvedAmountCents: 2500 });
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
    const restarted = new BillingOperationsService(db, client, new BillingService(db, client), provider);
    expect(await restarted.recoverRefundRequest(request.id)).toMatchObject({ status: 'APPROVED', approvedAmountCents: 2500, operationState: 'LEDGER_SETTLED' });
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

    const results = await Promise.allSettled([operations.processWebhook(event), operations.processWebhook(event)]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    for (const result of results) if (result.status === 'rejected') expect(result.reason.message).toBe('BILLING_WEBHOOK_RETRY_LATER');
    await operations.processWebhook(event);

    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });
  it('aceita aprovação válida depois de falha fora de ordem', async () => {
    const tenantId = `tenant_order_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    const paid = paidCheckoutEvent(purchase, 'approved');
    await operations.processWebhook({ ...paid, id: 'failed', type: 'payment.failed' });
    await operations.processWebhook(paid);
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });

  it('webhook antecipado aguarda identidade persistida e permite retry do mesmo evento', async () => {
    const tenantId = `tenant_early_${randomUUID()}`;
    let early: ReturnType<typeof paidCheckoutEvent> | undefined;
    const create = provider.createCheckout.bind(provider);
    vi.spyOn(provider, 'createCheckout').mockImplementation(async (input) => {
      early = paidCheckoutEvent({ purchaseId: String(input.purchaseId), amountCents: Number(input.amountCents), currency: 'brl' }, 'early');
      await expect(operations.processWebhook(early)).rejects.toThrow('BILLING_SETTLEMENT_IDENTITY_PENDING');
      return create(input);
    });
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PENDING');
    await operations.processWebhook(early!);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PAID');
  });

  it('rollback de fatura não deixa crédito ou compra paga parciais', async () => {
    const tenantId = `tenant_atomic_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    await client.execute("CREATE TRIGGER fail_invoice BEFORE INSERT ON billing_invoices BEGIN SELECT RAISE(ABORT, 'SIMULATED_INVOICE_FAILURE'); END");
    const paid = paidCheckoutEvent(purchase, 'atomic');
    await expect(operations.processWebhook(paid)).rejects.toThrow();
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('PENDING');
    await client.execute('DROP TRIGGER fail_invoice');
    await operations.processWebhook(paid);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    expect(await operations.listInvoices(tenantId)).toHaveLength(1);
  });

  it('reconciliação não é liquidada automaticamente por uma notificação posterior', async () => {
    const tenantId = `tenant_reconcile_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    await expect(operations.processWebhook(paidCheckoutEvent(purchase, 'bad', { amount_total: 5000 }))).rejects.toThrow('BILLING_SETTLEMENT_RECONCILIATION_REQUIRED');
    await operations.processWebhook(paidCheckoutEvent(purchase, 'good'));
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(0);
    expect((await operations.getPurchase(purchase.purchaseId, tenantId))?.status).toBe('RECONCILIATION_REQUIRED');
  });

  it('recibo assinado deduplica antes do GET e preserva retries antigos já conhecidos', async () => {
    const tenantId = `tenant_receipt_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    let now = 1700000000000;
    let calls = 0;
    const remote = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => now,
      fetcher: async () => { calls++; return new Response(JSON.stringify({ id: `cs_${purchase.purchaseId}`, status: 'processed', total_amount: '25.00', currency: 'BRL', external_reference: purchase.purchaseId })); } });
    const dataId = `cs_${purchase.purchaseId}`;
    const signature = `ts=1700000000000,v1=${createHmac('sha256', 'secret').update(`id:${dataId.toLowerCase()};request-id:request;ts:1700000000000;`).digest('hex')}`;
    const input = { payload: { type: 'order', id: 'first' }, dataId, requestId: 'request', signature };
    await operations.processMercadoPagoWebhook(remote, input);
    now += 900000;
    await operations.processMercadoPagoWebhook(remote, { ...input, payload: { ...input.payload, id: 'unsigned-second' } });
    expect(calls).toBe(1);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
    const records = await client.execute({ sql: 'SELECT id FROM billing_webhook_events WHERE payload LIKE ?', args: [`%${purchase.purchaseId}%`] });
    expect(records.rows).toHaveLength(2); // one authenticated delivery receipt plus one canonical event
  });

  it('falha transitória de GET pode ser retomada depois do cooldown sem exigir timestamp novo', async () => {
    const tenantId = `tenant_receipt_retry_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    let now = 1700000000000;
    let calls = 0;
    const remote = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => now,
      fetcher: async () => { calls++; return calls === 1 ? new Response('{}', { status: 503 }) : new Response(JSON.stringify({ id: `cs_${purchase.purchaseId}`, status: 'processed', total_amount: '25.00', currency: 'BRL', external_reference: purchase.purchaseId })); } });
    const dataId = `cs_${purchase.purchaseId}`;
    const signature = `ts=1700000000000,v1=${createHmac('sha256', 'secret').update(`id:${dataId.toLowerCase()};request-id:retry;ts:1700000000000;`).digest('hex')}`;
    const input = { payload: { type: 'order' }, dataId, requestId: 'retry', signature };
    await expect(operations.processMercadoPagoWebhook(remote, input)).rejects.toThrow('MERCADOPAGO_REQUEST_FAILED');
    await expect(operations.processMercadoPagoWebhook(remote, input)).rejects.toThrow('BILLING_WEBHOOK_RETRY_LATER');
    expect(calls).toBe(1);
    await client.execute({ sql: 'UPDATE billing_webhook_events SET received_at = ?', args: [new Date(Date.now() - 60000).toISOString()] });
    now += 900000;
    await operations.processMercadoPagoWebhook(remote, input);
    expect(calls).toBe(2);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });

  it('recarga automática antecipada aguarda identidade e dois disparos concorrentes não cobram duas vezes', async () => {
    const tenantId = `tenant_auto_early_${randomUUID()}`;
    const seed = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'seed' });
    await operations.processWebhook(paidCheckoutEvent(seed, 'seed'));
    await operations.updateAutoRecharge({ tenantId, enabled: true, amountCents: 2500, paymentMethodId: 'pm_test' });
    await operations.getBillingService().debitPaidCredits({ tenantId, amountCents: 2300, idempotencyKey: 'usage' });
    let event: Parameters<BillingOperationsService['processWebhook']>[0] | undefined;
    vi.spyOn(provider, 'createOffSessionPayment').mockImplementation(async (input) => {
      provider.autoPayments.push(input);
      const metadata = input.metadata as Record<string, string>;
      event = { id: 'early-auto', type: 'payment.succeeded', data: { object: { id: 'pi_early', provider_payment_id: 'pi_early', amount_total: 2500, currency: 'brl', external_reference: metadata.purchase_id, metadata } } };
      await expect(operations.processWebhook(event)).rejects.toThrow('BILLING_SETTLEMENT_IDENTITY_PENDING');
      return { id: 'pi_early' };
    });
    const results = await Promise.all([operations.startAutoRecharge(tenantId), operations.startAutoRecharge(tenantId)]);
    expect(results.filter((result) => result.started)).toHaveLength(1);
    expect(provider.autoPayments).toHaveLength(1);
    await operations.processWebhook(event!);
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2700);
  });

  it('não confirma recibo B enquanto evento canônico A está em andamento e B pode recuperar falha de A', async () => {
    const tenantId = `tenant_receipt_busy_${randomUUID()}`;
    const purchase = await operations.createCheckout({ tenantId, userId: 'u', packageId: 'credits_25', idempotencyKey: 'checkout' });
    const remote = new MercadoPagoPaymentProvider({ accessToken: 'test', webhookSecret: 'secret', now: () => 1700000000000,
      fetcher: async () => new Response(JSON.stringify({ id: `cs_${purchase.purchaseId}`, status: 'processed', total_amount: '25.00', currency: 'BRL', external_reference: purchase.purchaseId })) });
    const dataId = `cs_${purchase.purchaseId}`;
    const input = (requestId: string) => ({ payload: { type: 'order' }, dataId, requestId, signature: `ts=1700000000000,v1=${createHmac('sha256', 'secret').update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:1700000000000;`).digest('hex')}` });
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = operations.getBillingService().creditPurchase.bind(operations.getBillingService());
    const blocked = vi.spyOn(operations.getBillingService(), 'creditPurchase').mockImplementationOnce(async () => { entered(); await gate; throw new Error('TRANSIENT_SETTLEMENT_FAILURE'); });
    const first = operations.processMercadoPagoWebhook(remote, input('A'));
    void first.catch(() => {});
    await started;
    try {
      await expect(operations.processMercadoPagoWebhook(remote, input('B'))).rejects.toThrow('BILLING_WEBHOOK_RETRY_LATER');
    } finally { release(); }
    await expect(first).rejects.toThrow('TRANSIENT_SETTLEMENT_FAILURE');
    blocked.mockImplementation(original);
    await client.execute({ sql: "UPDATE billing_webhook_events SET received_at = ? WHERE status = 'FAILED'", args: [new Date(Date.now() - 60000).toISOString()] });
    await operations.processMercadoPagoWebhook(remote, input('B'));
    expect((await operations.getAccount(tenantId)).paidBalanceCents).toBe(2500);
  });

});
