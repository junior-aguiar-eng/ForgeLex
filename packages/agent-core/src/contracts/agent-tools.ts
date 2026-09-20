import { z } from 'zod';
import { ImpactLevel, ProvenanceMetadata } from '@forgelex/domain';

export interface ToolExecutionContext {
  sessionId: string;
  tenantId: string;
  userId: string;
  matterId?: string;
  abortSignal: AbortSignal;
  source?: 'REST' | 'MCP' | 'AGENT_CORE';
}

export interface ToolExecutionResult<TOutput = unknown> {
  success: boolean;
  data: TOutput;
  provenance?: ProvenanceMetadata[];
  error?: string;
}

export interface AgentTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  impactLevel: ImpactLevel;
  inputSchema: z.ZodType<TInput, any, any>;
  outputSchema: z.ZodType<TOutput, any, any>;
  timeoutMs?: number;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<ToolExecutionResult<TOutput>>;
}
