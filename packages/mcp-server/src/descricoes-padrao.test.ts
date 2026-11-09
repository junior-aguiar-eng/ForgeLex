import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
import {
  createFixtureResearchService,
  createLegalToolGateway,
  createResearchPresentationTools,
  DecisionPresentationService,
} from '@forgelex/legal-tools';
import { McpHandler } from './mcp-handler.js';
import { IDEMPOTENCY_KEY_DESCRIPTION, PRESENT_AFTER_SEARCH_HINT } from './tool-discovery.js';

interface Tool {
  name: string;
  description: string;
  inputSchema: { properties: Record<string, { description?: string }> };
}

async function listTools(withPanel: boolean, clientHints: Record<string, unknown> = {}): Promise<Tool[]> {
  const registry = new ToolRegistry();
  createLegalToolGateway(createFixtureResearchService()).registerInto(registry);
  if (withPanel)
    for (const tool of createResearchPresentationTools(
      new DecisionPresentationService(undefined, async () => undefined),
    ))
      registry.register(tool);
  const handler = new McpHandler(registry, { executeOperation: vi.fn() } as unknown as LedgerService, undefined, {
    ...(withPanel ? { decisionUi: { readHtml: async () => '<p>Reader</p>' } } : {}),
  });
  const response = await handler.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list', ...clientHints });
  return response.result.tools as Tool[];
}

describe('descrições do MCP: um padrão só para Claude, ChatGPT e qualquer cliente', () => {
  it('exige a chave de idempotência na descrição do argumento de toda ferramenta de pesquisa', async () => {
    for (const tool of await listTools(true)) {
      if (
        tool.name.startsWith('research.search') ||
        tool.name === 'research.get_authority' ||
        tool.name === 'research.verify_authority'
      )
        expect(tool.inputSchema.properties.idempotencyKey?.description, tool.name).toBe(IDEMPOTENCY_KEY_DESCRIPTION);
    }
    expect(IDEMPOTENCY_KEY_DESCRIPTION).toContain('Obrigatório');
    expect(IDEMPOTENCY_KEY_DESCRIPTION).toContain('Idempotency-Key');
  });

  it('manda abrir o painel depois da pesquisa quando o painel existe, na pesquisa e no painel', async () => {
    const tools = await listTools(true);
    const search = tools.find((tool) => tool.name === 'research.search_case_law')!;
    const panel = tools.find((tool) => tool.name === 'research.present_decisions')!;
    expect(search.description).toContain(PRESENT_AFTER_SEARCH_HINT);
    expect(panel.description).toContain('operationId');
    expect(panel.description).toContain('research.search_case_law');
  });

  it('não manda abrir um painel que não está exposto', async () => {
    const tools = await listTools(false);
    const search = tools.find((tool) => tool.name === 'research.search_case_law')!;
    expect(search.description).not.toContain('research.present_decisions');
  });

  it('serve o mesmo texto a qualquer cliente: tools/list não depende de quem pergunta', async () => {
    const claude = await listTools(true, { params: { _meta: { client: 'claude' } } });
    const chatgpt = await listTools(true, { params: { _meta: { 'openai/userAgent': 'openai-mcp/1.0.0' } } });
    expect(JSON.stringify(chatgpt)).toBe(JSON.stringify(claude));
  });
});
