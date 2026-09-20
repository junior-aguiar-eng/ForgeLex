import { AgentEvent } from './agent-events.js';
import { AgentTool } from './agent-tools.js';
import type { SessionStateMachine } from '../runtime/session-state-machine.js';

export interface AgentResumeResult {
  resumed: boolean;
  events: AgentEvent[];
}

export interface AgentRunInput {
  sessionId: string;
  tenantId: string;
  userId: string;
  matterId?: string;
  prompt: string;
  systemPolicy?: string;
  tools: AgentTool<any, any>[];
  maxTurns?: number;
  abortSignal: AbortSignal;
}

export interface AgentProvider {
  readonly id: 'anthropic' | 'openai' | 'fake';
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
  cancel(sessionId: string): Promise<void>;
  resume?(sessionId: string, approvalToken: string): Promise<AgentResumeResult>;
  getSessionState?(sessionId: string): SessionStateMachine | undefined;
}
