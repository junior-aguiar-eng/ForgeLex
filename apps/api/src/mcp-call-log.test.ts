import { describe, expect, it } from 'vitest';
import { mcpCallFields } from './mcp-call-log.js';

const base = { idempotencyHeader: false, durationMs: 12, agent: 'Claude-User' };

describe('mcpCallFields', () => {
  it('registra a versão devolvida no initialize', () => {
    expect(
      mcpCallFields({
        ...base,
        body: { jsonrpc: '2.0', id: 1, method: 'initialize' },
        response: { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'forgelex', version: '2.0.0+9e2a30f' } } },
      }),
    ).toEqual({ method: 'initialize', ok: true, serverVersion: '2.0.0+9e2a30f', durationMs: 12, agent: 'Claude-User' });
  });

  it('registra só a quantidade de ferramentas no tools/list', () => {
    expect(
      mcpCallFields({
        ...base,
        body: { method: 'tools/list' },
        response: { result: { tools: [{ name: 'a' }, { name: 'b' }] } },
      }),
    ).toMatchObject({ method: 'tools/list', toolCount: 2, ok: true });
  });

  it('distingue a origem da chave de idempotência sem registrar seu valor nem os argumentos', () => {
    const call = (arguments_: unknown, idempotencyHeader: boolean) =>
      mcpCallFields({
        ...base,
        idempotencyHeader,
        body: { method: 'tools/call', params: { name: 'research.search_case_law', arguments: arguments_ } },
        response: { result: { content: [{ type: 'text', text: 'resultado sigiloso' }] } },
      });
    const noArgument = call({ query: 'improbidade segredo' }, false);
    const byArgument = call({ query: 'improbidade segredo', idempotencyKey: 'chave-secreta-1' }, false);
    const byHeader = call({ query: 'x' }, true);
    expect([noArgument.idempotency, byArgument.idempotency, byHeader.idempotency]).toEqual([
      'none',
      'argument',
      'header',
    ]);
    expect(noArgument).toMatchObject({ tool: 'research.search_case_law', ok: true });
    const text = JSON.stringify([noArgument, byArgument, byHeader]);
    expect(text).not.toContain('segredo');
    expect(text).not.toContain('chave-secreta');
    expect(text).not.toContain('sigiloso');
  });

  it('marca falha em erro JSON-RPC, isError e exceção, e ignora métodos e ferramentas fora do formato', () => {
    expect(
      mcpCallFields({
        ...base,
        body: { method: 'tools/call', params: { name: 'x' } },
        response: { error: { code: -32602, message: 'texto livre' } },
      }),
    ).toMatchObject({ ok: false, rpcErrorCode: -32602, idempotency: 'none' });
    expect(
      mcpCallFields({
        ...base,
        body: { method: 'tools/call', params: { name: 'a.b' } },
        response: { result: { isError: true } },
      }),
    ).toMatchObject({ ok: false });
    expect(mcpCallFields({ ...base, body: { method: 'tools/call' }, threw: true })).toMatchObject({ ok: false });
    const odd = mcpCallFields({
      ...base,
      body: { method: 'Drop Table; --', params: { name: 'Nome Inválido!' } },
    });
    expect(odd).toMatchObject({ method: 'other' });
    expect(odd).not.toHaveProperty('tool');
    expect(mcpCallFields({ ...base, body: null })).toMatchObject({ method: 'other', ok: true });
  });
});
