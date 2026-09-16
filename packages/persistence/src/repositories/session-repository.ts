import { eq, desc } from 'drizzle-orm';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { randomUUID } from 'node:crypto';

export class SessionRepository {
  private readonly db: ForgeLexDatabase;

  constructor(db: ForgeLexDatabase) {
    this.db = db;
  }

  public async createSession(data: {
    id?: string;
    tenantId: string;
    userId: string;
    matterId?: string;
    model: string;
    status?: string;
  }) {
    const sessionId = data.id ?? randomUUID();
    const now = new Date().toISOString();

    await this.db.insert(schema.sessions).values({
      id: sessionId,
      tenantId: data.tenantId,
      userId: data.userId,
      matterId: data.matterId,
      model: data.model,
      status: data.status ?? 'STARTING',
      createdAt: now,
      updatedAt: now,
    });

    return (await this.getSession(sessionId))!;
  }

  public async getSession(sessionId: string) {
    const rows = await this.db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
    return rows[0];
  }

  public async updateSessionStatus(sessionId: string, status: string) {
    const now = new Date().toISOString();
    const completedAt = ['COMPLETED', 'CANCELLED', 'FAILED'].includes(status) ? now : null;

    await this.db
      .update(schema.sessions)
      .set({
        status,
        updatedAt: now,
        completedAt,
      })
      .where(eq(schema.sessions.id, sessionId));
  }

  public async addMessage(data: {
    sessionId: string;
    role: string;
    content: string;
    metadata?: Record<string, unknown>;
  }) {
    const messageId = randomUUID();
    const now = new Date().toISOString();

    await this.db.insert(schema.sessionMessages).values({
      id: messageId,
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      createdAt: now,
    });

    return messageId;
  }

  public async getMessages(sessionId: string) {
    return await this.db
      .select()
      .from(schema.sessionMessages)
      .where(eq(schema.sessionMessages.sessionId, sessionId));
  }

  public async createApprovalRequest(data: {
    sessionId: string;
    toolName: string;
    callId: string;
    approvalToken: string;
    proposedAction: string;
    parametersSummary: string;
  }) {
    const approvalId = randomUUID();
    const now = new Date().toISOString();

    await this.db.insert(schema.approvals).values({
      id: approvalId,
      sessionId: data.sessionId,
      toolName: data.toolName,
      callId: data.callId,
      approvalToken: data.approvalToken,
      proposedAction: data.proposedAction,
      parametersSummary: data.parametersSummary,
      status: 'PENDING',
      requestedAt: now,
    });

    return approvalId;
  }

  public async getApprovalByToken(token: string) {
    const rows = await this.db.select().from(schema.approvals).where(eq(schema.approvals.approvalToken, token));
    return rows[0];
  }

  public async resolveApproval(token: string, decision: 'APPROVED' | 'REJECTED', decidedBy: string) {
    const now = new Date().toISOString();

    await this.db
      .update(schema.approvals)
      .set({
        status: decision,
        decidedAt: now,
        decidedBy,
      })
      .where(eq(schema.approvals.approvalToken, token));
  }

  public async saveCheckpoint(sessionId: string, turnNumber: number, stateSnapshot: Record<string, unknown>) {
    const checkpointId = randomUUID();
    const now = new Date().toISOString();

    await this.db.insert(schema.checkpoints).values({
      id: checkpointId,
      sessionId,
      turnNumber,
      stateSnapshot: JSON.stringify(stateSnapshot),
      createdAt: now,
    });

    return checkpointId;
  }

  public async getLatestCheckpoint(sessionId: string) {
    const rows = await this.db
      .select()
      .from(schema.checkpoints)
      .where(eq(schema.checkpoints.sessionId, sessionId))
      .orderBy(desc(schema.checkpoints.turnNumber))
      .limit(1);

    return rows[0];
  }
}
