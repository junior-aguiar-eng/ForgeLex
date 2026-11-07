import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry, type AgentTool } from '@forgelex/agent-core';
import type { AuditRecorder } from '@forgelex/audit';
import type { LedgerService } from '@forgelex/billing-ledger';
import type { VerifiedOAuthConnection } from '@forgelex/domain';
import { McpHandler } from './mcp-handler.js';

// Cobre o ramo de leitura de contexto do caso do McpHandler com uma ferramenta de teste que usa o nome real
// `case.read_item` (política gratuita). Os caminhos de sucesso, revogação e envelope completo ficam em
// apps/api/src/case-context/case-context-mcp.test.ts, contra o banco real.
const connection = { clientId: 'app', grantedAt: '2026-10-05T10:00:00.000Z' } as unknown as VerifiedOAuthConnection;
const identity = { tenantId: 'tenant-caso', userId: 'user-caso' };

function fixture(options: { output?: unknown; revalidateResult?: AgentTool['revalidateResult'] } = {}) {
  const execute = vi.fn(async () => ({ success: true, data: options.output ?? { itemId: 'i1', text: 'trecho' } }));
  const tool: AgentTool = {
    name: 'case.read_item',
    description: 'Lê um item autorizado do caso.',
    impactLevel: 'L0_OBSERVATION',
    inputSchema: z.object({ matterId: z.string(), itemId: z.string() }).strict(),
    outputSchema: z.unknown(),
    revalidateResult: options.revalidateResult ?? (async () => undefined),
    execute,
  };
  const registry = new ToolRegistry();
  registry.register(tool);
  const recordEvent = vi.fn(async () => 'audit-id');
  const handler = new McpHandler(
    registry,
    { executeOperation: vi.fn() } as unknown as LedgerService,
    { recordEvent } as unknown as AuditRecorder,
  );
  return { handler, execute, recordEvent };
}
const request = (id: unknown, args: unknown = { matterId: 'm1', itemId: 'i1' }) =>
  ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'case.read_item', arguments: args } }) as never;
const authorized = (revalidateConnection: () => Promise<void> = async () => undefined) => ({
  ...identity,
  oauthConnection: connection,
  revalidateConnection,
});

describe('leitura de contexto do caso pelo MCP', () => {
  it('recusa requisição sem identificador válido antes de executar a ferramenta', async () => {
    const f = fixture();
    for (const id of [undefined, null, 'x'.repeat(257), Number.POSITIVE_INFINITY]) {
      const response = await f.handler.handleRequest(request(id), authorized());
      expect(response).toEqual({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Identificador de requisição inválido.' },
      });
    }
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('recusa parâmetros fora do contrato com INVALID_INPUT, sem executar', async () => {
    const f = fixture();
    const response = await f.handler.handleRequest(request(1, { matterId: 'm1' }), authorized());
    expect(response).toMatchObject({
      id: 1,
      error: { code: -32602, data: { code: 'INVALID_INPUT', retryable: false } },
    });
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('sem conexão OAuth verificada devolve falha gratuita e auditada, sem executar', async () => {
    const f = fixture();
    for (const context of [identity, { ...identity, oauthConnection: connection }]) {
      const response = await f.handler.handleRequest(request(2), context);
      expect(response.error).toBeUndefined();
      expect(response.result).toMatchObject({
        isError: true,
        billing: { mode: 'FREE', chargedCents: 0, isReplay: false },
      });
      const failure = JSON.parse(response.result.content[0].text).error;
      expect(failure).toMatchObject({ code: 'CASE_CONTEXT_NOT_AUTHORIZED', retryable: false });
      expect(failure.message).toContain('Usar este caso na IA');
    }
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'case.read_item',
        status: 'FAILED',
        payload: { code: 'CASE_CONTEXT_NOT_AUTHORIZED', readOnly: true },
      }),
    );
  });

  it('leitura autorizada devolve conteúdo gratuito, audita e revalida o resultado', async () => {
    const revalidateResult = vi.fn(async () => undefined);
    const f = fixture({ revalidateResult });
    const response = await f.handler.handleRequest(request(3), authorized());
    expect(response.result).toMatchObject({
      isError: false,
      structuredContent: { itemId: 'i1', text: 'trecho' },
      billing: { mode: 'FREE', chargedCents: 0, isReplay: false },
    });
    expect(revalidateResult).toHaveBeenCalledTimes(1);
    expect(f.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUCCESS', payload: { matterId: 'm1', itemId: 'i1', readOnly: true } }),
    );
  });

  it('resposta acima de 24 KiB vira CASE_ITEM_TOO_LARGE e a revalidação nem chega a rodar', async () => {
    const revalidateResult = vi.fn(async () => undefined);
    const f = fixture({ output: { text: 'a'.repeat(30000) }, revalidateResult });
    const response = await f.handler.handleRequest(request(4), authorized());
    expect(JSON.parse(response.result.content[0].text).error.code).toBe('CASE_ITEM_TOO_LARGE');
    expect(response.result.isError).toBe(true);
    expect(revalidateResult).not.toHaveBeenCalled();
  });

  it('revogação detectada na revalidação do resultado descarta o conteúdo lido', async () => {
    const f = fixture({
      revalidateResult: async () => {
        throw new Error('CASE_CONTEXT_NOT_AUTHORIZED');
      },
    });
    const response = await f.handler.handleRequest(request(5), authorized());
    expect(response.result).not.toHaveProperty('structuredContent');
    expect(JSON.parse(response.result.content[0].text).error.code).toBe('CASE_CONTEXT_NOT_AUTHORIZED');
  });
});
