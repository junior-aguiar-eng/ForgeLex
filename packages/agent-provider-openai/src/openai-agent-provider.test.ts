import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod/v3';
import { AgentEvent } from '@forgelex/agent-core';
import { searchCaseLawTool, saveFinalDraftTool } from '@forgelex/legal-tools';
import { OpenAIAgentProvider } from './openai-agent-provider.js';
import { convertZodToOpenAIToolSchema } from './schema-converter.js';

interface FakeStream {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
  finalOutput?: unknown;
  interruptions?: unknown[];
  currentTurn?: number;
  completed: Promise<void>;
}

function fakeStream(
  events: unknown[],
  options: { finalOutput?: unknown; interruptions?: unknown[]; currentTurn?: number } = {}
): FakeStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    ...options,
    completed: Promise.resolve(),
  };
}

function runItem(name: string, item: Record<string, unknown>): unknown {
  return {
    type: 'run_item_stream_event',
    name,
    item,
  };
}

describe('OpenAIAgentProvider (OpenAI Agents SDK)', () => {
  it('deve falhar fechado quando nenhuma credencial é configurada', () => {
    expect(() => new OpenAIAgentProvider({ apiKey: '' })).toThrow('PROVIDER_NOT_CONFIGURED');
  });

  it('deve converter schema Zod para JSON Schema aceito pelo runtime', () => {
    const testSchema = z.object({
      query: z.string().min(2),
      court: z.string().optional(),
    });

    const jsonSchema = convertZodToOpenAIToolSchema(testSchema);
    expect(jsonSchema.type).toBe('object');
    expect((jsonSchema as any).properties.query).toBeDefined();
    expect((jsonSchema as any).$schema).toBeUndefined();
  });

  it('deve executar ferramentas pelo loop do OpenAI Agents SDK e emitir eventos ForgeLex', async () => {
    const run = vi.fn(async (agent: any, _prompt: string, options: any): Promise<FakeStream> => {
      const sdkTool = agent.tools[0];
      const callId = 'call_openai_1';
      const toolInput = { query: 'vazamento de dados LGPD' };

      await sdkTool.invoke(
        { context: options.context },
        JSON.stringify(toolInput),
        { toolCall: { callId } }
      );

      return fakeStream(
        [
          runItem('tool_called', {
            type: 'tool_call_item',
            rawItem: {
              type: 'function_call',
              name: sdkTool.name,
              callId,
              arguments: JSON.stringify(toolInput),
            },
          }),
          runItem('message_output_created', {
            type: 'message_output_item',
            content: 'Com base na jurisprudência do STJ, o dano moral depende de comprovação concreta.',
          }),
        ],
        { finalOutput: 'Com base na jurisprudência do STJ, o dano moral depende de comprovação concreta.', currentTurn: 2 }
      );
    });

    const provider = new OpenAIAgentProvider({ apiKey: 'test-key', run });
    const events: AgentEvent[] = [];

    for await (const event of provider.run({
      sessionId: 'sess_openai_test',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prompt: 'Pesquise sobre dano moral na LGPD',
      tools: [searchCaseLawTool],
      abortSignal: new AbortController().signal,
    })) {
      events.push(event);
    }

    expect(events[0].type).toBe('lifecycle:started');
    expect(events.some((event) => event.type === 'thought:delta' && event.delta.includes('STJ'))).toBe(true);

    const toolInvoked = events.find((event) => event.type === 'tool:invoked');
    expect(toolInvoked).toMatchObject({
      type: 'tool:invoked',
      toolName: 'research.search_case_law',
      callId: 'call_openai_1',
    });

    const toolCompleted = events.find((event) => event.type === 'tool:completed');
    expect(toolCompleted).toMatchObject({
      type: 'tool:completed',
      toolName: 'research.search_case_law',
    });
    if (toolCompleted?.type === 'tool:completed') {
      expect(toolCompleted.provenance?.[0].source.court).toBe('STJ');
    }

    expect(events.some((event) => event.type === 'lifecycle:completed')).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it('deve suspender a sessão para aprovação humana em ferramenta L4', async () => {
    const run = vi.fn(async (agent: any, _prompt: string, options: any): Promise<FakeStream> => {
      const sdkTool = agent.tools[0];
      const callId = 'call_save_openai';
      const toolInput = {
        title: 'Contestação Oficial',
        content: 'Razões de direito...',
      };
      const approvalRequired = await sdkTool.needsApproval(
        { context: options.context },
        toolInput,
        callId
      );

      expect(approvalRequired).toBe(true);

      const approvalItem = {
        type: 'tool_approval_item',
        rawItem: {
          type: 'function_call',
          name: sdkTool.name,
          callId,
          arguments: JSON.stringify(toolInput),
        },
      };

      return fakeStream([runItem('tool_approval_requested', approvalItem)], {
        interruptions: [approvalItem],
        currentTurn: 1,
      });
    });

    const provider = new OpenAIAgentProvider({ apiKey: 'test-key', run });
    const events: AgentEvent[] = [];

    for await (const event of provider.run({
      sessionId: 'sess_openai_l4_test',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prompt: 'Salve a peça final',
      tools: [saveFinalDraftTool],
      abortSignal: new AbortController().signal,
    })) {
      events.push(event);
    }

    const waitingApproval = events.find((event) => event.type === 'tool:waiting_approval');
    expect(waitingApproval).toMatchObject({
      type: 'tool:waiting_approval',
      toolName: 'drafting.save_final_draft',
      callId: 'call_save_openai',
    });
    expect(provider.getSessionState('sess_openai_l4_test')?.getStatus()).toBe('WAITING_HUMAN_APPROVAL');
  });

  it('deve propagar cancelamento ao runtime por AbortSignal', async () => {
    const run = vi.fn(async (_agent: any, _prompt: string, options: any): Promise<FakeStream> =>
      fakeStream(
        [
          new Promise<void>((resolve) => {
            options.signal.addEventListener('abort', () => resolve(), { once: true });
          }),
        ],
        { currentTurn: 1 }
      )
    );

    const provider = new OpenAIAgentProvider({ apiKey: 'test-key', run });
    const events: AgentEvent[] = [];
    const consuming = (async () => {
      for await (const event of provider.run({
        sessionId: 'sess_openai_cancel_test',
        tenantId: 'tenant_1',
        userId: 'user_1',
        prompt: 'Cancelar',
        tools: [],
        abortSignal: new AbortController().signal,
      })) {
        events.push(event);
      }
    })();

    await new Promise((resolve) => setTimeout(resolve, 0));
    await provider.cancel('sess_openai_cancel_test');
    await consuming;

    expect(events.some((event) => event.type === 'error' && event.code === 'SESSION_CANCELLED')).toBe(true);
    expect(provider.getSessionState('sess_openai_cancel_test')?.getStatus()).toBe('CANCELLED');
  });
});
