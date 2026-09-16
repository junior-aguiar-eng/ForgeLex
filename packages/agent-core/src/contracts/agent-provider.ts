import { AgentEvent } from './agent-events.js';
import { AgentTool } from './agent-tools.js';

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
}
