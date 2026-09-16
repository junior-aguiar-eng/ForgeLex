import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { McpHandler } from './mcp-handler.js';
import { ToolRegistry } from '@forgelex/agent-core';
import { searchCaseLawTool } from '@forgelex/legal-tools';
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

    const registry = new ToolRegistry();
    registry.register(searchCaseLawTool);

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
    expect(response.result.billing.chargedCents).toBe(15);

    const parsedData = JSON.parse(response.result.content[0].text);
    expect(parsedData.data.items.length).toBeGreaterThan(0);
    expect(parsedData.data.items[0].court).toBe('STJ');
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
});
