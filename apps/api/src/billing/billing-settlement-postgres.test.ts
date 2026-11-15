import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { BillingService, LedgerService } from '@forgelex/billing-ledger';
import { BillingOperationsService, type PaymentProvider } from './billing-operations.js';

const url = process.env.FORGELEX_SETTLEMENT_TEST_DATABASE_URL;
const provider: PaymentProvider = {
  createCustomer: async ({ tenantId }) => ({ id: `customer_${tenantId}` }),
  createCheckout: async ({ purchaseId }) => ({ id: `cs_${purchaseId}`, url: 'https://example.test/checkout' }),
  createPaymentMethodSetup: async () => ({ id: 'unused', clientSecret: 'unused' }),
  listPaymentMethods: async () => [],
  createOffSessionPayment: async () => ({}),
  refundPayment: async () => ({}),
};

async function fixture() {
  const a = await createDatabase({ url });
  const b = await createDatabase({ url });
  await runPersistenceMigrations(a.client);
  await new LedgerService(a.db, a.client).runMigrations();
  const billingA = new BillingService(a.db, a.client);
  const billingB = new BillingService(b.db, b.client);
  await billingA.runMigrations();
  await billingB.runMigrations();
  const first = new BillingOperationsService(a.db, a.client, billingA, provider);
  const second = new BillingOperationsService(b.db, b.client, billingB, provider);
  const tenantId = `settlement_${randomUUID()}`;
  const purchase = await first.createCheckout({
    tenantId,
    userId: 'u',
    packageId: 'credits_25',
    idempotencyKey: 'checkout',
  });
  const event = {
    id: randomUUID(),
    provider: 'mercadopago',
    type: 'payment.approved',
    data: {
      object: {
        provider_payment_id: `payment_${purchase.purchaseId}`,
        provider_checkout_id: `cs_${purchase.purchaseId}`,
        payment_status: 'paid',
        amount_total: 2500,
        currency: 'brl',
        external_reference: purchase.purchaseId,
        metadata: { purchase_id: purchase.purchaseId },
      },
    },
  };
  return { a, b, first, second, tenantId, purchase, event };
}

describe.skipIf(!url)('PostgreSQL settlement atomicity', () => {
  it('distinct callbacks on independent service instances credit once', async () => {
    const f = await fixture();
    try {
      await Promise.all([f.first.processWebhook(f.event), f.second.processWebhook({ ...f.event, id: randomUUID() })]);
      expect((await f.first.getAccount(f.tenantId)).paidBalanceCents).toBe(2500);
      expect((await f.first.getPurchase(f.purchase.purchaseId, f.tenantId))?.status).toBe('PAID');
      expect(await f.first.listInvoices(f.tenantId)).toHaveLength(1);
    } finally {
      f.a.client.close();
      f.b.client.close();
    }
  });

  it('invoice failure rolls back money and state, same event retry recovers', async () => {
    const f = await fixture();
    try {
      await f.a.client.execute(
        "CREATE OR REPLACE FUNCTION fail_settlement_invoice() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'SIMULATED_INVOICE_FAILURE'; END; $$ LANGUAGE plpgsql",
      );
      await f.a.client.execute(
        'CREATE TRIGGER fail_settlement_invoice BEFORE INSERT ON billing_invoices FOR EACH ROW EXECUTE FUNCTION fail_settlement_invoice()',
      );
      await expect(f.first.processWebhook(f.event)).rejects.toThrow();
      expect((await f.first.getAccount(f.tenantId)).paidBalanceCents).toBe(0);
      expect((await f.first.getPurchase(f.purchase.purchaseId, f.tenantId))?.status).toBe('PENDING');
      await f.a.client.execute('DROP TRIGGER fail_settlement_invoice ON billing_invoices');
      await f.first.processWebhook(f.event);
      expect((await f.first.getAccount(f.tenantId)).paidBalanceCents).toBe(2500);
      expect(await f.first.listInvoices(f.tenantId)).toHaveLength(1);
    } finally {
      await f.a.client.execute('DROP TRIGGER IF EXISTS fail_settlement_invoice ON billing_invoices');
      await f.a.client.execute('DROP FUNCTION IF EXISTS fail_settlement_invoice()');
      f.a.client.close();
      f.b.client.close();
    }
  });
  it('two replicas claim only one automatic recharge', async () => {
    const f = await fixture();
    let calls = 0;
    const paymentId = `auto_${randomUUID()}`;
    const spy = vi.spyOn(provider, 'createOffSessionPayment').mockImplementation(async () => {
      calls++;
      return { id: paymentId };
    });
    try {
      await f.first.processWebhook(f.event);
      await f.first.updateAutoRecharge({
        tenantId: f.tenantId,
        enabled: true,
        amountCents: 2500,
        paymentMethodId: 'pm_test',
      });
      await f.first
        .getBillingService()
        .debitPaidCredits({ tenantId: f.tenantId, amountCents: 2300, idempotencyKey: 'usage' });
      const results = await Promise.all([
        f.first.startAutoRecharge(f.tenantId),
        f.second.startAutoRecharge(f.tenantId),
      ]);
      expect(results.filter((result) => result.started)).toHaveLength(1);
      expect(calls).toBe(1);
      const purchaseId = results.find((result) => result.started)!.purchaseId!;
      await f.first.processWebhook({
        id: randomUUID(),
        type: 'payment.succeeded',
        data: {
          object: {
            id: paymentId,
            provider_payment_id: paymentId,
            amount_total: 2500,
            currency: 'brl',
            external_reference: purchaseId,
            metadata: { purchase_id: purchaseId, auto_recharge: 'true' },
          },
        },
      });
      expect((await f.first.getAccount(f.tenantId)).paidBalanceCents).toBe(2700);
    } finally {
      spy.mockRestore();
      f.a.client.close();
      f.b.client.close();
    }
  });
  it('settlement and refund compose without refunding spent credits or recrediting replay', async () => {
    const f = await fixture();
    const spy = vi.spyOn(provider, 'refundPayment').mockImplementation(async (input) => {
      expect(input.amountCents).toBe(2000);
      expect((await f.first.getAccount(f.tenantId)).paidBalanceCents).toBe(0);
      return { id: 'synthetic_refund', status: 'succeeded' };
    });
    try {
      await f.first.processWebhook(f.event);
      const request = await f.first.createRefundRequest({
        tenantId: f.tenantId,
        userId: 'u',
        purchaseId: f.purchase.purchaseId,
      });
      await f.first
        .getBillingService()
        .debitPaidCredits({ tenantId: f.tenantId, amountCents: 500, idempotencyKey: 'spent' });
      const result = await f.first.reviewRefundRequest({
        requestId: request.id,
        reviewerId: 'admin',
        decision: 'APPROVED',
      });
      expect(result).toMatchObject({ status: 'APPROVED', operationState: 'LEDGER_SETTLED', approvedAmountCents: 2000 });
      await f.second.processWebhook({ ...f.event, id: randomUUID() });
      expect((await f.first.getAccount(f.tenantId)).paidBalanceCents).toBe(0);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      f.a.client.close();
      f.b.client.close();
    }
  });
});
