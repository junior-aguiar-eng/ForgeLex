import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpHandler } from './mcp-handler.js';
import { ToolRegistry } from '@forgelex/agent-core';
import { searchCaseLawTool, verifyAuthorityTool, createFixtureResearchService, createLegalToolGateway } from '@forgelex/legal-tools';
import { createDatabase, ForgeLexDatabase } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { Client } from '@libsql/client';

describe('McpHandler (Protocolo JSON-RPC 2.0 e Execução Remota)', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let handler: McpHandler;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;

    const ledger = new LedgerService(db);
    await ledger.bootstrapTables();
    await ledger.provisionAccount('tenant_mcp_test', {
      paidBalanceCents: 6300,
      promotionalBalanceCents: 1500,
      promoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const registry = new ToolRegistry();
    createLegalToolGateway(createFixtureResearchService()).registerInto(registry);

    handler = new McpHandler(registry, ledger);
  });

  afterEach(() => {
    client.close();
  });

  it('deve responder ao handshake initialize com metadados do protocolo MCP', async () => {
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    });

    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result.protocolVersion).toBe('2024-11-05');
    expect(response.result.serverInfo.name).toBe('forgelex-mcp-server');
  });

  it('deve listar as ferramentas autorizadas em tools/list com schema JSON', async () => {
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(response.result.tools).toBeDefined();
    expect(response.result.tools.length).toBeGreaterThanOrEqual(1);
    expect(response.result.tools[0].name).toBe('research.search_case_law');
    expect(response.result.tools[0].inputSchema.type).toBe('object');
    expect(response.result.tools[0]['x-forgelex-contract']).toMatchObject({
      contractVersion: '1.0.0',
      requiredScopes: ['research:read'],
      billing: { mode: 'METERED', unit: 'STJ_CASE_LAW_SEARCH', costCents: 20 },
    });
    expect(response.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'research.search_case_law',
      'research.get_authority',
      'research.verify_authority',
    ]);
  });

  it('deve executar tools/call faturando o ledger e devolvendo resultado de jurisprudência', async () => {
    const response = await handler.handleRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'research.search_case_law',
          arguments: { query: 'vazamento de dados' },
        },
      },
      { tenantId: 'tenant_mcp_test', idempotencyKey: 'mcp_call_001' }
    );

    expect(response.result).toBeDefined();
    expect(response.result.content).toBeDefined();
    expect(response.result.content[0].type).toBe('text');
    expect(response.result.billing.mode).toBe('METERED');
    expect(response.result.billing.chargedCents).toBe(20);

    const parsedData = JSON.parse(response.result.content[0].text);
    expect(parsedData.data.items.length).toBeGreaterThan(0);
    expect(parsedData.data.items[0].court).toBe('STJ');
  });

  it('rejeita conversas, arquivos ou histórico do cliente MCP antes da execução', async () => {
    const privateMarker = 'conteudo-privado-do-host';
    const response = await handler.handleRequest(
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'research.search_case_law',
          arguments: {
            query: 'vazamento de dados',
            conversation: privateMarker,
            files: [privateMarker],
            history: [privateMarker],
          },
        },
      },
      { tenantId: 'tenant_mcp_test', idempotencyKey: 'mcp_privacy_001' }
    );

    expect(response.error).toMatchObject({ code: -32602, data: { code: 'PRIVATE_CONTEXT_FORBIDDEN' } });
    expect(JSON.stringify(response)).not.toContain(privateMarker);
  });

  it('deve executar verificação de autoridade no MCP sem débito financeiro', async () => {
    const usageEventsBefore = await new LedgerService(db).getUsageEvents('tenant_mcp_test');
    const response = await handler.handleRequest(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'research.verify_authority',
          arguments: { court: 'STJ', processNumber: 'REsp 1.823.450/SP' },
        },
      },
      { tenantId: 'tenant_mcp_test', idempotencyKey: 'mcp_free_verify_001' },
    );

    expect(response.result.billing).toMatchObject({ mode: 'FREE', chargedCents: 0, isReplay: false });
    expect(await new LedgerService(db).getUsageEvents('tenant_mcp_test')).toHaveLength(usageEventsBefore.length);
  });

  it('deve rejeitar tools/call faturável sem chave de idempotência explícita', async () => {
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'research.search_case_law',
        arguments: { query: 'vazamento de dados' },
      },
    }, { tenantId: 'tenant_mcp_test' });

    expect(response.error?.code).toBe(-32602);
    expect(response.error?.message).toContain('idempotência');
  });

  it('devolve erro estruturado para tribunal não habilitado antes de criar uso financeiro', async () => {
    const before = await new LedgerService(db).getUsageEvents('tenant_mcp_test');
    const response = await handler.handleRequest({
      jsonrpc: '2.0', id: 7, method: 'tools/call',
      params: { name: 'research.search_case_law', arguments: { query: 'vazamento de dados', court: 'STF' } },
    }, { tenantId: 'tenant_mcp_test', idempotencyKey: 'mcp_unsupported_court_001' });

    expect(response.error).toMatchObject({ code: -32000, data: { code: 'UNSUPPORTED_COURT', retryable: false } });
    expect(await new LedgerService(db).getUsageEvents('tenant_mcp_test')).toHaveLength(before.length);
  });

  it('marca indisponibilidade de provider como repetível no erro estruturado', async () => {
    const registry = new ToolRegistry();
    registry.register({
      ...searchCaseLawTool,
      execute: async () => { throw Object.assign(new Error('Provider indisponível.'), { code: 'SOURCE_PROVIDER_UNAVAILABLE' }); },
    });
    const unavailableHandler = new McpHandler(registry, new LedgerService(db));

    const response = await unavailableHandler.handleRequest({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'research.search_case_law', arguments: { query: 'vazamento de dados' } },
    }, { tenantId: 'tenant_mcp_test', idempotencyKey: 'mcp_provider_unavailable_001' });

    expect(response.error).toMatchObject({ data: { code: 'SOURCE_PROVIDER_UNAVAILABLE', retryable: true } });
  });

  it('deve rejeitar métodos inexistentes com código JSON-RPC -32601', async () => {
    const response = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 99,
      method: 'metodo_inexistente',
    });

    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32601);
  });

  it('aceita a chave de idempotência nos argumentos para hosts MCP sem suporte a headers', async () => {
    const response = await handler.handleRequest({
      jsonrpc: '2.0', id: 'host-key', method: 'tools/call',
      params: { name: 'research.search_case_law', arguments: { query: 'vazamento de dados', idempotencyKey: 'mcp-host-key-001' } },
    }, { tenantId: 'tenant_mcp_test' });

    expect(response.result?.billing).toMatchObject({ chargedCents: 20, isReplay: false });
  });

  it('executa a cadeia verificável pesquisa, obtenção e verificação sem modelo ForgeLex', async () => {
    const search = await handler.handleRequest({
      jsonrpc: '2.0', id: 'chain-search', method: 'tools/call',
      params: { name: 'research.search_case_law', arguments: { query: 'vazamento de dados', court: 'STJ' } },
    }, { tenantId: 'tenant_mcp_test', idempotencyKey: 'chain-search-001' });
    const candidate = JSON.parse(search.result.content[0].text).data.items[0];
    const authorityInput = { court: candidate.court, processNumber: candidate.processNumber, judgmentDate: candidate.judgmentDate };
    const get = await handler.handleRequest({
      jsonrpc: '2.0', id: 'chain-get', method: 'tools/call',
      params: { name: 'research.get_authority', arguments: authorityInput },
    }, { tenantId: 'tenant_mcp_test', idempotencyKey: 'chain-get-001' });
    const verify = await handler.handleRequest({
      jsonrpc: '2.0', id: 'chain-verify', method: 'tools/call',
      params: { name: 'research.verify_authority', arguments: authorityInput },
    }, { tenantId: 'tenant_mcp_test', idempotencyKey: 'chain-verify-001' });

    expect(search.result.billing).toMatchObject({ mode: 'METERED', chargedCents: 20 });
    expect(get.result.billing).toMatchObject({ mode: 'FREE', chargedCents: 0 });
    expect(verify.result.billing).toMatchObject({ mode: 'FREE', chargedCents: 0 });
    expect(JSON.parse(verify.result.content[0].text).data.authority.provenance).toBeDefined();
  });

  it('propaga cancelamento do host sem criar uso financeiro', async () => {
    const controller = new AbortController();
    controller.abort();
    const before = await new LedgerService(db).getUsageEvents('tenant_mcp_test');
    const response = await handler.handleRequest({
      jsonrpc: '2.0', id: 12, method: 'tools/call',
      params: { name: 'research.search_case_law', arguments: { query: 'vazamento de dados' } },
    }, { tenantId: 'tenant_mcp_test', idempotencyKey: 'mcp_cancelled_001', abortSignal: controller.signal });

    expect(response.error).toMatchObject({ data: { code: 'SESSION_CANCELLED', retryable: false } });
    expect(await new LedgerService(db).getUsageEvents('tenant_mcp_test')).toHaveLength(before.length);
  });

  it('deve limitar o pacote MCP externo à allowlist declarada', async () => {
    const externalRegistry = new ToolRegistry();
    externalRegistry.register(searchCaseLawTool);
    externalRegistry.register(verifyAuthorityTool);
    const externalHandler = new McpHandler(externalRegistry, new LedgerService(db), undefined, {
      exposedToolNames: ['research.search_case_law'],
    });
    const listed = await externalHandler.handleRequest({ jsonrpc: '2.0', id: 10, method: 'tools/list' });
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual(['research.search_case_law']);

    const hiddenCall = await externalHandler.handleRequest({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'research.verify_authority', arguments: { court: 'STJ', processNumber: 'REsp 1.823.450/SP' } },
    });
    expect(hiddenCall.error?.code).toBe(-32601);
  });
});
