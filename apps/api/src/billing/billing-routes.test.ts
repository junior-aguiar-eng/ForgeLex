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

const billingOnlyPrincipal: AuthenticatedPrincipal = {
  ...principal,
  subjectId: 'subject_billing_only',
  tenantId: 'tenant_billing_only',
  userId: 'user_billing_only',
  scopes: ['billing:read', 'billing:write'],
};

const adminPrincipal: AuthenticatedPrincipal = {
  ...principal,
  subjectId: 'subject_billing_admin',
  tenantId: 'tenant_billing_admin',
  userId: 'user_billing_admin',
  scopes: ['billing:admin'],
};

const activityPrincipal: AuthenticatedPrincipal = {
  ...principal,
  subjectId: 'subject_billing_activity',
  tenantId: 'tenant_billing_activity',
  userId: 'user_billing_activity',
};

class TokenVerifier implements TokenVerifier {
  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    if (token === 'billing-token') return principal;
    if (token === 'billing-only-token') return billingOnlyPrincipal;
    if (token === 'billing-activity-token') return activityPrincipal;
    if (token === 'billing-admin-token') return adminPrincipal;
    if (token === 'billing-public-return-token') return { ...principal, tenantId: 'tenant_public_return', userId: 'user_public_return' };
    return null;
  }
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
  it('envia o retorno do checkout ao site publico quando WEB_URL nao esta configurada', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const provider = new Provider();
    vi.spyOn(provider, 'createCustomer').mockResolvedValue({ id: 'cus_public_return' });
    const checkoutSpy = vi.spyOn(provider, 'createCheckout');
    const app = await buildApp({
      authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger,
      database: connection.db, databaseClient: connection.client, paymentProvider: provider,
      environment: { NODE_ENV: 'test', FORGELEX_PUBLIC_URL: 'https://nexojuris.ia.br' },
    });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/v2/billing/checkout',
        headers: { authorization: 'Bearer billing-public-return-token', 'idempotency-key': 'public_return_1' },
        payload: { packageId: 'credits_25' },
      });
      expect(response.statusCode).toBe(201);
      const purchaseId = JSON.parse(response.body).purchaseId;
      expect(checkoutSpy).toHaveBeenCalledWith(expect.objectContaining({
        successUrl: `https://nexojuris.ia.br/?billing_purchase=${purchaseId}`,
        cancelUrl: `https://nexojuris.ia.br/?billing_canceled=${purchaseId}`,
      }));
    } finally {
      await app.close();
      connection.client.close();
    }
  });

  it('permite ao administrador concluir um estorno retido sem repetir a revisão', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const provider = new Provider();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), provider);
    const app = await buildApp({ authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger, database: connection.db, databaseClient: connection.client, billingOperationsService: operations, environment: { NODE_ENV: 'test' } });
    try {
      provider.createCustomer = async () => ({ id: 'cus_recover_route_1' });
      const tenantId = 'tenant_recover_route';
      const purchase = await operations.createCheckout({ tenantId, userId: 'user_recover', packageId: 'credits_25', idempotencyKey: 'recover_route_1' });
      const checkoutId = `cs_${purchase.purchaseId}`;
      await operations.processWebhook({ id: 'evt_recover_route', type: 'payment.approved', data: { object: {
        id: checkoutId, payment_status: 'paid', provider_payment_id: checkoutId, provider_checkout_id: checkoutId,
        amount_total: purchase.amountCents, currency: purchase.currency, external_reference: purchase.purchaseId, metadata: { purchase_id: purchase.purchaseId },
      } } });
      const request = await operations.createRefundRequest({ tenantId, userId: 'user_recover', purchaseId: purchase.purchaseId });
      provider.refundPayment = async () => { throw new Error('TIMEOUT'); };
      await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow('TIMEOUT');
      provider.refundPayment = async () => ({ id: 're_recovered', status: 'succeeded' });
      const url = `/api/v2/admin/billing/refund-requests/${request.id}/recover`;

      expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer billing-token' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/v2/admin/billing/refund-requests/inexistente/recover', headers: { authorization: 'Bearer billing-admin-token' } })).statusCode).toBe(404);

      const recovered = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer billing-admin-token' } });
      expect(recovered.statusCode).toBe(200);
      expect(JSON.parse(recovered.body)).toMatchObject({ id: request.id, status: 'APPROVED', operationState: 'LEDGER_SETTLED' });
      const replay = await app.inject({ method: 'POST', url, headers: { authorization: 'Bearer billing-admin-token' } });
      expect(replay.statusCode).toBe(200);
      expect(JSON.parse(replay.body)).toMatchObject({ operationState: 'LEDGER_SETTLED' });
    } finally {
      await app.close();
      connection.client.close();
    }
  });

  it('informa falha do provedor na recuperação com 503 e mantém o estorno recuperável', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const provider = new Provider();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), provider);
    const app = await buildApp({ authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger, database: connection.db, databaseClient: connection.client, billingOperationsService: operations, environment: { NODE_ENV: 'test' } });
    try {
      provider.createCustomer = async () => ({ id: 'cus_recover_route_2' });
      const tenantId = 'tenant_recover_route_503';
      const purchase = await operations.createCheckout({ tenantId, userId: 'user_recover', packageId: 'credits_25', idempotencyKey: 'recover_route_2' });
      const checkoutId = `cs_${purchase.purchaseId}`;
      await operations.processWebhook({ id: 'evt_recover_route_2', type: 'payment.approved', data: { object: {
        id: checkoutId, payment_status: 'paid', provider_payment_id: checkoutId, provider_checkout_id: checkoutId,
        amount_total: purchase.amountCents, currency: purchase.currency, external_reference: purchase.purchaseId, metadata: { purchase_id: purchase.purchaseId },
      } } });
      const request = await operations.createRefundRequest({ tenantId, userId: 'user_recover', purchaseId: purchase.purchaseId });
      provider.refundPayment = async () => { throw new Error('TIMEOUT'); };
      await expect(operations.reviewRefundRequest({ requestId: request.id, reviewerId: 'admin', decision: 'APPROVED' })).rejects.toThrow('TIMEOUT');

      const failed = await app.inject({ method: 'POST', url: `/api/v2/admin/billing/refund-requests/${request.id}/recover`, headers: { authorization: 'Bearer billing-admin-token' } });
      expect(failed.statusCode).toBe(503);
      expect(JSON.parse(failed.body)).toMatchObject({ error: 'TIMEOUT' });
      expect((await operations.listRefundRequests(tenantId))[0]).toMatchObject({ operationState: 'RECONCILIATION_REQUIRED' });
    } finally {
      await app.close();
      connection.client.close();
    }
  });

  describe('falhas do webhook Mercado Pago', () => {
    const signed = (dataId: string, requestId: string, secret = 'webhook-secret') => ({
      'x-signature': `ts=1700000000,v1=${createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:1700000000;`).digest('hex')}`,
      'x-request-id': requestId,
    });
    const webhookApp = async (fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>) => {
      const connection = await createDatabase();
      await runPersistenceMigrations(connection.client);
      const ledger = new LedgerService(connection.db, connection.client);
      await ledger.runMigrations();
      const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
      const mercadoPago = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret', fetcher });
      const app = await buildApp({ authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger, database: connection.db, databaseClient: connection.client, billingOperationsService: operations, mercadoPagoPaymentProvider: mercadoPago, environment: { NODE_ENV: 'test' } });
      return { app, operations, close: async () => { await app.close(); connection.client.close(); } };
    };
    const deliver = (app: Awaited<ReturnType<typeof webhookApp>>['app'], dataId: string, requestId: string, headers = signed(dataId, requestId)) =>
      app.inject({ method: 'POST', url: `/api/v2/webhooks/mercadopago?data.id=${dataId}`, headers, payload: { id: 1, type: 'order', data: { id: dataId } } });

    it.each([
      ['timeout ao consultar o provedor', 'ORDTIMEOUT1', () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); }],
      ['falha de rede ao consultar o provedor', 'ORDNETWORK1', () => { throw new TypeError('fetch failed'); }],
    ])('responde 503 para retentativa em %s, sem expor o texto do erro', async (_name, dataId, failure) => {
      const { app, close } = await webhookApp(async () => failure());
      try {
        const response = await deliver(app, dataId, `req_${dataId}`);
        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toMatchObject({ error: 'MERCADOPAGO_WEBHOOK_PROCESSING_FAILED' });
        expect(response.body).not.toContain('timeout');
        expect(response.body).not.toContain('fetch failed');
      } finally { await close(); }
    });

    it('responde 503 para retentativa quando o processamento local falha, sem vazar a mensagem do banco', async () => {
      const { app, operations, close } = await webhookApp(async () => new Response(JSON.stringify({ id: 'ORDTRANSIENT2', status: 'processed', total_amount: '25.00', currency: 'BRL', external_reference: 'purchase_unknown' })));
      try {
        vi.spyOn(operations, 'processWebhook').mockRejectedValueOnce(new Error('SQLITE_BUSY: database is locked (tenants_secret_table)'));
        const response = await deliver(app, 'ORDTRANSIENT2', 'req_transient_2');
        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toMatchObject({ error: 'MERCADOPAGO_WEBHOOK_PROCESSING_FAILED' });
        expect(response.body).not.toContain('tenants_secret_table');
      } finally { await close(); }
    });

    it('mantém 401 para assinatura inválida e 400 para entrega sem cabeçalhos', async () => {
      const { app, close } = await webhookApp(async () => new Response('{}'));
      try {
        const invalid = await deliver(app, 'ORDSIGN1', 'req_sign_1', signed('ORDSIGN1', 'req_sign_1', 'wrong-secret'));
        expect(invalid.statusCode).toBe(401);
        expect(JSON.parse(invalid.body)).toMatchObject({ error: 'MERCADOPAGO_WEBHOOK_SIGNATURE_INVALID' });
        const missing = await deliver(app, 'ORDSIGN2', 'req_sign_2', {} as ReturnType<typeof signed>);
        expect(missing.statusCode).toBe(400);
      } finally { await close(); }
    });

    it('mantém 503 com o código estável quando o provedor responde com erro HTTP', async () => {
      const { app, close } = await webhookApp(async () => new Response('{}', { status: 500 }));
      try {
        const response = await deliver(app, 'ORDHTTP500', 'req_http_500');
        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toMatchObject({ error: 'MERCADOPAGO_REQUEST_FAILED' });
      } finally { await close(); }
    });
  });

  it('impede chave exclusiva de billing de pesquisar jurisprudência', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    const app = await buildApp({ authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger, database: connection.db, databaseClient: connection.client, billingOperationsService: operations, environment: { NODE_ENV: 'test' } });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/research/search-case-law',
      headers: { authorization: 'Bearer billing-only-token', 'idempotency-key': 'scope_14' },
      payload: { query: 'vazamento', court: 'STJ', limit: 1 },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
    connection.client.close();
  });

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
    const conflict = await app.inject({ method: 'POST', url: '/api/v2/billing/checkout', headers: { authorization: 'Bearer billing-token', 'idempotency-key': 'route_checkout_1' }, payload: { packageId: 'credits_25' } });

    expect(missingKey.statusCode).toBe(400);
    expect(created.statusCode).toBe(201);
    expect(JSON.parse(created.body)).toMatchObject({ amountCents: 5000, status: 'PENDING' });
    expect(conflict.statusCode).toBe(409);
    expect(JSON.parse(conflict.body).error).toBe('IDEMPOTENCY_CONFLICT');
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

  it('projeta atividade saneada por capacidade e canal, sem consulta jurídica ou duplicidade de replay', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    await ledger.provisionAccount(activityPrincipal.tenantId, { paidBalanceCents: 100, promotionalBalanceCents: 50, promoExpiresAt: new Date(Date.now() + 60_000).toISOString() });
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    const app = await buildApp({ authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger, database: connection.db, databaseClient: connection.client, billingOperationsService: operations, environment: { NODE_ENV: 'test' } });

    const operation = {
      tenantId: activityPrincipal.tenantId,
      userId: activityPrincipal.userId,
      idempotencyKey: 'activity_mcp_1',
      billing: { mode: 'METERED' as const, unit: 'STJ_CASE_LAW_SEARCH', costCents: 20 },
      usage: { capability: 'research.search_case_law', toolName: 'research.search_case_law', sessionId: 'mcp_activity_1', requestId: 'activity_mcp_1' },
      operation: async () => ({ ok: true }),
    };
    await ledger.executeOperation(operation);
    await ledger.executeOperation(operation);

    const response = await app.inject({ method: 'GET', url: '/api/v2/billing/transactions', headers: { authorization: 'Bearer billing-activity-token' } });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      type: 'DEBIT', amountCents: 20, capability: 'Pesquisa jurisprudencial', channel: 'MCP', status: 'SETTLED',
    });
    expect(JSON.stringify(body.items[0])).not.toContain('query');
    await app.close();
    connection.client.close();
  });

  it('recebe webhook assinado do Mercado Pago e credita uma order processada uma única vez', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const paymentProvider = new Provider();
    vi.spyOn(paymentProvider, 'createCheckout').mockImplementation(async (input) => ({ id: 'ORDTEST123', url: `https://checkout.test/${input.purchaseId}` }));
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), paymentProvider);
    let purchaseId = '';
    const mercadoPago = new MercadoPagoPaymentProvider({
      accessToken: 'APP_USR_test', now: () => 1700000000000,
      webhookSecret: 'webhook-secret',
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        id: 'ORDTEST123',
        status: 'processed',
        external_reference: purchaseId,
        total_amount: '50.00',
        currency: 'BRL',
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
    const timestamp = '1700000000';
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

  it('rejeita webhook Mercado Pago com assinatura inválida', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const operations = new BillingOperationsService(connection.db, connection.client, new BillingService(connection.db, connection.client), new Provider());
    const mercadoPago = new MercadoPagoPaymentProvider({ accessToken: 'APP_USR_test', now: () => 1700000000000, webhookSecret: 'webhook-secret' });
    const app = await buildApp({
      authAdapter: new AuthAdapter(new TokenVerifier()), ledgerService: ledger,
      database: connection.db, databaseClient: connection.client,
      billingOperationsService: operations, mercadoPagoPaymentProvider: mercadoPago,
      environment: { NODE_ENV: 'test' },
    });

    const response = await app.inject({
      method: 'POST', url: '/api/v2/webhooks/mercadopago?data.id=ORDER1',
      headers: { 'x-signature': 'ts=1,v1=invalid', 'x-request-id': 'request-invalid' },
      payload: { id: 1, type: 'order', data: { id: 'ORDER1' } },
    });

    expect(response.statusCode).toBe(401);
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
