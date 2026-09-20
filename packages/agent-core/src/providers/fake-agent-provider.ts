import { AgentProvider, AgentResumeResult, AgentRunInput } from '../contracts/agent-provider.js';
import { AgentEvent } from '../contracts/agent-events.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { SessionStateMachine } from '../runtime/session-state-machine.js';
import { randomUUID } from 'node:crypto';

export interface FakePlanStep {
  thought: string;
  providerError?: string;
  toolCall?: {
    name: string;
    input: Record<string, unknown>;
  };
}

interface PendingApproval {
  toolName: string;
  input: Record<string, unknown>;
  context: AgentRunInput;
  callId: string;
  remainingSteps: FakePlanStep[];
  turns: number;
  abortSignal: AbortSignal;
}

export class FakeAgentProvider implements AgentProvider {
  public readonly id = 'fake' as const;
  private readonly policyEngine: PolicyEngine;
  private readonly toolRegistry: ToolRegistry;
  private readonly plannedSteps: FakePlanStep[];
  private readonly activeSessions = new Map<string, SessionStateMachine>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly activeAbortControllers = new Map<string, AbortController>();

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
    const sessionAbortController = new AbortController();
    const forwardAbort = () => sessionAbortController.abort(input.abortSignal.reason);
    if (input.abortSignal.aborted) forwardAbort();
    else input.abortSignal.addEventListener('abort', forwardAbort, { once: true });
    this.activeSessions.set(input.sessionId, stateMachine);
    this.activeAbortControllers.set(input.sessionId, sessionAbortController);
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
      if (sessionAbortController.signal.aborted) {
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
        stateMachine.fail(`Limite de ${maxTurns} turnos excedido.`);
        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'TURN_LIMIT_EXCEEDED',
          message: `Limite de ${maxTurns} turnos excedido.`,
          timestamp: new Date().toISOString(),
        };
        return;
      }

      if (step.providerError) {
        stateMachine.fail('Falha planejada no provider fake.');
        yield {
          type: 'error',
          sessionId: input.sessionId,
          code: 'PROVIDER_ERROR',
          message: 'Falha planejada no provider fake.',
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
          this.pendingApprovals.set(input.sessionId, {
            toolName: tool.name,
            input: step.toolCall.input,
            context: input,
            callId,
            remainingSteps: this.plannedSteps.slice(turns),
            turns,
            abortSignal: sessionAbortController.signal,
          });

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
            abortSignal: sessionAbortController.signal,
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
          if (sessionAbortController.signal.aborted) stateMachine.cancel();
          else stateMachine.fail('Falha na execução de tool do provider fake.');
          yield {
            type: 'error',
            sessionId: input.sessionId,
            code: sessionAbortController.signal.aborted ? 'SESSION_CANCELLED' : error.code ?? 'TOOL_EXECUTION_FAILED',
            message: sessionAbortController.signal.aborted ? 'Sessão cancelada durante a execução determinística.' : error.message,
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
    this.activeAbortControllers.get(sessionId)?.abort();
    this.pendingApprovals.delete(sessionId);
  }

  public async resume(sessionId: string, approvalToken: string): Promise<AgentResumeResult> {
    const session = this.activeSessions.get(sessionId);
    const pending = this.pendingApprovals.get(sessionId);
    if (!session || !pending) {
      return { resumed: false, events: [] };
    }

    session.resumeWithApproval(approvalToken);
    const events: AgentEvent[] = [];
    try {
      const startedAt = Date.now();
      const approvedResult = await this.toolRegistry.executeTool(pending.toolName, pending.input, {
        sessionId: pending.context.sessionId,
        tenantId: pending.context.tenantId,
        userId: pending.context.userId,
        matterId: pending.context.matterId,
        abortSignal: pending.abortSignal,
      });
      events.push({
        type: 'tool:completed', sessionId, toolName: pending.toolName, callId: pending.callId,
        output: approvedResult.data, provenance: approvedResult.provenance,
        durationMs: Date.now() - startedAt, timestamp: new Date().toISOString(),
      });

      let turns = pending.turns;
      for (const step of pending.remainingSteps) {
        turns += 1;
        if (turns > (pending.context.maxTurns ?? 10)) {
          const message = `Limite de ${pending.context.maxTurns ?? 10} turnos excedido.`;
          session.fail(message);
          events.push({ type: 'error', sessionId, code: 'TURN_LIMIT_EXCEEDED', message, timestamp: new Date().toISOString() });
          return { resumed: true, events };
        }
        if (step.providerError) {
          session.fail('Falha planejada no provider fake.');
          events.push({ type: 'error', sessionId, code: 'PROVIDER_ERROR', message: 'Falha planejada no provider fake.', timestamp: new Date().toISOString() });
          return { resumed: true, events };
        }
        events.push({ type: 'thought:delta', sessionId, delta: step.thought, timestamp: new Date().toISOString() });
        if (!step.toolCall) continue;
        const tool = this.toolRegistry.get(step.toolCall.name);
        if (!tool) {
          session.fail(`Ferramenta '${step.toolCall.name}' não encontrada no registry.`);
          events.push({ type: 'error', sessionId, code: 'UNAUTHORIZED_CAPABILITY', message: `Ferramenta '${step.toolCall.name}' não encontrada no registry.`, timestamp: new Date().toISOString() });
          return { resumed: true, events };
        }
        const callId = randomUUID();
        events.push({ type: 'tool:invoked', sessionId, toolName: tool.name, callId, input: step.toolCall.input, timestamp: new Date().toISOString() });
        if (this.policyEngine.evaluateToolCall(tool).requiresHumanApproval) {
          const nextPending: PendingApproval = {
            toolName: tool.name, input: step.toolCall.input, context: pending.context, callId,
            remainingSteps: pending.remainingSteps.slice(pending.remainingSteps.indexOf(step) + 1), turns,
            abortSignal: pending.abortSignal,
          };
          this.pendingApprovals.set(sessionId, nextPending);
          const nextToken = session.suspendForApproval(tool.name, callId, `Execução da ferramenta mutável ${tool.name}`, JSON.stringify(step.toolCall.input));
          events.push({ type: 'tool:waiting_approval', sessionId, toolName: tool.name, callId, approvalToken: nextToken, parametersSummary: JSON.stringify(step.toolCall.input), proposedAction: `Execução da ferramenta ${tool.name}`, timestamp: new Date().toISOString() });
          return { resumed: true, events };
        }
        const result = await this.toolRegistry.executeTool(tool.name, step.toolCall.input, {
          sessionId, tenantId: pending.context.tenantId, userId: pending.context.userId,
          matterId: pending.context.matterId, abortSignal: pending.abortSignal,
        });
        events.push({ type: 'tool:completed', sessionId, toolName: tool.name, callId, output: result.data, provenance: result.provenance, durationMs: 0, timestamp: new Date().toISOString() });
      }
      session.complete();
      events.push({ type: 'lifecycle:completed', sessionId, output: { status: 'SUCCESS', message: 'Execução determinística retomada com êxito.' }, totalTurns: turns, totalDurationMs: 0, timestamp: new Date().toISOString() });
      return { resumed: true, events };
    } catch {
      if (pending.abortSignal.aborted) {
        session.cancel();
        events.push({ type: 'error', sessionId, code: 'SESSION_CANCELLED', message: 'Sessão cancelada durante a retomada.', timestamp: new Date().toISOString() });
      } else {
        session.fail('Falha na retomada da sessão.');
        events.push({ type: 'error', sessionId, code: 'TOOL_EXECUTION_FAILED', message: 'Falha na retomada da sessão.', timestamp: new Date().toISOString() });
      }
      return { resumed: true, events };
    } finally {
      if (session.getStatus() !== 'WAITING_HUMAN_APPROVAL') this.pendingApprovals.delete(sessionId);
    }
  }

  public getSessionState(sessionId: string): SessionStateMachine | undefined {
    return this.activeSessions.get(sessionId);
  }
}
