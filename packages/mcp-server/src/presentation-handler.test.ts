import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
import { createResearchPresentationTools, DecisionPresentationService, DECISION_UI_URI } from '@forgelex/legal-tools';
import { McpHandler } from './mcp-handler.js';
import { randomUUID } from 'node:crypto';
describe('MCP presentation transport', () => {
  it('serves a sandbox resource and structured free reader results without entering the ledger', async () => {
    const registry = new ToolRegistry();
    for (const tool of createResearchPresentationTools(
      new DecisionPresentationService(undefined, async () => undefined),
    ))
      registry.register(tool);
    const executeOperation = vi.fn();
    const handler = new McpHandler(registry, { executeOperation } as unknown as LedgerService, undefined, {
      decisionUi: { readHtml: async () => '<!doctype html><p>Reader</p>' },
    });
    const list = await handler.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(list.result.tools[0]._meta.ui.resourceUri).toBe(DECISION_UI_URI);
    expect(list.result.tools[0].inputSchema.properties).not.toHaveProperty('idempotencyKey');
    const resource = await handler.handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/read',
      params: { uri: DECISION_UI_URI },
    });
    expect(resource.result.contents[0].mimeType).toBe('text/html;profile=mcp-app');
    expect(resource.result.contents[0]._meta.ui.csp.connectDomains).toEqual([]);
    const result = await handler.handleRequest(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'research.present_decisions',
          arguments: { items: [{ recordId: randomUUID(), versionId: randomUUID() }] },
        },
      },
      { tenantId: 't', userId: 'u' },
    );
    expect(result.result.structuredContent.decisions[0].availability).toBe('UNAVAILABLE');
    expect(result.result.billing.chargedCents).toBe(0);
    expect(executeOperation).not.toHaveBeenCalled();
  });
});
