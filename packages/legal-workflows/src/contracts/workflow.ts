import { z } from 'zod';
import { AgentEvent } from '@forgelex/agent-core';

export const WorkflowCheckpointStatusSchema = z.enum(['RUNNING', 'COMPLETED', 'FAILED']);
export type WorkflowCheckpointStatus = z.infer<typeof WorkflowCheckpointStatusSchema>;

export const WorkflowCheckpointSchema = z.object({
  executionId: z.string().uuid(),
  workflowId: z.string().min(1),
  workflowVersion: z.string().min(1),
  tenantId: z.string().min(1),
  matterId: z.string().optional(),
  stepId: z.string().min(1),
  stepIndex: z.number().int().nonnegative(),
  status: WorkflowCheckpointStatusSchema,
  state: z.unknown(),
  createdAt: z.string().datetime(),
});
export type WorkflowCheckpoint = z.infer<typeof WorkflowCheckpointSchema>;

export interface WorkflowContext {
  executionId: string;
  tenantId: string;
  userId: string;
  matterId?: string;
  resumedFrom?: string;
}

export interface WorkflowStepResult<TState> {
  state: TState;
  output: unknown;
  agentEvents?: AgentEvent[];
}

export interface WorkflowStep<TInput, TState> {
  id: string;
  execute: (input: TInput, state: TState, context: WorkflowContext) => Promise<WorkflowStepResult<TState>>;
}

export interface WorkflowDefinition {
  id: string;
  version: string;
  steps: readonly string[];
}

export interface WorkflowResult<TResult> {
  workflowId: string;
  workflowVersion: string;
  executionId: string;
  status: 'COMPLETED';
  result: TResult;
  generatedAt: string;
}

export type WorkflowEvent =
  | {
      type: 'workflow:started';
      workflowId: string;
      workflowVersion: string;
      executionId: string;
      resumedFrom?: string;
      timestamp: string;
    }
  | {
      type: 'workflow:step_started';
      workflowId: string;
      executionId: string;
      stepId: string;
      stepIndex: number;
      timestamp: string;
    }
  | {
      type: 'workflow:agent_event';
      workflowId: string;
      executionId: string;
      stepId: string;
      event: AgentEvent;
      timestamp: string;
    }
  | {
      type: 'workflow:checkpointed';
      workflowId: string;
      executionId: string;
      stepId: string;
      stepIndex: number;
      timestamp: string;
    }
  | {
      type: 'workflow:step_completed';
      workflowId: string;
      executionId: string;
      stepId: string;
      stepIndex: number;
      output: unknown;
      timestamp: string;
    }
  | {
      type: 'workflow:completed';
      workflowId: string;
      workflowVersion: string;
      executionId: string;
      result: unknown;
      timestamp: string;
    }
  | {
      type: 'workflow:failed';
      workflowId: string;
      workflowVersion: string;
      executionId: string;
      stepId: string;
      message: string;
      timestamp: string;
    };

export interface WorkflowCheckpointStore {
  save(checkpoint: WorkflowCheckpoint): Promise<void>;
  getLatest(executionId: string, tenantId: string): Promise<WorkflowCheckpoint | undefined>;
}
