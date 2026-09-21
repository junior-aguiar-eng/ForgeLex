import { describe, expect, it } from 'vitest';
import { createMcpClient, runMcpGate } from './mcp-client.mjs';

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }

describe('cliente MCP remoto', () => {
  it('executa handshake, lista e fluxo com replay debitando apenas 20 centavos', async () => {
    const authority = { id: 'auth_1', court: 'STJ', processNumber: 'REsp 1', provenance: { verified: true, source: { provider: 'remote' } } };
    let searchCalls = 0;
    const requests: Array<{ params?: { name?: string; arguments?: unknown } }> = [];
    const fetcher = async (_url: string, init: RequestInit) => {
      const rpc = JSON.parse(String(init.body));
      requests.push(rpc);
      if (rpc.method === 'initialize') return response({ jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2024-11-05' } });
      if (rpc.method === 'tools/list') return response({ jsonrpc: '2.0', id: rpc.id, result: { tools: ['research.search_case_law', 'research.get_authority', 'research.verify_authority'].map((name) => ({ name, inputSchema: { type: 'object' } })) } });
      const name = rpc.params.name;
      const data = name === 'research.search_case_law' ? { items: [authority], total: 1, queryExecuted: 'x', courtFilter: 'STJ' } : { status: 'VERIFIED_OFFICIAL', checkedAt: '2026-09-20T00:00:00.000Z', authority };
      const replay = (init.headers as Record<string, string>)['idempotency-key'] === 'same-key' && name === 'research.search_case_law' && searchCalls++ > 0;
      return response({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: JSON.stringify({ success: true, data }) }], billing: { chargedCents: replay ? 0 : name === 'research.search_case_law' ? 20 : 0, isReplay: replay } } });
    };
    const result = await runMcpGate(createMcpClient({ baseUrl: 'https://example.test', apiKey: 'key', fetcher }), 'same-key');
    expect(result).toMatchObject({ status: 'passed', chargedCents: 20, authorityId: 'auth_1' });
    expect(requests.find((request) => request.params?.name === 'research.search_case_law')?.params?.arguments).toMatchObject({ query: '1823450', limit: 1 });
  });

  it('rejeita resposta malformada, erro MCP e tribunal não habilitado', async () => {
    const malformed = createMcpClient({ baseUrl: 'https://example.test', apiKey: 'key', fetcher: async () => response({ nope: true }) });
    await expect(malformed.call('initialize')).rejects.toThrow('MCP_RESPONSE_INVALID');
    const unsupported = createMcpClient({ baseUrl: 'https://example.test', apiKey: 'key', fetcher: async () => response({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'não habilitado', data: { code: 'UNSUPPORTED_COURT' } } }) });
    await expect(unsupported.callTool('research.search_case_law', { query: 'x', court: 'STF' }, 'key')).rejects.toThrow('UNSUPPORTED_COURT');
  });
});
