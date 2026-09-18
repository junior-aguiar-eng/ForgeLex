import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { AuthAdapter } from '../auth/fastify-auth.js';
import type { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import { buildApp } from '../app.js';
import { BillingOperationsService, type PaymentProvider } from './billing-operations.js';
import { BillingService, LedgerService } from '@forgelex/billing-ledger';
import { MercadoPagoPaymentProvider } from './mercado-pago-payment-provider.js';

const principal: AuthenticatedPrincipal = {
  subjectId: 'subject_billing_routes',
  tenantId: 'tenant_billing_routes',
  userId: 'user_billing_routes',
  roles: ['lawyer'],
  scopes: ['billing:read', 'billing:write'],
  authMethod: 'api_key',
};

class TokenVerifier implements TokenVerifier {
  public async verify(token: string): Promise<AuthenticatedPrincipal | null> { return token === 'billing-token' ? principal : null; }
}

class Provider implements PaymentProvider {
  public readonly supportsAutoRecharge = false;
  public async createCustomer(): Promise<{ id: string }> { return { id: 'cus_route' }; }
  public async createCheckout(input: { purchaseId: string }): Promise<{ id: string; url: string }> { return { id: `cs_${input.purchaseId}`, url: `https://checkout.test/${input.purchaseId}` }; }
  public async createPaymentMethodSetup(): Promise<{ id: string; clientSecret: string }> { return { id: 'setup_test', clientSecret: 'secret' }; }
  public async listPaymentMethods(): Promise<Array<{ id: string; type: string }>> { return []; }
  public async createOffSessionPayment(): Promise<Record<string, unknown>> { return { id: 'pi_auto', status: 'succeeded' }; }
  public async refundPayment(): Promise<Record<string, unknown>> { return { id: 're_test', status: 'succeeded' }; }
}

describe('rotas de billing', () => {
  it('não expõe catálogo de preços de modelos na conta de billing', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    const app = await buildApp({
      authAdapter: new AuthAdapter(new TokenVerifier()),
      ledgerService: ledger,
      database: connection.db,
      databaseClient: connection.client,
      billingOperationsService: operations,
      environment: {
        NODE_ENV: 'test',
        FORGELEX_ALLOWED_ORIGINS: 'http://localhost:3000',
        FORGELEX_MODEL_PRICING_JSON: JSON.stringify([{ provider: 'openai', model: 'legacy-model' }]),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/v2/billing/account', headers: { authorization: 'Bearer billing-token' } });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({ currency: 'brl', searchCostCents: 20, packages: [{ amountCents: 2500 }, { amountCents: 5000 }, { amountCents: 8000 }], autoRecharge: { available: false } });
    expect(body).not.toHaveProperty('modelPricing');
    await app.close();
    connection.client.close();
  });

  it('cria checkout autenticado e exige chave de idempotência', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    const app = await buildApp({ authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger, database: connection.db, databaseClient: connection.client, billingOperationsService: operations, environment: { NODE_ENV: 'test' } });

    const missingKey = await app.inject({ method: 'POST', url: '/api/v2/billing/checkout', headers: { authorization: 'Bearer billing-token' }, payload: { packageId: 'credits_50' } });
    const created = await app.inject({ method: 'POST', url: '/api/v2/billing/checkout', headers: { authorization: 'Bearer billing-token', 'idempotency-key': 'route_checkout_1' }, payload: { packageId: 'credits_50' } });

    expect(missingKey.statusCode).toBe(400);
    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.body)).toMatchObject({ amountCents: 5000, status: 'PENDING' });
    await app.close();
    connection.client.close();
  });

  it('expõe extrato, faturas, métodos de pagamento e recarga sem saldo local fictício', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    const app = await buildApp({ authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger, database: connection.db, databaseClient: connection.client, billingOperationsService: operations, environment: { NODE_ENV: 'test' } });

    const headers = { authorization: 'Bearer billing-token' };
    const transactions = await app.inject({ method: 'GET', url: '/api/v2/billing/transactions', headers });
    const invoices = await app.inject({ method: 'GET', url: '/api/v2/billing/invoices', headers });
    const methods = await app.inject({ method: 'GET', url: '/api/v2/billing/payment-methods', headers });
    const setup = await app.inject({ method: 'POST', url: '/api/v2/billing/payment-methods/setup', headers: { ...headers, 'idempotency-key': 'setup_route_1' } });
    const auto = await app.inject({ method: 'PUT', url: '/api/v2/billing/auto-recharge', headers, payload: { enabled: false } });
    const refund = await app.inject({ method: 'POST', url: '/api/v2/billing/refund-requests', headers, payload: {} });

    expect(transactions.statusCode).toBe(200);
    expect(invoices.statusCode).toBe(200);
    expect(methods.statusCode).toBe(200);
    expect(setup.statusCode).toBe(200);
    expect(auto.statusCode).toBe(200);
    expect(refund.statusCode).toBe(400);
    expect(JSON.parse(transactions.body)).toMatchObject({ items: [], payments: [], refunds: [] });
    expect(JSON.parse(transactions.body).purchases).toHaveLength(1);
    await app.close();
    connection.client.close();
  });

  it('recebe webhook assinado do Mercado Pago e credita uma order processada uma única vez', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    let purchaseId = '';
    const mercadoPago = new MercadoPagoPaymentProvider({
      accessToken: 'APP_USR_test',
      webhookSecret: 'webhook-secret',
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        id: 'ORDTEST123',
        status: 'processed',
        external_reference: purchaseId,
        total_amount: '50.00',
        transactions: { payments: [{ id: 'PAYTEST123' }] },
      }), { status: 200 })),
    });
    const app = await buildApp({
      authAdapter: new AuthAdapter(new TokenVerifier()),
      ledgerService: ledger,
      database: connection.db,
      databaseClient: connection.client,
      billingOperationsService: operations,
      mercadoPagoPaymentProvider: mercadoPago,
      environment: { NODE_ENV: 'test' },
    });
    const checkout = await operations.createCheckout({ tenantId: principal.tenantId, userId: principal.userId, packageId: 'credits_50', idempotencyKey: 'mp_checkout_1' });
    purchaseId = checkout.purchaseId;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const manifest = `id:ordtest123;request-id:mp_req_1;ts:${timestamp};`;
    const signature = `ts=${timestamp},v1=${createHmac('sha256', 'webhook-secret').update(manifest).digest('hex')}`;
    const payload = { id: 123, type: 'order', action: 'order.updated', data: { id: 'ORDTEST123' } };

    const first = await app.inject({ method: 'POST', url: '/api/v2/webhooks/mercadopago?data.id=ORDTEST123', headers: { 'x-signature': signature, 'x-request-id': 'mp_req_1' }, payload });
    const second = await app.inject({ method: 'POST', url: '/api/v2/webhooks/mercadopago?data.id=ORDTEST123', headers: { 'x-signature': signature, 'x-request-id': 'mp_req_1' }, payload });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const purchase = await operations.getPurchase(purchaseId, principal.tenantId);
    expect(purchase?.status).toBe('PAID');
    await app.close();
    connection.client.close();
  });

  it('não expõe endpoint de webhook de provedor removido', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    const app = await buildApp({
      authAdapter: new AuthAdapter(new TokenVerifier()),
      ledgerService: ledger,
      database: connection.db,
      databaseClient: connection.client,
      billingOperationsService: operations,
      environment: { NODE_ENV: 'test' },
    });

    const response = await app.inject({ method: 'POST', url: '/api/v2/webhooks/stripe', payload: {} });

    expect(response.statusCode).toBe(404);
    await app.close();
    connection.client.close();
  });
});
