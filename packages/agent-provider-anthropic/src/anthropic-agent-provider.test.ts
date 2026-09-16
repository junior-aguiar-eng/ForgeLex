import { describe, it, expect, vi } from 'vitest';
import { AnthropicAgentProvider } from './anthropic-agent-provider.js';
import { convertZodToToolJsonSchema } from './schema-converter.js';
import { z } from 'zod';
import { searchCaseLawTool, saveFinalDraftTool } from '@forgelex/legal-tools';
import { AgentEvent } from '@forgelex/agent-core';

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
    // Mock do cliente Anthropic simulando Claude respondendo com uma chamada de ferramenta
    // e na rodada seguinte concluindo a resposta.
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'msg_1',
        content: [
          { type: 'text', text: 'Vou pesquisar a jurisprudência relevante no STJ.' },
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'research.search_case_law',
            input: { query: 'vazamento de dados LGPD' },
          },
        ],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce({
        id: 'msg_2',
        content: [
          {
            type: 'text',
            text: 'Conforme acórdão do STJ localizado, o dano moral não é presumido.',
          },
        ],
        stop_reason: 'end_turn',
      });

    const mockClient: any = {
      messages: {
        create: mockCreate,
      },
    };

    const provider = new AnthropicAgentProvider({
      apiKey: 'test-key',
      client: mockClient,
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
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('deve suspender a sessão e emitir aprovação (Human-in-the-Loop) quando o Claude chamar ferramenta L4', async () => {
    const mockCreate = vi.fn().mockResolvedValueOnce({
      id: 'msg_mutative',
      content: [
        {
          type: 'tool_use',
          id: 'call_save',
          name: 'drafting.save_final_draft',
          input: {
            title: 'Recurso Especial Final',
            content: 'Razões do recurso...',
          },
        },
      ],
      stop_reason: 'tool_use',
    });

    const mockClient: any = {
      messages: {
        create: mockCreate,
      },
    };

    const provider = new AnthropicAgentProvider({
      apiKey: 'test-key',
      client: mockClient,
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
});
