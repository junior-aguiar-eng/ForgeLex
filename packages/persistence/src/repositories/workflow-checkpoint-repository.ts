import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';

export interface PersistedWorkflowCheckpoint {
  executionId: string; workflowId: string; workflowVersion: string; tenantId: string;
  matterId?: string; stepId: string; stepIndex: number;
  source?: 'REST' | 'MCP' | 'AGENT_CORE' | 'INTERNAL'; idempotencyKey?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'; state: unknown; createdAt: string;
}

export interface PersistentWorkflowCheckpointStoreContract {
  save(checkpoint: PersistedWorkflowCheckpoint): Promise<void>;
  getLatest(executionId: string, tenantId: string): Promise<PersistedWorkflowCheckpoint | undefined>;
}

export class PersistentWorkflowCheckpointStore implements PersistentWorkflowCheckpointStoreContract {
  public constructor(private readonly db: ForgeLexDatabase) {}

  public async save(checkpoint: PersistedWorkflowCheckpoint): Promise<void> {
    await this.db.insert(schema.workflowCheckpoints).values({
      id: randomUUID(), executionId: checkpoint.executionId, tenantId: checkpoint.tenantId,
      matterId: checkpoint.matterId ?? null, workflowId: checkpoint.workflowId,
      workflowVersion: checkpoint.workflowVersion, stepId: checkpoint.stepId,
      source: checkpoint.source ?? 'INTERNAL', idempotencyKey: checkpoint.idempotencyKey ?? null,
      stepIndex: checkpoint.stepIndex, status: checkpoint.status,
      stateJson: JSON.stringify(checkpoint.state), createdAt: checkpoint.createdAt,
    });
  }

  public async getLatest(executionId: string, tenantId: string): Promise<PersistedWorkflowCheckpoint | undefined> {
    const rows = await this.db.select().from(schema.workflowCheckpoints)
      .where(and(eq(schema.workflowCheckpoints.executionId, executionId), eq(schema.workflowCheckpoints.tenantId, tenantId)))
      .orderBy(desc(schema.workflowCheckpoints.createdAt)).limit(1);
    return rows[0] ? this.toCheckpoint(rows[0]) : undefined;
  }

  public async list(executionId: string, tenantId: string): Promise<PersistedWorkflowCheckpoint[]> {
    const rows = await this.db.select().from(schema.workflowCheckpoints)
      .where(and(eq(schema.workflowCheckpoints.executionId, executionId), eq(schema.workflowCheckpoints.tenantId, tenantId)))
      .orderBy(schema.workflowCheckpoints.createdAt);
    return rows.map((row) => this.toCheckpoint(row));
  }

  private toCheckpoint(row: typeof schema.workflowCheckpoints.$inferSelect): PersistedWorkflowCheckpoint {
    return { executionId: row.executionId, workflowId: row.workflowId, workflowVersion: row.workflowVersion,
      source: row.source as PersistedWorkflowCheckpoint['source'], idempotencyKey: row.idempotencyKey ?? undefined,
      tenantId: row.tenantId, matterId: row.matterId ?? undefined, stepId: row.stepId, stepIndex: row.stepIndex,
      status: row.status as PersistedWorkflowCheckpoint['status'], state: JSON.parse(row.stateJson), createdAt: row.createdAt };
  }
}
