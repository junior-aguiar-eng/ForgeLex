import { describe, it, expect, vi } from 'vitest';
import { OpenAIAgentProvider } from './openai-agent-provider.js';
import { convertZodToOpenAIToolSchema } from './schema-converter.js';
import { z } from 'zod';
import { searchCaseLawTool, saveFinalDraftTool } from '@forgelex/legal-tools';
import { AgentEvent } from '@forgelex/agent-core';

describe('OpenAIAgentProvider (ChatGPT / GPT-4o)', () => {
  it('deve falhar fechado quando nenhuma credencial é configurada', () => {
    expect(() => new OpenAIAgentProvider({ apiKey: '' })).toThrow('PROVIDER_NOT_CONFIGURED');
  });

  it('deve converter schema Zod para formato Function Calling da OpenAI', () => {
    const testSchema = z.object({
      query: z.string().min(2),
      court: z.string().optional(),
    });

    const jsonSchema = convertZodToOpenAIToolSchema(testSchema);
    expect(jsonSchema.type).toBe('object');
    expect((jsonSchema as any).properties.query).toBeDefined();
    expect((jsonSchema as any).$schema).toBeUndefined();
  });

  it('deve executar o loop do GPT-4o chamando ferramentas e emitindo eventos corretos', async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Vou pesquisar a jurisprudência relevante.',
              tool_calls: [
                {
                  id: 'call_openai_1',
                  type: 'function',
                  function: {
                    name: 'research.search_case_law',
                    arguments: JSON.stringify({ query: 'vazamento de dados LGPD' }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Com base na jurisprudência do STJ, o dano moral depende de comprovação concreta.',
            },
          },
        ],
      });

    const mockClient: any = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    const provider = new OpenAIAgentProvider({
      apiKey: 'test-key',
      client: mockClient,
    });

    const events: AgentEvent[] = [];
    const controller = new AbortController();

    for await (const event of provider.run({
      sessionId: 'sess_openai_test',
      tenantId: 'tenant_1',
      userId: 'user_1',
      prompt: 'Pesquise sobre dano moral na LGPD',
      tools: [searchCaseLawTool],
      abortSignal: controller.signal,
    })) {
      events.push(event);
    }

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

  it('deve suspender a sessão e emitir aprovação (Human-in-the-Loop) quando a OpenAI chamar ferramenta L4', async () => {
    const mockCreate = vi.fn().mockResolvedValueOnce({
      choices: [
        {
          message: {
            role: 'assistant',
            tool_calls: [
              {
                id: 'call_save_openai',
                type: 'function',
                function: {
                  name: 'drafting.save_final_draft',
                  arguments: JSON.stringify({
                    title: 'Contestação Oficial',
                    content: 'Razões de direito...',
                  }),
                },
              },
            ],
          },
        },
      ],
    });

    const mockClient: any = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };

    const provider = new OpenAIAgentProvider({
      apiKey: 'test-key',
      client: mockClient,
    });

    const events: AgentEvent[] = [];
    const controller = new AbortController();

    for await (const event of provider.run({
      sessionId: 'sess_openai_l4_test',
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

    const sessionState = provider.getSessionState('sess_openai_l4_test');
    expect(sessionState?.getStatus()).toBe('WAITING_HUMAN_APPROVAL');
  });
});
