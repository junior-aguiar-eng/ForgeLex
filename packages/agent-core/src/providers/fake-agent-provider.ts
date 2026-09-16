import { AgentProvider, AgentRunInput } from '../contracts/agent-provider.js';
import { AgentEvent } from '../contracts/agent-events.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { SessionStateMachine } from '../runtime/session-state-machine.js';
import { randomUUID } from 'node:crypto';

export interface FakePlanStep {
  thought: string;
  toolCall?: {
    name: string;
    input: Record<string, unknown>;
  };
}

export class FakeAgentProvider implements AgentProvider {
  public readonly id = 'fake' as const;
  private readonly policyEngine: PolicyEngine;
  private readonly toolRegistry: ToolRegistry;
  private readonly plannedSteps: FakePlanStep[];
  private readonly activeSessions = new Map<string, SessionStateMachine>();

  constructor(
    toolRegistry: ToolRegistry,
    policyEngine: PolicyEngine = new PolicyEngine(),
    plannedSteps: FakePlanStep[] = []
  ) {
    this.toolRegistry = toolRegistry;
    this.policyEngine = policyEngine;
    this.plannedSteps = plannedSteps;
  }

  public async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    const stateMachine = new SessionStateMachine(input.sessionId);
    this.activeSessions.set(input.sessionId, stateMachine);
    stateMachine.start();

    yield {
      type: 'lifecycle:started',
      sessionId: input.sessionId,
      model: 'fake-deterministic-model',
      timestamp: new Date().toISOString(),
    };

    let turns = 0;
    const maxTurns = input.maxTurns ?? 10;

    for (const step of this.plannedSteps) {
      if (input.abortSignal.aborted) {
        stateMachine.cancel();
        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'SESSION_CANCELLED',
          message: 'Sessão cancelada durante a execução determinística.',
          timestamp: new Date().toISOString(),
        };
        return;
      }

      turns++;
      if (turns > maxTurns) {
        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'TURN_LIMIT_EXCEEDED',
          message: `Limite de ${maxTurns} turnos excedido.`,
          timestamp: new Date().toISOString(),
        };
        return;
      }

      // Emite pensamento simulado
      yield {
        type: 'thought:delta',
        sessionId: input.sessionId,
        delta: step.thought,
        timestamp: new Date().toISOString(),
      };

      // Executa chamada de ferramenta se planejada
      if (step.toolCall) {
        const callId = randomUUID();
        const tool = this.toolRegistry.get(step.toolCall.name);

        if (!tool) {
          yield {
            type: 'error',
            sessionId: input.sessionId,
            code: 'UNAUTHORIZED_CAPABILITY',
            message: `Ferramenta '${step.toolCall.name}' não encontrada no registry.`,
            timestamp: new Date().toISOString(),
          };
          return;
        }

        yield {
          type: 'tool:invoked',
          sessionId: input.sessionId,
          toolName: tool.name,
          callId,
          input: step.toolCall.input,
          timestamp: new Date().toISOString(),
        };

        // Avaliação de política
        const policyCheck = this.policyEngine.evaluateToolCall(tool);
        if (policyCheck.requiresHumanApproval) {
          const approvalToken = stateMachine.suspendForApproval(
            tool.name,
            callId,
            `Execução da ferramenta mutável ${tool.name}`,
            JSON.stringify(step.toolCall.input)
          );

          yield {
            type: 'tool:waiting_approval',
            sessionId: input.sessionId,
            toolName: tool.name,
            callId,
            approvalToken,
            parametersSummary: JSON.stringify(step.toolCall.input),
            proposedAction: `Execução da ferramenta ${tool.name}`,
            timestamp: new Date().toISOString(),
          };

          // Em modo fake determinístico sem retomada assíncrona externa,
          // finalizamos a execução no estado de suspensão conforme especificado
          return;
        }

        const start = Date.now();
        try {
          const result = await this.toolRegistry.executeTool(tool.name, step.toolCall.input, {
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
            callId,
            output: result.data,
            provenance: result.provenance,
            durationMs: Date.now() - start,
            timestamp: new Date().toISOString(),
          };
        } catch (error: any) {
          yield {
            type: 'error',
            sessionId: input.sessionId,
            code: error.code ?? 'TOOL_EXECUTION_FAILED',
            message: error.message,
            timestamp: new Date().toISOString(),
          };
          return;
        }
      }
    }

    stateMachine.complete();

    yield {
      type: 'lifecycle:completed',
      sessionId: input.sessionId,
      output: { status: 'SUCCESS', message: 'Execução determinística concluída com êxito.' },
      totalTurns: turns,
      totalDurationMs: 15,
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
