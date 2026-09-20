import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from './tool-registry.js';

describe('ToolRegistry', () => {
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
