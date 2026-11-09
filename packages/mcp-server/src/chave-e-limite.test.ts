import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
import {
  createFixtureResearchService,
  createLegalToolGateway,
  createResearchPresentationTools,
  DecisionPresentationService,
  MIN_SEARCH_RESULTS,
} from '@forgelex/legal-tools';
import { createDatabase } from '@forgelex/persistence';
import type { Client } from '@libsql/client';
import { McpHandler } from './mcp-handler.js';

const who = { tenantId: 'tenant_limite', userId: 'user_limite' };

describe('chave de idempotência obrigatória e piso de decisões por chamada', () => {
  let client: Client;
  let handler: McpHandler;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    client = connection.client;
    const ledger = new LedgerService(connection.db);
    await ledger.bootstrapTables();
    await ledger.provisionAccount(who.tenantId, {
      paidBalanceCents: 6300,
      promotionalBalanceCents: 1500,
      promoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const registry = new ToolRegistry();
    createLegalToolGateway(createFixtureResearchService()).registerInto(registry);
    for (const tool of createResearchPresentationTools(
      new DecisionPresentationService(undefined, async () => undefined),
    ))
      registry.register(tool);
    handler = new McpHandler(registry, ledger);
  });
  afterEach(() => client.close());

  it('declara idempotencyKey em required nas ferramentas que a exigem, e só nelas', async () => {
    const response = await handler.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = response.result.tools as { name: string; inputSchema: { required?: string[]; properties: object } }[];
    for (const name of ['research.search_case_law', 'research.get_authority', 'research.verify_authority']) {
      const tool = tools.find((candidate) => candidate.name === name)!;
      expect(tool.inputSchema.required, name).toContain('idempotencyKey');
      expect(tool.inputSchema.properties).toHaveProperty('idempotencyKey');
    }
    const search = tools.find((candidate) => candidate.name === 'research.search_case_law')!;
    expect(search.inputSchema.required).toContain('query');
    for (const tool of tools.filter((candidate) => candidate.name === 'research.present_decisions'))
      expect(tool.inputSchema.required ?? []).not.toContain('idempotencyKey');
  });

  it('continua recusando a chamada sem chave, com a mensagem de sempre', async () => {
    const response = await handler.handleRequest(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'research.search_case_law', arguments: { query: 'vazamento de dados' } },
      },
      who,
    );
    expect(response.error.code).toBe(-32602);
  });

  it('eleva para 5 o pedido de poucas decisões, mantém o padrão de 10 e respeita pedidos maiores', async () => {
    const limitUsed = async (key: string, limit?: number) => {
      const response = await handler.handleRequest(
        {
          jsonrpc: '2.0',
          id: key,
          method: 'tools/call',
          params: {
            name: 'research.search_case_law',
            arguments: { query: 'vazamento de dados', idempotencyKey: key, ...(limit === undefined ? {} : { limit }) },
          },
        },
        who,
      );
      return response.result.structuredContent.criteria?.limit;
    };
    expect(MIN_SEARCH_RESULTS).toBe(5);
    expect(await limitUsed('lim-1', 1)).toBe(5);
    expect(await limitUsed('lim-3', 3)).toBe(5);
    expect(await limitUsed('lim-def')).toBe(10);
    expect(await limitUsed('lim-12', 12)).toBe(12);
  });

  it('descreve no schema que a cobrança é por chamada e que o padrão é 10', async () => {
    const response = await handler.handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    const search = response.result.tools.find((tool: { name: string }) => tool.name === 'research.search_case_law');
    expect(search.inputSchema.properties.limit.description).toContain('por chamada');
  });
});
