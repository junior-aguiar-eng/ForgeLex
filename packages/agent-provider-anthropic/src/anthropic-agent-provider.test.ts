import { describe, it, expect, vi } from 'vitest';
import { AnthropicAgentProvider } from './anthropic-agent-provider.js';
import { convertZodToToolJsonSchema } from './schema-converter.js';
import { z } from 'zod/v3';
import { searchCaseLawTool, saveFinalDraftTool } from '@forgelex/legal-tools';
import { AgentEvent } from '@forgelex/agent-core';

function sdkAssistantMessage(content: unknown[]): any {
  return {
    type: 'assistant',
    message: { content },
    parent_tool_use_id: null,
    uuid: 'sdk-message-uuid',
    session_id: 'sdk-session',
  };
}

function sdkResultMessage(
  overrides: Partial<{ subtype: string; is_error: boolean; result: string; num_turns: number; errors: string[] }> = {}
): any {
  return {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'Resposta final do Claude.',
    num_turns: 1,
    duration_ms: 10,
    errors: [],
    uuid: 'sdk-result-uuid',
    session_id: 'sdk-session',
    ...overrides,
  };
}

describe('AnthropicAgentProvider (Claude)', () => {
  it('deve falhar fechado quando nenhuma credencial é configurada', () => {
    expect(() => new AnthropicAgentProvider({ apiKey: '' })).toThrow('PROVIDER_NOT_CONFIGURED');
  });

  it('deve converter schema Zod em formato JSON Schema aceito pela Anthropic', () => {
    const testSchema = z.object({
      processNumber: z.string().min(5),
      court: z.string().optional(),
    });

    const jsonSchema = convertZodToToolJsonSchema(testSchema);
    expect(jsonSchema.type).toBe('object');
    expect((jsonSchema as any).properties.processNumber).toBeDefined();
    expect((jsonSchema as any).$schema).toBeUndefined(); // $schema deve ser removido
  });

  it('deve executar o loop agêntico do Claude chamando ferramentas e emitindo eventos corretos', async () => {
    const mockQuery = vi.fn((params: any) => {
      const server = params.options.mcpServers.forgelex;
      const registeredTool = server.instance._registeredTools['research.search_case_law'];
      const messages = (async function* () {
        await registeredTool.handler(
          { query: 'vazamento de dados LGPD' },
          { toolUseId: 'call_1' }
        );
        yield sdkAssistantMessage([
          { type: 'text', text: 'Vou pesquisar a jurisprudência relevante no STJ.' },
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'mcp__forgelex__research.search_case_law',
            input: { query: 'vazamento de dados LGPD' },
          },
        ]);
        yield sdkAssistantMessage([
          {
            type: 'text',
            text: 'Conforme acórdão do STJ localizado, o dano moral não é presumido.',
          },
        ]);
        yield sdkResultMessage({
          result: 'Conforme acórdão do STJ localizado, o dano moral não é presumido.',
          num_turns: 2,
        });
      })();
      return Object.assign(messages, { close: vi.fn() });
    });

    const provider = new AnthropicAgentProvider({
      apiKey: 'test-key',
      query: mockQuery,
    });

    const events: AgentEvent[] = [];
    const controller = new AbortController();

    for await (const event of provider.run({
      sessionId: 'sess_claude_test',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prompt: 'Pesquise sobre dano moral na LGPD',
      tools: [searchCaseLawTool],
      abortSignal: controller.signal,
    })) {
      events.push(event);
    }

    // Validação dos eventos emitidos
    expect(events[0].type).toBe('lifecycle:started');
    expect(events.some((e) => e.type === 'thought:delta' && e.delta.includes('Vou pesquisar'))).toBe(true);

    const toolInvoked = events.find((e) => e.type === 'tool:invoked');
    expect(toolInvoked).toBeDefined();
    if (toolInvoked?.type === 'tool:invoked') {
      expect(toolInvoked.toolName).toBe('research.search_case_law');
    }

    const toolCompleted = events.find((e) => e.type === 'tool:completed');
    expect(toolCompleted).toBeDefined();
    if (toolCompleted?.type === 'tool:completed') {
      expect(toolCompleted.provenance).toBeDefined();
      expect(toolCompleted.provenance![0].source.court).toBe('STJ');
    }

    expect(events.some((e) => e.type === 'lifecycle:completed')).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0].options.tools).toEqual([]);
    expect(mockQuery.mock.calls[0][0].options.mcpServers.forgelex).toBeDefined();
  });

  it('deve suspender a sessão e emitir aprovação (Human-in-the-Loop) quando o Claude chamar ferramenta L4', async () => {
    const mockQuery = vi.fn((params: any) => {
      const messages = (async function* () {
        const permission = await params.options.canUseTool(
          'mcp__forgelex__drafting.save_final_draft',
          {
            title: 'Recurso Especial Final',
            content: 'Razões do recurso...',
          },
          {
            toolUseID: 'call_save',
            requestId: 'permission-request-1',
            signal: new AbortController().signal,
          }
        );
        expect(permission.behavior).toBe('deny');
        yield sdkAssistantMessage([
          {
            type: 'tool_use',
            id: 'call_save',
            name: 'mcp__forgelex__drafting.save_final_draft',
            input: {
              title: 'Recurso Especial Final',
              content: 'Razões do recurso...',
            },
          },
        ]);
        yield sdkResultMessage({
          subtype: 'error_during_execution',
          is_error: true,
          errors: ['Aprovação humana necessária.'],
        });
      })();
      return Object.assign(messages, { close: vi.fn() });
    });

    const provider = new AnthropicAgentProvider({
      apiKey: 'test-key',
      query: mockQuery,
    });

    const events: AgentEvent[] = [];
    const controller = new AbortController();

    for await (const event of provider.run({
      sessionId: 'sess_claude_l4_test',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prompt: 'Salve a peça final',
      tools: [saveFinalDraftTool],
      abortSignal: controller.signal,
    })) {
      events.push(event);
    }

    const waitingApproval = events.find((e) => e.type === 'tool:waiting_approval');
    expect(waitingApproval).toBeDefined();
    if (waitingApproval?.type === 'tool:waiting_approval') {
      expect(waitingApproval.toolName).toBe('drafting.save_final_draft');
      expect(waitingApproval.approvalToken).toBeDefined();
    }

    const sessionState = provider.getSessionState('sess_claude_l4_test');
    expect(sessionState?.getStatus()).toBe('WAITING_HUMAN_APPROVAL');
  });

  it('deve encaminhar cancelamento ao Query do Claude e emitir erro de sessão', async () => {
    let markQueryStarted!: () => void;
    const queryStarted = new Promise<void>((resolve) => {
      markQueryStarted = resolve;
    });

    const mockQuery = vi.fn((params: any) => {
      const messages = (async function* () {
        markQueryStarted();
        await new Promise<void>((resolve) => {
          params.options.abortController.signal.addEventListener('abort', resolve, { once: true });
        });
      })();
      return Object.assign(messages, { close: vi.fn() });
    });

    const provider = new AnthropicAgentProvider({
      apiKey: 'test-key',
      query: mockQuery,
    });

    const iterator = provider.run({
      sessionId: 'sess_claude_cancel_test',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prompt: 'Interrompa esta execução',
      tools: [],
      abortSignal: new AbortController().signal,
    })[Symbol.asyncIterator]();

    const started = await iterator.next();
    expect(started.value?.type).toBe('lifecycle:started');

    const pendingResult = iterator.next();
    await queryStarted;
    await provider.cancel('sess_claude_cancel_test');

    const cancelled = await pendingResult;
    expect(cancelled.value?.type).toBe('error');
    if (cancelled.value?.type === 'error') {
      expect(cancelled.value.code).toBe('SESSION_CANCELLED');
    }
  });
});
