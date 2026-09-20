import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentRuntime } from './agent-runtime.js';
import { FakeAgentProvider } from '../providers/fake-agent-provider.js';
import { ToolRegistry } from '../registry/tool-registry.js';

async function collectEvents(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
  const events: unknown[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe('AgentRuntime', () => {
  it('retoma imediatamente a ação aprovada e as etapas restantes sem vazar o erro do provider', async () => {
    const registry = new ToolRegistry();
    const externalExecute = vi.fn(async () => ({ success: true, data: { sent: true } }));
    const followUpExecute = vi.fn(async () => ({ success: true, data: { checked: true } }));
    registry.register({
      name: 'test.external_effect',
      description: 'Tool de efeito externo para o teste de aprovação.',
      impactLevel: 'L4_EXTERNAL_EFFECT',
      inputSchema: z.object({ reference: z.string().min(1) }),
      outputSchema: z.object({ sent: z.boolean() }),
      execute: externalExecute,
    });
    registry.register({
      name: 'test.follow_up',
      description: 'Etapa de observação após a aprovação.',
      impactLevel: 'L1_ANALYSIS',
      inputSchema: z.object({ reference: z.string().min(1) }),
      outputSchema: z.object({ checked: z.boolean() }),
      execute: followUpExecute,
    });
    const provider = new FakeAgentProvider(registry, undefined, [{
      thought: 'A ação exige confirmação humana.',
      toolCall: { name: 'test.external_effect', input: { reference: 'oficio-1' } },
    }, {
      thought: 'Verifico o resultado da ação aprovada.',
      toolCall: { name: 'test.follow_up', input: { reference: 'oficio-1' } },
    }]);
    const runtime = new AgentRuntime({ provider, toolRegistry: registry });
    const sessionId = '11111111-1111-4111-8111-111111111111';

    const iterator = runtime.run({
      sessionId,
      tenantId: 'tenant-1',
      userId: 'user-1',
      prompt: 'Envie o ofício.',
    })[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();
    await iterator.next();
    const waiting = (await iterator.next()).value as any;

    expect(waiting).toMatchObject({ toolName: 'test.external_effect' });
    expect(externalExecute).not.toHaveBeenCalled();
    const resumed = await runtime.resume(sessionId, waiting.approvalToken);
    expect(resumed).toMatchObject({ resumed: true });
    expect(resumed.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'tool:completed', toolName: 'test.external_effect' }),
      expect.objectContaining({ type: 'tool:completed', toolName: 'test.follow_up' }),
      expect.objectContaining({ type: 'lifecycle:completed' }),
    ]));
    expect(externalExecute).toHaveBeenCalledOnce();
    expect(followUpExecute).toHaveBeenCalledOnce();
    expect(runtime.getSessionState(sessionId)?.getStatus()).toBe('COMPLETED');
  });

  it('rejeita retomada quando o provider não implementa continuidade', async () => {
    const registry = new ToolRegistry();
    const runtime = new AgentRuntime({
      toolRegistry: registry,
      provider: {
        id: 'fake',
        async *run() {},
        async cancel() {},
      },
    });

    await expect(runtime.resume('session', 'approval')).rejects.toMatchObject({
      code: 'SESSION_RESUME_UNSUPPORTED',
    });
  });

  it('normaliza falha planejada do provider sem iniciar uma tool', async () => {
    const registry = new ToolRegistry();
    const provider = new FakeAgentProvider(registry, undefined, [{
      thought: 'O provider externo recusou a chamada.',
      providerError: 'provider-secret indisponível',
    }]);
    const runtime = new AgentRuntime({ provider, toolRegistry: registry });

    const events = await collectEvents(runtime.run({
      sessionId: '22222222-2222-4222-8222-222222222222',
      tenantId: 'tenant-1',
      userId: 'user-1',
      prompt: 'Execute uma pesquisa.',
    }));

    expect(events).toContainEqual(expect.objectContaining({
      type: 'error',
      code: 'PROVIDER_ERROR',
      message: 'Falha planejada no provider fake.',
    }));
    expect(JSON.stringify(events)).not.toContain('provider-secret');
    expect(runtime.getSessionState('22222222-2222-4222-8222-222222222222')?.getFailureReason())
      .not.toContain('provider-secret');
  });

  it('propaga cancelamento do runtime para tool determinística em execução', async () => {
    const registry = new ToolRegistry();
    let resolveStarted: () => void;
    const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
    registry.register({
      name: 'test.cancellable', description: 'Tool que aguarda cancelamento.', impactLevel: 'L1_ANALYSIS',
      inputSchema: z.object({}), outputSchema: z.object({ ok: z.boolean() }),
      execute: async (_input, context) => {
        resolveStarted!();
        await new Promise<void>((resolve) => context.abortSignal.addEventListener('abort', () => resolve(), { once: true }));
        return { success: true, data: { ok: true } };
      },
    });
    const provider = new FakeAgentProvider(registry, undefined, [{
      thought: 'Aguardo a tool.', toolCall: { name: 'test.cancellable', input: {} },
    }]);
    const runtime = new AgentRuntime({ provider, toolRegistry: registry });
    const sessionId = '33333333-3333-4333-8333-333333333333';
    const events: unknown[] = [];
    const running = (async () => {
      for await (const event of runtime.run({ sessionId, tenantId: 'tenant-1', userId: 'user-1', prompt: 'Cancele.' })) events.push(event);
    })();

    await started;
    await runtime.cancel(sessionId);
    await running;

    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'SESSION_CANCELLED' }));
    expect(runtime.getSessionState(sessionId)?.getStatus()).toBe('CANCELLED');
  });
});
