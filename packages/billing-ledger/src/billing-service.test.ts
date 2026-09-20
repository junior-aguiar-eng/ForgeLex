import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { BillingService } from './billing-service.js';

describe('BillingService', () => {
  let billing: BillingService;

  beforeEach(async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    billing = new BillingService(connection.db, connection.client);
    await billing.runMigrations();
  });

  it('credita uma compra confirmada apenas uma vez por chave idempotente', async () => {
    const tenantId = `tenant_billing_${randomUUID()}`;
    const first = await billing.creditPurchase({
      tenantId,
      purchaseId: 'purchase_a',
      amountCents: 5000,
      idempotencyKey: 'mercadopago:payment:payment_a',
    });
    const replay = await billing.creditPurchase({
      tenantId,
      purchaseId: 'purchase_a',
      amountCents: 5000,
      idempotencyKey: 'mercadopago:payment:payment_a',
    });

    expect(first).toMatchObject({ creditedCents: 5000, isReplay: false, remainingBalanceCents: 5000 });
    expect(replay).toMatchObject({ creditedCents: 0, isReplay: true, remainingBalanceCents: 5000 });
  });

  it('mantém saldo e lotes isolados por tenant', async () => {
    const tenantA = `tenant_billing_a_${randomUUID()}`;
    const tenantB = `tenant_billing_b_${randomUUID()}`;
    await billing.creditPurchase({ tenantId: tenantA, purchaseId: `purchase_a_${tenantA}`, amountCents: 2500, idempotencyKey: `credit_a_${tenantA}` });
    await billing.creditPurchase({ tenantId: tenantB, purchaseId: `purchase_b_${tenantB}`, amountCents: 8000, idempotencyKey: `credit_b_${tenantB}` });

    expect((await billing.getAccount(tenantA)).paidBalanceCents).toBe(2500);
    expect((await billing.getAccount(tenantB)).paidBalanceCents).toBe(8000);
    expect(await billing.getCreditLots(tenantA)).toHaveLength(1);
    expect(await billing.getCreditLots(tenantB)).toHaveLength(1);
  });

  it('reembolsa somente o saldo não consumido do lote', async () => {
    const tenantId = `tenant_billing_${randomUUID()}`;
    await billing.creditPurchase({ tenantId, purchaseId: `purchase_${tenantId}`, amountCents: 5000, idempotencyKey: `credit_${tenantId}` });
    await billing.debitPaidCredits({ tenantId, amountCents: 1800, idempotencyKey: `usage_${tenantId}` });

    const refund = await billing.refundUnusedCredits({ tenantId, purchaseId: `purchase_${tenantId}`, idempotencyKey: `refund_${tenantId}` });

    expect(refund).toMatchObject({ refundedCents: 3200, isReplay: false, remainingBalanceCents: 0 });
    expect((await billing.getCreditLots(tenantId))[0].remainingCents).toBe(0);
    expect((await billing.refundUnusedCredits({ tenantId, purchaseId: `purchase_${tenantId}`, idempotencyKey: `refund_${tenantId}` })).isReplay).toBe(true);
  });

  it('não permite usar o purchaseId de outro tenant para reembolso', async () => {
    const tenantId = `tenant_billing_${randomUUID()}`;
    await billing.creditPurchase({ tenantId, purchaseId: `purchase_${tenantId}`, amountCents: 2500, idempotencyKey: `credit_${tenantId}` });

    await expect(billing.refundUnusedCredits({ tenantId: `other_${tenantId}`, purchaseId: `purchase_${tenantId}`, idempotencyKey: `refund_${tenantId}` }))
      .rejects.toThrow('BILLING_PURCHASE_NOT_FOUND');
  });

  it('migra identificadores de pagamento para nomes independentes do provedor', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const billing = new BillingService(connection.db, connection.client);
    await billing.runMigrations();

    const accounts = await connection.client.execute('PRAGMA table_info(billing_accounts)');
    const purchases = await connection.client.execute('PRAGMA table_info(billing_purchases)');

    expect(accounts.rows.map((row) => row.name)).toContain('provider_customer_id');
    expect(accounts.rows.map((row) => row.name)).not.toContain('stripe_customer_id');
    expect(purchases.rows.map((row) => row.name)).toContain('provider_checkout_id');
    expect(purchases.rows.map((row) => row.name)).toContain('provider_payment_id');
    expect(purchases.rows.map((row) => row.name)).not.toContain('stripe_checkout_session_id');
    expect(purchases.rows.map((row) => row.name)).not.toContain('stripe_payment_intent_id');
    connection.client.close();
  });
});
