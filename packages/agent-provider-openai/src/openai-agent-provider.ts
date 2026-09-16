import OpenAI from 'openai';
import {
  AgentProvider,
  AgentRunInput,
  AgentEvent,
  PolicyEngine,
  SessionStateMachine,
} from '@forgelex/agent-core';
import { convertZodToOpenAIToolSchema } from './schema-converter.js';

export interface OpenAIProviderOptions {
  apiKey?: string;
  model?: string;
  client?: OpenAI;
  policyEngine?: PolicyEngine;
}

export class OpenAIAgentProvider implements AgentProvider {
  public readonly id = 'openai' as const;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly policyEngine: PolicyEngine;
  private readonly activeSessions = new Map<string, SessionStateMachine>();

  constructor(options: OpenAIProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY ?? 'mock-openai-key';
    this.client = options.client ?? new OpenAI({ apiKey });
    this.model = options.model ?? 'gpt-4o';
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

    // Converte tools do ForgeLex para formato OpenAI Function Calling
    const openAITools: OpenAI.ChatCompletionTool[] = input.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: convertZodToOpenAIToolSchema(tool.inputSchema),
      },
    }));

    const toolsByName = new Map(input.tools.map((t) => [t.name, t]));
    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (input.systemPolicy) {
      messages.push({
        role: 'system',
        content: input.systemPolicy,
      });
    }

    messages.push({
      role: 'user',
      content: input.prompt,
    });

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
          message: 'Sessão cancelada via AbortSignal no provedor OpenAI.',
          timestamp: new Date().toISOString(),
        };
        return;
      }

      turns++;

      let response: OpenAI.ChatCompletion;
      try {
        response = await this.client.chat.completions.create(
          {
            model: this.model,
            messages,
            tools: openAITools.length > 0 ? openAITools : undefined,
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
            message: 'Sessão cancelada durante chamada à OpenAI.',
            timestamp: new Date().toISOString(),
          };
          return;
        }

        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'OPENAI_API_ERROR',
          message: error.message ?? 'Erro desconhecido na API da OpenAI',
          details: { errorName: error.name },
          timestamp: new Date().toISOString(),
        };
        return;
      }

      const choice = response.choices[0];
      if (!choice) {
        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'EMPTY_RESPONSE',
          message: 'Resposta vazia da OpenAI.',
          timestamp: new Date().toISOString(),
        };
        return;
      }

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      // Emite pensamentos se houver conteúdo textual
      if (assistantMessage.content) {
        yield {
          type: 'thought:delta',
          sessionId: input.sessionId,
          delta: assistantMessage.content,
          timestamp: new Date().toISOString(),
        };
      }

      // Se o modelo invocou ferramentas
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const tool = toolsByName.get(toolCall.function.name);
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            parsedArgs = {};
          }

          yield {
            type: 'tool:invoked',
            sessionId: input.sessionId,
            toolName: toolCall.function.name,
            callId: toolCall.id,
            input: parsedArgs,
            timestamp: new Date().toISOString(),
          };

          if (!tool) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Erro: Ferramenta '${toolCall.function.name}' não está autorizada.`,
            });
            continue;
          }

          // Avaliação de política
          const policyCheck = this.policyEngine.evaluateToolCall(tool);
          if (policyCheck.requiresHumanApproval) {
            const approvalToken = stateMachine.suspendForApproval(
              tool.name,
              toolCall.id,
              `Execução da ferramenta mutável ${tool.name}`,
              toolCall.function.arguments
            );

            yield {
              type: 'tool:waiting_approval',
              sessionId: input.sessionId,
              toolName: tool.name,
              callId: toolCall.id,
              approvalToken,
              parametersSummary: toolCall.function.arguments,
              proposedAction: `Execução de ${tool.name}`,
              timestamp: new Date().toISOString(),
            };

            // Suspende a execução aguardando aprovação
            return;
          }

          const toolStart = Date.now();
          try {
            const result = await tool.execute(parsedArgs, {
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
              callId: toolCall.id,
              output: result.data,
              provenance: result.provenance,
              durationMs: Date.now() - toolStart,
              timestamp: new Date().toISOString(),
            };

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result.data),
            });
          } catch (err: any) {
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Erro na execução: ${err.message}`,
            });
          }
        }
      } else {
        // Modelo concluiu a resposta
        stateMachine.complete();
        yield {
          type: 'lifecycle:completed',
          sessionId: input.sessionId,
          output: assistantMessage.content,
          totalTurns: turns,
          totalDurationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
        return;
      }
    }

    yield {
      type: 'error',
      sessionId: input.sessionId,
      code: 'TURN_LIMIT_EXCEEDED',
      message: `Limite de ${maxTurns} turnos atingido no provedor OpenAI.`,
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
