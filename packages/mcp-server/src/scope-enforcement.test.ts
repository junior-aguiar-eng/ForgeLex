import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { createFixtureResearchService, createLegalToolGateway } from '@forgelex/legal-tools';
import { createDatabase, type ForgeLexDatabase } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import type { Client } from '@libsql/client';
import { McpHandler } from './mcp-handler.js';

const call = (name: string) => ({
  jsonrpc: '2.0' as const,
  id: 1,
  method: 'tools/call',
  params: { name, arguments: { query: 'vazamento de dados', court: 'STJ', limit: 1, idempotencyKey: 'k1' } },
});

describe('MCP tool calls without authenticated scopes', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let ledger: LedgerService;
  let registry: ToolRegistry;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
    ledger = new LedgerService(db);
    await ledger.bootstrapTables();
    await ledger.provisionAccount('tenant_scope', { paidBalanceCents: 6300, promotionalBalanceCents: 0 });
    registry = new ToolRegistry();
    createLegalToolGateway(createFixtureResearchService()).registerInto(registry);
  });

  afterEach(() => {
    client.close();
  });

  it('denies a tool call that carries neither scopes nor an auth method', async () => {
    const handler = new McpHandler(registry, ledger);

    const response = await handler.handleRequest(call('research.search_case_law'), {
      tenantId: 'tenant_scope',
      userId: 'u',
      idempotencyKey: 'k1',
    });

    expect(response.error?.data?.code).toBe('INSUFFICIENT_SCOPE');
  });

  it('still answers protocol methods that are not tool calls', async () => {
    const handler = new McpHandler(registry, ledger);

    const response = await handler.handleRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { tenantId: 'tenant_scope', userId: 'u' },
    );

    expect(response.error).toBeUndefined();
  });

  it('keeps the existing behaviour when the handler is explicitly built for trusted unscoped callers', async () => {
    const handler = new McpHandler(registry, ledger, undefined, { trustUnscopedContext: true });

    const response = await handler.handleRequest(call('research.search_case_law'), {
      tenantId: 'tenant_scope',
      userId: 'u',
      idempotencyKey: 'k1',
    });

    expect(response.error?.data?.code).not.toBe('INSUFFICIENT_SCOPE');
  });

  it('still enforces scopes when the caller supplies them, even on a trusting handler', async () => {
    const handler = new McpHandler(registry, ledger, undefined, { trustUnscopedContext: true });

    const response = await handler.handleRequest(call('research.search_case_law'), {
      tenantId: 'tenant_scope',
      userId: 'u',
      idempotencyKey: 'k1',
      scopes: ['mcp'],
      authMethod: 'api_key',
    });

    expect(response.error?.data?.code).toBe('INSUFFICIENT_SCOPE');
  });
});
