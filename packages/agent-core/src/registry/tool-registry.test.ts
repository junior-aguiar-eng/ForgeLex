import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from './tool-registry.js';

describe('ToolRegistry', () => {
  it('cancela a execução ao exceder o prazo e distingue timeout de cobrança', async () => {
    const registry = new ToolRegistry();
    let executionSignal: AbortSignal | undefined;
    registry.register({
      name: 'test.timeout', description: 'Tool lenta.', impactLevel: 'L0_OBSERVATION', timeoutMs: 10,
      inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }),
      execute: async (_, context) => {
        executionSignal = context.abortSignal;
        return new Promise((_, reject) => context.abortSignal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
      },
    });
    const caller = new AbortController();
    await expect(registry.executeTool('test.timeout', {}, {
      sessionId: 'timeout', tenantId: 'tenant', userId: 'user', abortSignal: caller.signal,
    })).rejects.toMatchObject({ code: 'TOOL_TIMEOUT' });
    expect(executionSignal?.aborted).toBe(true);
    expect(caller.signal.aborted).toBe(false);
  });

  it('rejeita sinal já cancelado antes de executar a tool', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(async () => ({ success: true, data: { ok: true } }));
    registry.register({
      name: 'test.cancelled', description: 'Tool de teste.', impactLevel: 'L0_OBSERVATION',
      inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }), execute,
    });
    const controller = new AbortController();
    controller.abort();

    await expect(registry.executeTool('test.cancelled', {}, {
      sessionId: 'cancelled', tenantId: 'tenant', userId: 'user', abortSignal: controller.signal,
    })).rejects.toMatchObject({ code: 'SESSION_CANCELLED' });
    expect(execute).not.toHaveBeenCalled();
  });
});
