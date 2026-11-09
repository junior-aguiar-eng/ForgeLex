import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
import {
  createFixtureResearchService,
  createLegalToolGateway,
  createResearchPresentationTools,
  DecisionPresentationService,
  DECISION_UI_URI,
} from '@forgelex/legal-tools';
import { createDatabase } from '@forgelex/persistence';
import type { Client } from '@libsql/client';
import { McpHandler } from './mcp-handler.js';
import { PANEL_SHOWN_NOTICE } from './tool-discovery.js';

const who = { tenantId: 'tenant_painel', userId: 'user_painel' };
const search = (key: string) => ({
  jsonrpc: '2.0' as const,
  id: key,
  method: 'tools/call',
  params: { name: 'research.search_case_law', arguments: { query: 'vazamento de dados', idempotencyKey: key } },
});

describe('a pesquisa abre o painel sem depender de uma segunda chamada do modelo', () => {
  let client: Client;
  let ledger: LedgerService;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    client = connection.client;
    ledger = new LedgerService(connection.db);
    await ledger.bootstrapTables();
    await ledger.provisionAccount(who.tenantId, {
      paidBalanceCents: 6300,
      promotionalBalanceCents: 1500,
      promoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });
  afterEach(() => client.close());

  function build(options: { panel: boolean; ui: boolean; presenter?: 'works' | 'unavailable' }) {
    const registry = new ToolRegistry();
    createLegalToolGateway(createFixtureResearchService()).registerInto(registry);
    if (options.panel && options.presenter === 'works') {
      registry.register({
        name: 'research.present_decisions',
        description: 'painel',
        inputSchema: z.object({ operationId: z.string().optional() }).passthrough(),
        outputSchema: z.object({}).passthrough(),
        impactLevel: 'L0_OBSERVATION',
        timeoutMs: 1000,
        execute: async (input: { operationId?: string }) => ({
          success: true,
          data: {
            kind: 'forgelex.decisions.v1',
            decisions: [],
            operationId: input.operationId,
            canSave: true,
            savedResearchEnabled: true,
          },
        }),
      } as never);
    } else if (options.panel) {
      for (const tool of createResearchPresentationTools(
        new DecisionPresentationService(undefined, async () => undefined),
      ))
        registry.register(tool);
    }
    return new McpHandler(registry, ledger, undefined, {
      ...(options.ui ? { decisionUi: { readHtml: async () => '<p>Reader</p>' } } : {}),
    });
  }

  it('anuncia a interface do painel na própria pesquisa, para Claude e ChatGPT, só quando ela existe', async () => {
    const withUi = await build({ panel: true, ui: true }).handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    const searchTool = withUi.result.tools.find((tool: { name: string }) => tool.name === 'research.search_case_law');
    expect(searchTool._meta.ui.resourceUri).toBe(DECISION_UI_URI);
    expect(searchTool._meta['openai/outputTemplate']).toBe(DECISION_UI_URI);

    const withoutUi = await build({ panel: true, ui: false }).handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(
      withoutUi.result.tools.find((tool: { name: string }) => tool.name === 'research.search_case_law'),
    ).not.toHaveProperty('_meta');
    const withoutPanel = await build({ panel: false, ui: true }).handleRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(
      withoutPanel.result.tools.find((tool: { name: string }) => tool.name === 'research.search_case_law'),
    ).not.toHaveProperty('_meta');
  });

  it('devolve os dados do painel no structuredContent, sem repetir items, e avisa o modelo no texto', async () => {
    const response = await build({ panel: true, ui: true, presenter: 'works' }).handleRequest(search('painel-1'), who);
    const structured = response.result.structuredContent;
    expect(structured).toMatchObject({
      kind: 'forgelex.decisions.v1',
      operationId: 'painel-1',
      canSave: true,
      savedResearchEnabled: true,
    });
    expect(structured).not.toHaveProperty('items');
    expect(structured.total).toBeGreaterThanOrEqual(1);
    const text = JSON.parse(response.result.content[0].text);
    expect(text.data.aviso).toBe(PANEL_SHOWN_NOTICE);
    expect(text.data.items.length).toBeGreaterThanOrEqual(1);
    expect(response.result.billing.mode).toBe('METERED');
  });

  it('se a ferramenta do painel falhar, monta o painel direto do resultado, sem botão de salvar', async () => {
    const response = await build({ panel: true, ui: true, presenter: 'unavailable' }).handleRequest(
      search('painel-2'),
      who,
    );
    const structured = response.result.structuredContent;
    expect(structured).toMatchObject({
      kind: 'forgelex.decisions.v1',
      operationId: 'painel-2',
      canSave: false,
      savedResearchEnabled: false,
    });
    expect(Array.isArray(structured.decisions)).toBe(true);
    expect(structured).not.toHaveProperty('items');
    expect(response.result.isError).not.toBe(true);
  });

  it('sem painel ou sem interface, o resultado segue como antes, sem aviso nem troca do structuredContent', async () => {
    for (const options of [
      { panel: false, ui: false },
      { panel: true, ui: false },
    ]) {
      const response = await build(options).handleRequest(search(`antes-${options.panel}`), who);
      expect(response.result.structuredContent).toHaveProperty('items');
      expect(response.result.structuredContent).not.toHaveProperty('kind');
      expect(JSON.parse(response.result.content[0].text).data).not.toHaveProperty('aviso');
    }
  });
});
