import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import { FastifyInstance } from 'fastify';
import { AuthAdapter } from './auth/fastify-auth.js';
import { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import { createDatabase } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import type { Client } from '@libsql/client';

const testPrincipal: AuthenticatedPrincipal = {
  subjectId: 'subject_test',
  tenantId: 'tenant_test',
  userId: 'user_test',
  roles: ['lawyer'],
  scopes: ['mcp', 'research:read', 'billing:read'],
  authMethod: 'api_key',
};

class FixtureTokenVerifier implements TokenVerifier {
  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    if (token === 'test-token') {
      return testPrincipal;
    }

    if (token === 'mcp-only-token') {
      return { ...testPrincipal, scopes: ['mcp'] };
    }

    return null;
  }
}

const authHeaders = { authorization: 'Bearer test-token' };

describe('Fastify API & Remote MCP Edge (apps/api)', () => {
  let app: FastifyInstance;
  let client: Client;

  beforeAll(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    client = connection.client;
    const ledgerService = new LedgerService(connection.db, client);
    await ledgerService.runMigrations();
    await ledgerService.provisionAccount('tenant_test', {
      paidBalanceCents: 6300,
      promotionalBalanceCents: 1500,
      promoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    app = await buildApp({
      authAdapter: new AuthAdapter(new FixtureTokenVerifier()),
      ledgerService,
      environment: {
        NODE_ENV: 'test',
        FORGELEX_ALLOWED_ORIGINS: 'http://localhost:3000',
      },
    });
  });

  afterAll(async () => {
    await app.close();
    client.close();
  });

  it('GET /health deve responder 200 OK com metadados do serviço', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('forgelex-api');
  });

  it('GET /.well-known/oauth-protected-resource deve responder metadados OAuth 2.1 corretos', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/oauth-protected-resource',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.resource).toBe('https://mcp.forgelex.ai');
    expect(body.scopes_supported).toContain('mcp');
    expect(body.scopes_supported).toContain('research:read');
  });

  it('rotas protegidas devem rejeitar credencial ausente', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/tribunals',
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer realm="forgelex-api"');
    expect(JSON.parse(response.body).error).toBe('UNAUTHENTICATED');
  });

  it('a configuração padrão deve falhar fechado sem credenciais de API', async () => {
    const defaultApp = await buildApp({ environment: { NODE_ENV: 'production' } });

    try {
      const response = await defaultApp.inject({
        method: 'POST',
        url: '/mcp',
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe('UNAUTHENTICATED');
    } finally {
      await defaultApp.close();
    }
  });

  it('token válido sem escopo suficiente deve ser rejeitado', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/tribunals',
      headers: { authorization: 'Bearer mcp-only-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe('INSUFFICIENT_SCOPE');
  });

  it('GET /api/v2/tribunals deve retornar o catálogo de tribunais', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/tribunals',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.total).toBeGreaterThanOrEqual(4);
    expect(body.tribunals.some((t: any) => t.code === 'STJ')).toBe(true);
  });

  it('GET /api/v2/jurisprudencias deve retornar acórdãos com headers de faturamento', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/jurisprudencias?q=LGPD+dano+moral&court=STJ',
      headers: {
        ...authHeaders,
        'idempotency-key': 'test_rest_req_101',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-billable-units']).toBe('1');
    expect(response.headers['x-credit-cost-per-unit']).toBe('0.15');
    expect(response.headers['x-credits-charged']).toBe('0.15');

    const body = JSON.parse(response.body);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    expect(body.results[0].court).toBe('STJ');
  });

  it('deve derivar o tenant da credencial e ignorar headers de spoofing', async () => {
    const idempotencyKey = 'test_tenant_spoofing_001';
    const firstResponse = await app.inject({
      method: 'GET',
      url: '/api/v2/jurisprudencias?q=LGPD+dano+moral&court=STJ',
      headers: {
        ...authHeaders,
        'idempotency-key': idempotencyKey,
        'x-tenant-id': 'tenant_attacker',
        'x-user-id': 'user_attacker',
      },
    });

    const replayResponse = await app.inject({
      method: 'GET',
      url: '/api/v2/jurisprudencias?q=LGPD+dano+moral&court=STJ',
      headers: {
        ...authHeaders,
        'idempotency-key': idempotencyKey,
        'x-tenant-id': 'tenant_other_attacker',
        'x-user-id': 'user_other_attacker',
      },
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.headers['x-idempotent-replay']).toBe('true');
  });

  it('deve permitir CORS somente para origem explicitamente configurada', async () => {
    const allowedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    const deniedResponse = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://attacker.example' },
    });

    expect(allowedResponse.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(deniedResponse.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('POST /mcp deve responder ao protocolo JSON-RPC 2.0', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: authHeaders,
      payload: {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.result.serverInfo.name).toBe('forgelex-mcp-server');
  });

  it('GET /mcp deve retornar 405 Method Not Allowed conforme padrão do protocolo', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/mcp',
    });

    expect(response.statusCode).toBe(405);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('METHOD_NOT_ALLOWED');
  });
});
