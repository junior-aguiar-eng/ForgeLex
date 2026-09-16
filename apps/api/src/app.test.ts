import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import { FastifyInstance } from 'fastify';
import { AuthAdapter } from './auth/fastify-auth.js';
import { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import { createDatabase, ForgeLexDatabase } from '@forgelex/persistence';
import { runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import { CanonicalFixtureProvider, SourceRouter } from '@forgelex/source-providers';
import type { Client } from '@libsql/client';

const testPrincipal: AuthenticatedPrincipal = {
  subjectId: 'subject_test',
  tenantId: 'tenant_test',
  userId: 'user_test',
  roles: ['lawyer'],
  scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'billing:read'],
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

    if (token === 'tenant-b-token') {
      return { ...testPrincipal, tenantId: 'tenant_b', userId: 'user_b' };
    }

    return null;
  }
}

const authHeaders = { authorization: 'Bearer test-token' };

describe('Fastify API & Remote MCP Edge (apps/api)', () => {
  let app: FastifyInstance;
  let client: Client;
  let database: ForgeLexDatabase;
  let auditRecorder: AuditRecorder;

  beforeAll(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    database = connection.db;
    client = connection.client;
    const ledgerService = new LedgerService(connection.db, client);
    await runPersistenceMigrations(client);
    await ledgerService.runMigrations();
    await ledgerService.provisionAccount('tenant_test', {
      paidBalanceCents: 6300,
      promotionalBalanceCents: 1500,
      promoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const sourceRouter = new SourceRouter();
    sourceRouter.registerProvider(new CanonicalFixtureProvider());
    auditRecorder = new AuditRecorder(connection.db);

    app = await buildApp({
      authAdapter: new AuthAdapter(new FixtureTokenVerifier()),
      ledgerService,
      database,
      sourceRouter,
      auditRecorder,
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

  it('deve criar, listar e consultar matters isolados pelo tenant autenticado', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: {
        title: 'Ação de responsabilidade civil',
        practiceArea: 'Cível',
        jurisdiction: 'TJSP',
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const matter = JSON.parse(createResponse.body);
    expect(matter).toMatchObject({ tenantId: 'tenant_test', title: 'Ação de responsabilidade civil', status: 'OPEN' });
    expect((await auditRecorder.getLogsForSession(`matter_${matter.id}`))[0].toolName).toBe('matter.created');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v2/matters',
      headers: authHeaders,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(JSON.parse(listResponse.body).items).toHaveLength(1);

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}`,
      headers: authHeaders,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(JSON.parse(detailResponse.body).matter.id).toBe(matter.id);

    const otherTenantResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}`,
      headers: { authorization: 'Bearer tenant-b-token' },
    });
    expect(otherTenantResponse.statusCode).toBe(404);
  });

  it('deve ingerir texto e devolver versão, hash e âncoras do documento', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: { title: 'Matter com documentos' },
    });
    const matter = JSON.parse(createResponse.body);

    const documentResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/documents`,
      headers: authHeaders,
      payload: {
        title: 'Relato dos fatos',
        originalFilename: 'relato.txt',
        mimeType: 'text/plain',
        content: 'Primeiro fato.\n\nSegundo fato.',
      },
    });

    expect(documentResponse.statusCode).toBe(200);
    const body = JSON.parse(documentResponse.body);
    expect(body.document.status).toBe('INDEXED');
    expect(body.version).not.toHaveProperty('content');
    expect(body.version.contentHash).toHaveLength(64);
    expect(body.anchors).toHaveLength(2);
    expect(body.anchors[0].anchorKey).toBe('p1');
    expect((await auditRecorder.getLogsForSession(`document_${body.document.id}`))[0].toolName).toBe('document.ingested');

    const documentDetailResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/documents/${body.document.id}`,
      headers: authHeaders,
    });
    expect(documentDetailResponse.statusCode).toBe(200);
    expect(JSON.parse(documentDetailResponse.body).anchors).toHaveLength(2);
  });

  it('deve registrar fatos, provas, suporte, cobertura e linha do tempo no matter autenticado', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: { title: 'Matter de evidências' },
    });
    const matter = JSON.parse(createResponse.body);
    const documentResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/documents`,
      headers: authHeaders,
      payload: {
        title: 'Prova textual',
        originalFilename: 'prova.txt',
        content: 'O contrato foi assinado em janeiro.\n\nO pagamento foi interrompido em março.',
      },
    });
    const document = JSON.parse(documentResponse.body);
    const factResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/facts`,
      headers: authHeaders,
      payload: {
        statement: 'O contrato foi assinado em janeiro.',
        category: 'TEMPORAL',
      },
    });
    expect(factResponse.statusCode).toBe(200);
    const fact = JSON.parse(factResponse.body);
    expect(fact).toMatchObject({ tenantId: 'tenant_test', matterId: matter.id, status: 'ASSERTED' });

    const evidenceResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/evidence`,
      headers: authHeaders,
      payload: { title: 'Contrato assinado', evidenceType: 'DOCUMENT' },
    });
    expect(evidenceResponse.statusCode).toBe(200);
    const evidence = JSON.parse(evidenceResponse.body);

    const supportResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/facts/${fact.id}/support`,
      headers: authHeaders,
      payload: {
        anchorId: document.anchors[0].id,
        evidenceItemId: evidence.id,
        relation: 'SUPPORTS',
        note: 'Trecho que descreve a assinatura.',
      },
    });
    expect(supportResponse.statusCode).toBe(200);
    expect(JSON.parse(supportResponse.body).factSourceLink.documentAnchorId).toBe(document.anchors[0].id);

    const factsResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/facts`,
      headers: authHeaders,
    });
    expect(factsResponse.statusCode).toBe(200);
    expect(JSON.parse(factsResponse.body).items).toHaveLength(1);

    const coverageResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/evidence/coverage`,
      headers: authHeaders,
    });
    expect(coverageResponse.statusCode).toBe(200);
    expect(JSON.parse(coverageResponse.body).items[0]).toMatchObject({
      factId: fact.id,
      coverage: 'SUPPORTED',
      supportingEvidenceCount: 1,
      supportingAnchorCount: 1,
    });

    const timelineResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/timeline`,
      headers: authHeaders,
      payload: {
        title: 'Assinatura do contrato',
        eventDate: '2026-01-15',
        sourceAnchorId: document.anchors[0].id,
      },
    });
    expect(timelineResponse.statusCode).toBe(200);
    const timeline = JSON.parse(timelineResponse.body);
    expect(timeline.sourceAnchorId).toBe(document.anchors[0].id);

    const timelineListResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/timeline`,
      headers: authHeaders,
    });
    expect(JSON.parse(timelineListResponse.body).items[0].eventDate).toBe('2026-01-15');

    const auditLogs = await auditRecorder.getLogsForSession(`fact_${fact.id}`);
    expect(auditLogs.map((log) => log.toolName)).toEqual(['facts.created', 'facts.support.mapped']);
    expect(auditLogs.map((log) => log.payloadHash).join(' ')).not.toContain('O contrato foi assinado');

    const otherTenantResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/facts`,
      headers: { authorization: 'Bearer tenant-b-token' },
    });
    expect(otherTenantResponse.statusCode).toBe(404);
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

  it('POST /api/v2/research/verify-authority deve verificar metadados e faturar a operação', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/research/verify-authority',
      headers: {
        ...authHeaders,
        'idempotency-key': 'test_verify_authority_101',
      },
      payload: {
        court: 'STJ',
        processNumber: 'REsp 1.823.450/SP',
        judgmentDate: '2023-04-18',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-credits-charged']).toBe('0.15');
    expect(JSON.parse(response.body)).toMatchObject({
      status: 'VERIFIED_OFFICIAL',
      authority: { processNumber: 'REsp 1.823.450/SP' },
    });

    const auditLogs = await auditRecorder.getLogsForSession('rest_test_verify_authority_101');
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].toolName).toBe('research.verify_authority');
    expect(auditLogs[0].status).toBe('SUCCESS');
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

  it('MCP deve expor a ferramenta de verificação de autoridade', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: authHeaders,
      payload: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    });

    expect(response.statusCode).toBe(200);
    const tools = JSON.parse(response.body).result.tools;
    expect(tools.some((tool: { name: string }) => tool.name === 'research.verify_authority')).toBe(true);
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
