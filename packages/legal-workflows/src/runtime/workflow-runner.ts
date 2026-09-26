import { randomUUID } from 'node:crypto';
import {
  WorkflowCheckpoint,
  WorkflowCheckpointSchema,
  WorkflowCheckpointStore,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowStep,
} from '../contracts/workflow.js';

export class InMemoryWorkflowCheckpointStore implements WorkflowCheckpointStore {
  private readonly checkpoints = new Map<string, WorkflowCheckpoint[]>();

  public async save(checkpoint: WorkflowCheckpoint): Promise<void> {
    const parsed = WorkflowCheckpointSchema.parse(checkpoint);
    const current = this.checkpoints.get(parsed.executionId) ?? [];
    current.push(parsed);
    this.checkpoints.set(parsed.executionId, current);
  }

  public async getLatest(executionId: string, tenantId: string): Promise<WorkflowCheckpoint | undefined> {
    const checkpoints = this.checkpoints.get(executionId) ?? [];
    return [...checkpoints].reverse().find((checkpoint) => checkpoint.tenantId === tenantId);
  }

  public list(executionId: string): WorkflowCheckpoint[] {
    return [...(this.checkpoints.get(executionId) ?? [])];
  }
}

export interface VersionedWorkflowRunnerOptions<TInput, TState, TResult> {
  id: string;
  version: string;
  steps: readonly WorkflowStep<TInput, TState>[];
  checkpointStore?: WorkflowCheckpointStore;
  restoreState?: (state: unknown) => TState;
  finalize: (state: TState, context: WorkflowContext) => TResult;
}

export class VersionedWorkflowRunner<TInput, TState, TResult> {
  private readonly options: VersionedWorkflowRunnerOptions<TInput, TState, TResult>;
  private readonly checkpointStore: WorkflowCheckpointStore;

  public constructor(options: VersionedWorkflowRunnerOptions<TInput, TState, TResult>) {
    this.options = options;
    this.checkpointStore = options.checkpointStore ?? new InMemoryWorkflowCheckpointStore();
  }

  public getCheckpointStore(): WorkflowCheckpointStore {
    return this.checkpointStore;
  }

  public getDefinition(): WorkflowDefinition {
    return {
      id: this.options.id,
      version: this.options.version,
      steps: this.options.steps.map((step) => step.id),
    };
  }

  public async *execute(
    input: TInput,
    contextInput: Omit<WorkflowContext, 'executionId'> & { executionId?: string; resumeExecutionId?: string },
    initialState: TState,
  ): AsyncIterable<WorkflowEvent> {
    const executionId = contextInput.executionId ?? contextInput.resumeExecutionId ?? randomUUID();
    const resumedFrom = contextInput.resumeExecutionId;
    const context: WorkflowContext = {
      executionId,
      tenantId: contextInput.tenantId,
      userId: contextInput.userId,
      matterId: contextInput.matterId,
      resumedFrom,
    };
    const checkpoint = resumedFrom
      ? await this.checkpointStore.getLatest(resumedFrom, context.tenantId)
      : undefined;
    let state = checkpoint
      ? (this.options.restoreState ? this.options.restoreState(checkpoint.state) : (checkpoint.state as TState))
      : initialState;
    const startIndex = checkpoint
      ? checkpoint.status === 'FAILED'
        ? checkpoint.stepIndex
        : checkpoint.stepIndex + 1
      : 0;

    yield {
      type: 'workflow:started',
      workflowId: this.options.id,
      workflowVersion: this.options.version,
      executionId,
      resumedFrom,
      timestamp: new Date().toISOString(),
    };

    for (let stepIndex = startIndex; stepIndex < this.options.steps.length; stepIndex++) {
      const step = this.options.steps[stepIndex];
      yield {
        type: 'workflow:step_started',
        workflowId: this.options.id,
        executionId,
        stepId: step.id,
        stepIndex,
        timestamp: new Date().toISOString(),
      };

      try {
        const result = await step.execute(input, state, context);
        state = result.state;
        for (const agentEvent of result.agentEvents ?? []) {
          yield {
            type: 'workflow:agent_event',
            workflowId: this.options.id,
            executionId,
            stepId: step.id,
            event: agentEvent,
            timestamp: new Date().toISOString(),
          };
        }
        await this.checkpointStore.save({
          executionId,
          workflowId: this.options.id,
          workflowVersion: this.options.version,
          tenantId: context.tenantId,
          matterId: context.matterId,
          stepId: step.id,
          stepIndex,
          status: 'RUNNING',
          state,
          createdAt: new Date().toISOString(),
        });
        yield {
          type: 'workflow:checkpointed',
          workflowId: this.options.id,
          executionId,
          stepId: step.id,
          stepIndex,
          timestamp: new Date().toISOString(),
        };
        yield {
          type: 'workflow:step_completed',
          workflowId: this.options.id,
          executionId,
          stepId: step.id,
          stepIndex,
          output: result.output,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha não identificada no workflow.';
        await this.checkpointStore.save({
          executionId,
          workflowId: this.options.id,
          workflowVersion: this.options.version,
          tenantId: context.tenantId,
          matterId: context.matterId,
          stepId: step.id,
          stepIndex,
          status: 'FAILED',
          state,
          createdAt: new Date().toISOString(),
        });
        yield {
          type: 'workflow:failed',
          workflowId: this.options.id,
          workflowVersion: this.options.version,
          executionId,
          stepId: step.id,
          message,
          timestamp: new Date().toISOString(),
        };
        return;
      }
    }

    const result = this.options.finalize(state, context);
    await this.checkpointStore.save({
      executionId,
      workflowId: this.options.id,
      workflowVersion: this.options.version,
      tenantId: context.tenantId,
      matterId: context.matterId,
      stepId: '__completed__',
      stepIndex: Math.max(this.options.steps.length - 1, 0),
      status: 'COMPLETED',
      state,
      createdAt: new Date().toISOString(),
    });
    yield {
      type: 'workflow:completed',
      workflowId: this.options.id,
      workflowVersion: this.options.version,
      executionId,
      result,
      timestamp: new Date().toISOString(),
    };
  }
}
