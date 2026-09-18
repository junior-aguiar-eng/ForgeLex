import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './app.js';
import { FastifyInstance } from 'fastify';
import { AuthAdapter, hashApiKey } from './auth/fastify-auth.js';
import { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import { createDatabase, ForgeLexDatabase } from '@forgelex/persistence';
import { runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuditRecorder } from '@forgelex/audit';
import { CanonicalFixtureProvider, SourceRouter } from '@forgelex/source-providers';
import type { Client } from '@libsql/client';
import { WEBHOOK_EVENT_TYPES } from './distribution/webhooks.js';

const testPrincipal: AuthenticatedPrincipal = {
  subjectId: 'subject_test',
  tenantId: 'tenant_test',
  userId: 'user_test',
  roles: ['lawyer'],
  scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read'],
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

    if (token === 'webhook-suite-token') {
      return webhookSuitePrincipal;
    }

    return null;
  }
}

const authHeaders = { authorization: 'Bearer test-token' };
const webhookSuitePrincipal: AuthenticatedPrincipal = {
  subjectId: 'subject_webhook_suite',
  tenantId: 'tenant_webhook_suite',
  userId: 'user_webhook_suite',
  roles: ['lawyer'],
  scopes: ['research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read'],
  authMethod: 'api_key',
};
const webhookSuiteHeaders = { authorization: 'Bearer webhook-suite-token' };

describe('Fastify API & Remote MCP Edge (apps/api)', () => {
  let app: FastifyInstance;
  let client: Client;
  let database: ForgeLexDatabase;
  let auditRecorder: AuditRecorder;
  let ledgerService: LedgerService;

  beforeAll(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    database = connection.db;
    client = connection.client;
    ledgerService = new LedgerService(connection.db, client);
    await runPersistenceMigrations(client);
    await ledgerService.runMigrations();
    await ledgerService.provisionAccount('tenant_test', {
      paidBalanceCents: 6300,
      promotionalBalanceCents: 1500,
      promoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await ledgerService.provisionAccount('tenant_webhook_suite', {
      paidBalanceCents: 3000,
      promotionalBalanceCents: 0,
    });

    const sourceRouter = new SourceRouter();
    sourceRouter.registerProvider(new CanonicalFixtureProvider());
    auditRecorder = new AuditRecorder(connection.db);

    app = await buildApp({
      authAdapter: new AuthAdapter(new FixtureTokenVerifier()),
      ledgerService,
      database,
      databaseClient: client,
      sourceRouter,
      auditRecorder,
      environment: {
        NODE_ENV: 'test',
        FORGELEX_ALLOWED_ORIGINS: 'http://localhost:3000',
        FORGELEX_WEBHOOK_MASTER_KEY: 'test-webhook-master-key',
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

  it('GET /readyz consulta a persistência e separa processo ativo de dependência indisponível', async () => {
    const readyResponse = await app.inject({ method: 'GET', url: '/readyz' });
    expect(readyResponse.statusCode).toBe(200);
    expect(JSON.parse(readyResponse.body)).toMatchObject({ status: 'ready', checks: { persistence: true, billing: true } });

    const unavailableApp = await buildApp({
      database,
      databaseClient: { execute: async () => { throw new Error('database unavailable'); } } as unknown as Client,
      ledgerService,
      environment: { NODE_ENV: 'test' },
    });
    try {
      const unavailableResponse = await unavailableApp.inject({ method: 'GET', url: '/readyz' });
      expect(unavailableResponse.statusCode).toBe(503);
      expect(JSON.parse(unavailableResponse.body)).toMatchObject({ status: 'not_ready', checks: { persistence: false, billing: false } });
    } finally {
      await unavailableApp.close();
    }
  });

  it('expõe as métricas preservadas em formato compatível com Prometheus', async () => {
    await app.inject({ method: 'GET', url: '/health' });
    const response = await app.inject({ method: 'GET', url: '/metrics/prometheus' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('forgelex_http_requests_total');
    expect(response.body).toContain('forgelex_http_latency_ms_total');
    expect(response.body).toContain('forgelex_webhook_events_queued_total');
    expect(response.body).toContain('forgelex_webhook_deliveries_total');
    expect(response.body).toContain('forgelex_webhook_retries_total');
    expect(response.body).toContain('forgelex_webhook_failures_total');
    expect(response.body).toContain('forgelex_billing_operations_total');
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

  it('GET /openapi.json deve expor o contrato gerado e a paridade REST/MCP', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.openapi).toBe('3.1.0');
    expect(body.paths['/api/v2/research/search-case-law'].post['x-forgelex-tool']).toBe('research.search_case_law');
    expect(body.paths['/api/v2/matters/{matterId}/authorities'].post['x-forgelex-required-scopes']).toEqual(['matter:write']);
    expect(body.paths['/api/v2/matters/{matterId}/research-memos'].post['x-forgelex-required-scopes']).toEqual(['matter:write', 'research:read']);
    expect(body.paths['/mcp'].post['x-forgelex-required-scopes']).toEqual(['mcp']);
    expect(body.paths['/api/v2/auth/bootstrap'].post.security).toEqual([{ BearerAuth: [] }]);
    expect(body.paths['/api/v2/auth/me'].get.security).toEqual([{ BearerAuth: [] }]);
    expect(body.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
  });

  it('POST /api/v2/research/search-case-law usa a mesma capability faturável da superfície MCP', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/research/search-case-law',
      headers: { ...authHeaders, 'idempotency-key': 'rest_canonical_search_001' },
      payload: { query: 'vazamento de dados', limit: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-billable-units']).toBe('1');
    expect(JSON.parse(response.body).total).toBeGreaterThan(0);
  });

  it('deve concluir o primeiro vertical slice comercial com authority salva, billing, auditoria e MCP', async () => {
    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: {
        title: 'Slice comercial de responsabilidade civil',
        practiceArea: 'Cível',
        jurisdiction: 'STJ',
      },
    });
    expect(matterResponse.statusCode).toBe(200);
    const matter = JSON.parse(matterResponse.body);

    const documentResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/documents`,
      headers: authHeaders,
      payload: {
        title: 'Contrato e ocorrência',
        originalFilename: 'contrato.txt',
        mimeType: 'text/plain',
        content: 'O contrato foi celebrado em janeiro.\n\nO incidente de dados ocorreu em março.',
      },
    });
    expect(documentResponse.statusCode).toBe(200);
    const document = JSON.parse(documentResponse.body);
    expect(document.anchors.length).toBeGreaterThan(0);

    const idempotencyKey = 'commercial_slice_search_001';
    const searchResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/research/search-case-law',
      headers: { ...authHeaders, 'idempotency-key': idempotencyKey },
      payload: { query: 'vazamento de dados', court: 'STJ', limit: 5 },
    });
    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.headers['x-credits-charged']).toBe('0.2');
    const search = JSON.parse(searchResponse.body);
    expect(search.results).toHaveLength(1);
    expect(search.results[0].provenance).toMatchObject({
      verified: true,
      verificationMethod: 'OFFICIAL_SOURCE_HASH',
    });

    const saveResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/authorities`,
      headers: authHeaders,
      payload: { authority: search.results[0] },
    });
    expect(saveResponse.statusCode).toBe(201);
    const saved = JSON.parse(saveResponse.body);
    expect(saved).toMatchObject({
      created: true,
      record: {
        tenantId: 'tenant_test',
        matterId: matter.id,
        authority: { id: search.results[0].id, dedupeKey: search.results[0].dedupeKey },
      },
    });

    const authoritiesResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/authorities`,
      headers: authHeaders,
    });
    expect(authoritiesResponse.statusCode).toBe(200);
    expect(JSON.parse(authoritiesResponse.body).items).toHaveLength(1);

    const mcpResponse = await app.inject({
      method: 'POST',
      url: '/mcp',
      headers: authHeaders,
      payload: {
        jsonrpc: '2.0',
        id: 'commercial-slice-mcp',
        method: 'tools/call',
        params: {
          name: 'research.search_case_law',
          arguments: { query: 'vazamento de dados', court: 'STJ', limit: 5 },
        },
      },
    });
    expect(mcpResponse.statusCode).toBe(200);
    const mcpBody = JSON.parse(mcpResponse.body);
    const mcpData = JSON.parse(mcpBody.result.content[0].text);
    expect(mcpData.data.items[0].provenance.source.provider).toBe('provider_canonical_fixtures');

    const usage = await ledgerService.getUsageEvents('tenant_test');
    expect(usage.some((event) => event.requestId === idempotencyKey && event.capability === 'research.search_case_law')).toBe(true);
    expect((await auditRecorder.getLogsForSession(`rest_${idempotencyKey}`))[0]).toMatchObject({
      tenantId: 'tenant_test',
      toolName: 'research.search_case_law',
      status: 'SUCCESS',
    });
    expect((await auditRecorder.getLogsForSession(`matter_${matter.id}`)).some((log) => log.toolName === 'matter.authority.saved')).toBe(true);

    const otherTenantResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/authorities`,
      headers: { authorization: 'Bearer tenant-b-token' },
    });
    expect(otherTenantResponse.statusCode).toBe(404);
  });

  it('API keys persistem somente hashes, retornam o segredo uma vez e autentica a chave criada', async () => {
    const bootstrapToken = 'bootstrap-api-key-token';
    const keyApp = await buildApp({
      environment: {
        NODE_ENV: 'test',
        FORGELEX_API_KEYS: JSON.stringify([{
          tokenHash: hashApiKey(bootstrapToken),
          subjectId: 'subject_key_admin',
          tenantId: 'tenant_key_test',
          userId: 'user_key_admin',
          roles: ['admin'],
          scopes: ['billing:read'],
        }]),
      },
    });

    try {
      const createResponse = await keyApp.inject({
        method: 'POST',
        url: '/api/v2/api-keys',
        headers: { authorization: `Bearer ${bootstrapToken}` },
        payload: { name: 'Integração externa', scopes: ['billing:read'] },
      });
      expect(createResponse.statusCode).toBe(201);
      const created = JSON.parse(createResponse.body).key;
      expect(created.token).toMatch(/^flx_live_/);
      expect(created.tokenHash).toBeUndefined();

      const generatedKeyResponse = await keyApp.inject({
        method: 'GET',
        url: '/api/v2/api-keys',
        headers: { authorization: `Bearer ${created.token}` },
      });
      expect(generatedKeyResponse.statusCode).toBe(200);
      expect(JSON.parse(generatedKeyResponse.body).items.some((item: { id: string }) => item.id === created.id)).toBe(true);

      const revokeResponse = await keyApp.inject({
        method: 'DELETE',
        url: `/api/v2/api-keys/${created.id}`,
        headers: { authorization: `Bearer ${bootstrapToken}` },
      });
      expect(revokeResponse.statusCode).toBe(200);
      expect(JSON.parse(revokeResponse.body).key.revokedAt).toBeTruthy();

      const revokedResponse = await keyApp.inject({
        method: 'GET',
        url: '/api/v2/api-keys',
        headers: { authorization: `Bearer ${created.token}` },
      });
      expect(revokedResponse.statusCode).toBe(401);
    } finally {
      await keyApp.close();
    }
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
    expect(JSON.parse(listResponse.body).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: matter.id, title: 'Ação de responsabilidade civil' })]),
    );

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

  it('emite matter.created automaticamente no outbox do tenant', async () => {
    const endpointResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/endpoints',
      headers: authHeaders,
      payload: { url: 'https://example.test/forgelex', eventTypes: ['matter.created'] },
    });
    expect(endpointResponse.statusCode).toBe(201);
    const endpoint = JSON.parse(endpointResponse.body);
    expect(endpoint.secret).toBeTruthy();
    expect(endpoint).not.toHaveProperty('secretCiphertext');

    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: { title: 'Matter com evento automático' },
    });
    expect(matterResponse.statusCode).toBe(200);

    const deliveriesResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/webhooks/deliveries?endpointId=${endpoint.id}`,
      headers: authHeaders,
    });
    expect(deliveriesResponse.statusCode).toBe(200);
    expect(JSON.parse(deliveriesResponse.body)).toEqual(
      expect.arrayContaining([expect.objectContaining({ endpointId: endpoint.id, status: 'PENDING', attemptCount: 0 })]),
    );
  });

  it('emite os eventos de negócio e billing do fluxo completo no outbox do tenant', async () => {
    const endpointResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/webhooks/endpoints',
      headers: webhookSuiteHeaders,
      payload: { url: 'https://example.test/all-events', eventTypes: [...WEBHOOK_EVENT_TYPES] },
    });
    expect(endpointResponse.statusCode).toBe(201);

    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: webhookSuiteHeaders,
      payload: { title: 'Matter do contrato de eventos' },
    });
    expect(matterResponse.statusCode).toBe(200);
    const matter = JSON.parse(matterResponse.body);

    const documentResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/documents`,
      headers: webhookSuiteHeaders,
      payload: {
        title: 'Documento do contrato de eventos',
        originalFilename: 'eventos.txt',
        mimeType: 'text/plain',
        content: 'O fato jurídico relevante ocorreu em janeiro de 2026.',
      },
    });
    expect(documentResponse.statusCode).toBe(200);

    const draftResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts`,
      headers: webhookSuiteHeaders,
      payload: {
        title: 'Minuta inicial de eventos',
        sections: [{ ordinal: 0, title: 'Síntese', content: 'Conteúdo inicial.' }],
      },
    });
    expect(draftResponse.statusCode).toBe(200);
    const draft = JSON.parse(draftResponse.body);

    const versionResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${draft.draft.id}/versions`,
      headers: webhookSuiteHeaders,
      payload: {
        title: 'Minuta revisada de eventos',
        sections: [{ ordinal: 0, title: 'Síntese', content: 'Conteúdo revisado.' }],
      },
    });
    expect(versionResponse.statusCode).toBe(200);
    const version = JSON.parse(versionResponse.body);

    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${draft.draft.id}/review`,
      headers: webhookSuiteHeaders,
      payload: { type: 'all', versionId: version.version.id },
    });
    expect(reviewResponse.statusCode).toBe(200);

    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${draft.draft.id}/approval`,
      headers: webhookSuiteHeaders,
      payload: { versionId: version.version.id },
    });
    expect(approvalResponse.statusCode).toBe(200);
    const approval = JSON.parse(approvalResponse.body);

    const resolveResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/draft-approvals/resolve',
      headers: webhookSuiteHeaders,
      payload: { token: approval.token, decision: 'APPROVED', reason: 'Fluxo de eventos validado.' },
    });
    expect(resolveResponse.statusCode).toBe(200);

    const searchResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/research/search-case-law',
      headers: { ...webhookSuiteHeaders, 'idempotency-key': 'webhook-suite-search-001' },
      payload: { query: 'LGPD dano moral', court: 'STJ', limit: 5 },
    });
    expect(searchResponse.statusCode).toBe(200);

    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/research/verify-authority',
      headers: { ...webhookSuiteHeaders, 'idempotency-key': 'webhook-suite-verify-001' },
      payload: { court: 'STJ', processNumber: 'REsp 1.823.450/SP', judgmentDate: '2023-04-18' },
    });
    expect(verifyResponse.statusCode).toBe(200);

    const result = await client.execute({
      sql: 'SELECT event_type FROM webhook_events WHERE tenant_id = ? ORDER BY created_at ASC',
      args: [webhookSuitePrincipal.tenantId],
    });
    const eventTypes = result.rows.map((row) => String((row as Record<string, unknown>).event_type));
    expect(eventTypes).toEqual(expect.arrayContaining([
      'matter.created',
      'document.ingested',
      'draft.created',
      'draft.versioned',
      'draft.review.completed',
      'draft.approval.requested',
      'draft.approval.resolved',
      'research.authority.verified',
    ]));
    expect(eventTypes.filter((type) => type === 'billing.usage.recorded')).toHaveLength(2);
    expect(eventTypes.filter((type) => type === 'billing.debit.recorded')).toHaveLength(2);
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

  it('deve versionar, revisar e encaminhar rascunho para aprovação humana', async () => {
    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: { title: 'Matter do Draft Studio' },
    });
    const matter = JSON.parse(matterResponse.body);

    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts`,
      headers: authHeaders,
      payload: {
        title: 'Minuta contratual',
        sections: [{ ordinal: 0, title: 'Síntese dos fatos', content: 'Conteúdo inicial para revisão.' }],
      },
    });
    expect(createResponse.statusCode).toBe(200);
    const created = JSON.parse(createResponse.body);
    expect(created.version.versionNumber).toBe(1);
    expect(created.draft.currentVersionId).toBe(created.version.id);

    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${created.draft.id}/review`,
      headers: authHeaders,
      payload: { type: 'all' },
    });
    expect(reviewResponse.statusCode).toBe(200);
    expect(JSON.parse(reviewResponse.body).status).toBe('WARNINGS');

    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${created.draft.id}/approval`,
      headers: authHeaders,
      payload: { versionId: created.version.id },
    });
    expect(approvalResponse.statusCode).toBe(200);
    const approval = JSON.parse(approvalResponse.body);
    expect(approval.request.status).toBe('PENDING');
    expect(approval.token).toBeTruthy();

    const resolveResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/draft-approvals/resolve',
      headers: authHeaders,
      payload: { token: approval.token, decision: 'APPROVED', reason: 'Revisão humana realizada.' },
    });
    expect(resolveResponse.statusCode).toBe(200);
    expect(JSON.parse(resolveResponse.body).request.status).toBe('APPROVED');

    const otherTenantResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/drafts/${created.draft.id}`,
      headers: { authorization: 'Bearer tenant-b-token' },
    });
    expect(otherTenantResponse.statusCode).toBe(404);
  });

  it('deve executar o segundo vertical slice do matter até o research memo e a revisão humana', async () => {
    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: { title: 'Matter do segundo vertical slice', practiceArea: 'Proteção de dados' },
    });
    const matter = JSON.parse(matterResponse.body);

    const documentResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/documents`,
      headers: authHeaders,
      payload: {
        title: 'Relato do incidente',
        originalFilename: 'incidente.txt',
        content: 'A empresa comunicou o incidente em 15 de janeiro de 2026.\n\nO titular não recebeu informação sobre a extensão do evento.',
      },
    });
    const document = JSON.parse(documentResponse.body);

    const factResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/facts`,
      headers: authHeaders,
      payload: { statement: 'A empresa comunicou o incidente em 15 de janeiro de 2026.', category: 'TEMPORAL' },
    });
    const fact = JSON.parse(factResponse.body);
    const evidenceResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/evidence`,
      headers: authHeaders,
      payload: { title: 'Relato empresarial', evidenceType: 'DOCUMENT' },
    });
    const evidence = JSON.parse(evidenceResponse.body);
    const supportResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/facts/${fact.id}/support`,
      headers: authHeaders,
      payload: { anchorId: document.anchors[0].id, evidenceItemId: evidence.id, relation: 'SUPPORTS' },
    });
    expect(supportResponse.statusCode).toBe(200);

    const issueResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/issues`,
      headers: authHeaders,
      payload: { statement: 'A comunicação tardia do incidente gera consequência indenizável?' },
    });
    expect(issueResponse.statusCode).toBe(201);
    const issue = JSON.parse(issueResponse.body);

    const idempotencyKey = 'second-vertical-slice-memo-1';
    const memoResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/research-memos`,
      headers: { ...authHeaders, 'idempotency-key': idempotencyKey },
      payload: {
        query: 'comunicação de incidente e dano moral',
        issueIds: [issue.id],
        court: 'STJ',
        limit: 5,
      },
    });
    expect(memoResponse.statusCode).toBe(200);
    const generated = JSON.parse(memoResponse.body);
    expect(generated).toMatchObject({
      billed: true,
      idempotentReplay: false,
      record: { matterId: matter.id, status: 'PENDING_HUMAN_REVIEW', issueIds: [issue.id] },
      context: { documentCount: 1, factCount: 1, evidenceCount: 1 },
      research: { total: 1 },
    });
    expect(generated.memo.applicableAuthorities[0].provenance.source.provider).toBe('provider_canonical_fixtures');
    expect(generated.memo.keyTheses.some((thesis: string) => thesis.includes(issue.statement))).toBe(true);

    const replayResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/research-memos`,
      headers: { ...authHeaders, 'idempotency-key': idempotencyKey },
      payload: { query: 'comunicação de incidente e dano moral', issueIds: [issue.id], court: 'STJ', limit: 5 },
    });
    expect(replayResponse.statusCode).toBe(200);
    expect(JSON.parse(replayResponse.body)).toMatchObject({ billed: false, idempotentReplay: true, record: { id: generated.record.id } });

    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/research-memos/${generated.record.id}/review`,
      headers: authHeaders,
      payload: { decision: 'APPROVED', reason: 'Conferência humana concluída.' },
    });
    expect(reviewResponse.statusCode).toBe(200);
    expect(JSON.parse(reviewResponse.body)).toMatchObject({ record: { status: 'APPROVED' }, memo: { verifiedByHuman: true } });

    const usage = await ledgerService.getUsageEvents('tenant_test');
    expect(usage.filter((event) => event.requestId === idempotencyKey && event.capability === 'research.generate_memo')).toHaveLength(1);
    expect((await auditRecorder.getLogsForSession(`memo_${idempotencyKey}`)).map((log) => log.toolName)).toContain('research.memo.generated');

    const otherTenantResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/research-memos`,
      headers: { authorization: 'Bearer tenant-b-token' },
    });
    expect(otherTenantResponse.statusCode).toBe(404);
  });

  it('deve executar o terceiro vertical slice do mapa de teses à aprovação da minuta', async () => {
    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/matters',
      headers: authHeaders,
      payload: { title: 'Matter do terceiro vertical slice', practiceArea: 'Responsabilidade civil' },
    });
    const matter = JSON.parse(matterResponse.body);

    const documentResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/documents`,
      headers: authHeaders,
      payload: {
        title: 'Documento-base da tese',
        originalFilename: 'base.txt',
        content: 'A empresa recebeu a notificação em 10 de fevereiro de 2026.\n\nA resposta foi apresentada fora do prazo contratual.',
      },
    });
    const document = JSON.parse(documentResponse.body);
    const factResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/facts`,
      headers: authHeaders,
      payload: { statement: 'A empresa recebeu a notificação em 10 de fevereiro de 2026.', category: 'TEMPORAL' },
    });
    const fact = JSON.parse(factResponse.body);
    const evidenceResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/evidence`,
      headers: authHeaders,
      payload: { title: 'Notificação recebida', evidenceType: 'DOCUMENT' },
    });
    const evidence = JSON.parse(evidenceResponse.body);
    const supportResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/facts/${fact.id}/support`,
      headers: authHeaders,
      payload: { anchorId: document.anchors[0].id, evidenceItemId: evidence.id, relation: 'SUPPORTS' },
    });
    expect(supportResponse.statusCode).toBe(200);

    const issueResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/issues`,
      headers: authHeaders,
      payload: { statement: 'A resposta fora do prazo contratual gera responsabilidade indenizável?' },
    });
    const issue = JSON.parse(issueResponse.body);

    const searchResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/research/search-case-law',
      headers: { ...authHeaders, 'idempotency-key': 'third-vertical-slice-authority-1' },
      payload: { query: 'vazamento de dados', court: 'STJ', limit: 5 },
    });
    const search = JSON.parse(searchResponse.body);
    const saveAuthorityResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/authorities`,
      headers: authHeaders,
      payload: { authority: search.results[0] },
    });
    const savedAuthority = JSON.parse(saveAuthorityResponse.body).record;

    const thesisResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/theses`,
      headers: authHeaders,
      payload: {
        title: 'Tese de responsabilidade por atraso',
        statement: 'A resposta fora do prazo, comprovada pela notificação e pela authority, sustenta a responsabilização contratual.',
        issueIds: [issue.id],
        factIds: [fact.id],
        evidenceIds: [evidence.id],
        authorityIds: [savedAuthority.id],
      },
    });
    expect(thesisResponse.statusCode).toBe(201);
    const thesis = JSON.parse(thesisResponse.body);

    const mapResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/thesis-map`,
      headers: authHeaders,
    });
    expect(mapResponse.statusCode).toBe(200);
    expect(JSON.parse(mapResponse.body)).toMatchObject({ matterId: matter.id, issues: [expect.objectContaining({ id: issue.id })], theses: [expect.objectContaining({ id: thesis.id })] });

    const firstDraftResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts`,
      headers: authHeaders,
      payload: {
        title: 'Minuta fundamentada',
        sections: [
          {
            ordinal: 0,
            title: 'Síntese dos fatos',
            content: 'A notificação foi recebida e a resposta apresentada fora do prazo.',
            linkedFactIds: [fact.id],
            linkedEvidenceIds: [evidence.id],
            linkedThesisIds: [thesis.id],
          },
          {
            ordinal: 1,
            title: 'Fundamentação jurídica',
            content: 'A tese de responsabilidade será submetida à conferência humana.',
            linkedFactIds: [fact.id],
            linkedEvidenceIds: [evidence.id],
            linkedAuthorityIds: [savedAuthority.id],
            linkedThesisIds: [thesis.id],
          },
        ],
        citations: [{
          sectionOrdinal: 1,
          targetType: 'AUTHORITY',
          targetId: savedAuthority.id,
          citationText: 'Authority judicial salva no matter',
          verified: true,
        }],
      },
    });
    expect(firstDraftResponse.statusCode).toBe(200);
    const firstDraft = JSON.parse(firstDraftResponse.body);
    expect(firstDraft.sections[1].linkedThesisIds).toEqual([thesis.id]);

    const reviewResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${firstDraft.draft.id}/review`,
      headers: authHeaders,
      payload: { type: 'all' },
    });
    expect(reviewResponse.statusCode).toBe(200);
    expect(JSON.parse(reviewResponse.body)).toMatchObject({ status: 'PASSED', blockingCount: 0 });

    const secondVersionResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${firstDraft.draft.id}/versions`,
      headers: authHeaders,
      payload: {
        title: 'Minuta fundamentada revisada',
        sections: [
          {
            ordinal: 0,
            title: 'Síntese dos fatos',
            content: 'A notificação foi recebida e a resposta apresentada fora do prazo contratual.',
            linkedFactIds: [fact.id],
            linkedEvidenceIds: [evidence.id],
            linkedThesisIds: [thesis.id],
          },
          {
            ordinal: 1,
            title: 'Fundamentação jurídica',
            content: 'A tese de responsabilidade permanece condicionada à conferência humana final.',
            linkedFactIds: [fact.id],
            linkedEvidenceIds: [evidence.id],
            linkedAuthorityIds: [savedAuthority.id],
            linkedThesisIds: [thesis.id],
          },
        ],
        citations: [{ sectionOrdinal: 1, targetType: 'AUTHORITY', targetId: savedAuthority.id, citationText: 'Authority judicial conferida', verified: true }],
      },
    });
    expect(secondVersionResponse.statusCode).toBe(200);
    const secondVersion = JSON.parse(secondVersionResponse.body);
    expect(secondVersion.version.versionNumber).toBe(2);

    const secondReviewResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${firstDraft.draft.id}/review`,
      headers: authHeaders,
      payload: { type: 'all', versionId: secondVersion.version.id },
    });
    expect(JSON.parse(secondReviewResponse.body).status).toBe('PASSED');

    const approvalResponse = await app.inject({
      method: 'POST',
      url: `/api/v2/matters/${matter.id}/drafts/${firstDraft.draft.id}/approval`,
      headers: authHeaders,
      payload: { versionId: secondVersion.version.id },
    });
    expect(approvalResponse.statusCode).toBe(200);
    const approval = JSON.parse(approvalResponse.body);
    const resolveResponse = await app.inject({
      method: 'POST',
      url: '/api/v2/draft-approvals/resolve',
      headers: authHeaders,
      payload: { token: approval.token, decision: 'APPROVED', reason: 'Aprovação humana do Slice 3.' },
    });
    expect(resolveResponse.statusCode).toBe(200);
    expect(JSON.parse(resolveResponse.body).request.status).toBe('APPROVED');

    const otherTenantResponse = await app.inject({
      method: 'GET',
      url: `/api/v2/matters/${matter.id}/thesis-map`,
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
    expect(response.headers['x-credit-cost-per-unit']).toBe('0.20');
    expect(response.headers['x-credits-charged']).toBe('0.2');

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
    expect(response.headers['x-credits-charged']).toBe('0.2');
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
    expect(tools.some((tool: { name: string }) => tool.name === 'research.get_authority')).toBe(true);
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
