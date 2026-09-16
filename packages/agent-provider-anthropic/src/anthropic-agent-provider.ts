import Anthropic from '@anthropic-ai/sdk';
import {
  AgentProvider,
  AgentRunInput,
  AgentEvent,
  PolicyEngine,
  SessionStateMachine,
} from '@forgelex/agent-core';
import { convertZodToToolJsonSchema } from './schema-converter.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  model?: string;
  client?: Anthropic;
  policyEngine?: PolicyEngine;
}

export class AnthropicAgentProvider implements AgentProvider {
  public readonly id = 'anthropic' as const;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly policyEngine: PolicyEngine;
  private readonly activeSessions = new Map<string, SessionStateMachine>();

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? 'mock-anthropic-key';
    this.client = options.client ?? new Anthropic({ apiKey });
    this.model = options.model ?? 'claude-3-5-sonnet-20241022';
    this.policyEngine = options.policyEngine ?? new PolicyEngine();
  }

  public async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    const stateMachine = new SessionStateMachine(input.sessionId);
    this.activeSessions.set(input.sessionId, stateMachine);
    stateMachine.start();

    yield {
      type: 'lifecycle:started',
      sessionId: input.sessionId,
      model: this.model,
      timestamp: new Date().toISOString(),
    };

    // Mapeia tools do ForgeLex para o formato Anthropic
    const anthropicTools: Anthropic.Tool[] = input.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: convertZodToToolJsonSchema(tool.inputSchema) as Anthropic.Tool.InputSchema,
    }));

    const toolsByName = new Map(input.tools.map((t) => [t.name, t]));
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: input.prompt,
      },
    ];

    let turns = 0;
    const maxTurns = input.maxTurns ?? 10;
    const startTime = Date.now();

    while (turns < maxTurns) {
      if (input.abortSignal.aborted) {
        stateMachine.cancel();
        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'SESSION_CANCELLED',
          message: 'Sessão cancelada via AbortSignal no provedor Anthropic.',
          timestamp: new Date().toISOString(),
        };
        return;
      }

      turns++;

      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: 4096,
            system: input.systemPolicy,
            messages,
            tools: anthropicTools.length > 0 ? anthropicTools : undefined,
          },
          { signal: input.abortSignal }
        );
      } catch (error: any) {
        if (input.abortSignal.aborted) {
          stateMachine.cancel();
          yield {
            type: 'error',
            sessionId: input.sessionId,
            code: 'SESSION_CANCELLED',
            message: 'Sessão cancelada durante chamada à Anthropic.',
            timestamp: new Date().toISOString(),
          };
          return;
        }

        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'ANTHROPIC_API_ERROR',
          message: error.message ?? 'Erro desconhecido na API da Anthropic',
          details: { errorName: error.name },
          timestamp: new Date().toISOString(),
        };
        return;
      }

      // Adiciona a resposta do assistente ao histórico da conversa
      messages.push({
        role: 'assistant',
        content: response.content,
      });

      const toolResultsContent: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          yield {
            type: 'thought:delta',
            sessionId: input.sessionId,
            delta: block.text,
            timestamp: new Date().toISOString(),
          };
        } else if (block.type === 'tool_use') {
          const tool = toolsByName.get(block.name);

          yield {
            type: 'tool:invoked',
            sessionId: input.sessionId,
            toolName: block.name,
            callId: block.id,
            input: block.input as Record<string, unknown>,
            timestamp: new Date().toISOString(),
          };

          if (!tool) {
            toolResultsContent.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Erro: Ferramenta '${block.name}' não está autorizada.`,
              is_error: true,
            });
            continue;
          }

          // Avaliação de política
          const policyCheck = this.policyEngine.evaluateToolCall(tool);
          if (policyCheck.requiresHumanApproval) {
            const approvalToken = stateMachine.suspendForApproval(
              tool.name,
              block.id,
              `Execução da ferramenta mutável ${tool.name}`,
              JSON.stringify(block.input)
            );

            yield {
              type: 'tool:waiting_approval',
              sessionId: input.sessionId,
              toolName: tool.name,
              callId: block.id,
              approvalToken,
              parametersSummary: JSON.stringify(block.input),
              proposedAction: `Execução de ${tool.name}`,
              timestamp: new Date().toISOString(),
            };

            // Suspende o loop aguardando autorização externa
            return;
          }

          const toolStart = Date.now();
          try {
            const result = await tool.execute(block.input, {
              sessionId: input.sessionId,
              tenantId: input.tenantId,
              userId: input.userId,
              matterId: input.matterId,
              abortSignal: input.abortSignal,
            });

            yield {
              type: 'tool:completed',
              sessionId: input.sessionId,
              toolName: tool.name,
              callId: block.id,
              output: result.data,
              provenance: result.provenance,
              durationMs: Date.now() - toolStart,
              timestamp: new Date().toISOString(),
            };

            toolResultsContent.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result.data),
            });
          } catch (err: any) {
            toolResultsContent.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Erro na execução: ${err.message}`,
              is_error: true,
            });
          }
        }
      }

      // Se ferramentas foram chamadas nesta rodada, alimentamos os resultados de volta para o Claude
      if (toolResultsContent.length > 0) {
        messages.push({
          role: 'user',
          content: toolResultsContent,
        });
      } else if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') {
        // Modelo concluiu a resposta final
        stateMachine.complete();
        yield {
          type: 'lifecycle:completed',
          sessionId: input.sessionId,
          output: response.content,
          totalTurns: turns,
          totalDurationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
        return;
      }
    }

    // Se chegou aqui, estourou turnos
    yield {
      type: 'error',
      sessionId: input.sessionId,
      code: 'TURN_LIMIT_EXCEEDED',
      message: `Limite de ${maxTurns} turnos atingido no provedor Anthropic.`,
      timestamp: new Date().toISOString(),
    };
  }

  public async cancel(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.cancel();
    }
  }

  public getSessionState(sessionId: string): SessionStateMachine | undefined {
    return this.activeSessions.get(sessionId);
  }
}
