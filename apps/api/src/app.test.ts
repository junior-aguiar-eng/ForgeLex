import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import { FastifyInstance } from 'fastify';

describe('Fastify API & Remote MCP Edge (apps/api)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
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
  });

  it('GET /api/v2/tribunals deve retornar o catálogo de tribunais', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/tribunals',
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

  it('POST /mcp deve responder ao protocolo JSON-RPC 2.0', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
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
