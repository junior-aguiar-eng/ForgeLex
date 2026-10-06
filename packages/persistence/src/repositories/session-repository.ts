import { eq, desc } from 'drizzle-orm';
import { ForgeLexDatabase } from '../db.js';
import * as schema from '../schema/schema.js';
import { randomUUID } from 'node:crypto';
import { isMatterWriteTransaction, withMatterWrite } from './matter-write-guard.js';

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
  }): Promise<typeof schema.sessions.$inferSelect> {
    if (data.matterId && !isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, { tenantId: data.tenantId, matterId: data.matterId }, tx => new SessionRepository(tx).createSession(data));
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

  public async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session?.matterId && !isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, { tenantId: session.tenantId, matterId: session.matterId }, tx => new SessionRepository(tx).updateSessionStatus(sessionId, status));
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
  }): Promise<string> {
    const session = await this.getSession(data.sessionId);
    if (session?.matterId && !isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, { tenantId: session.tenantId, matterId: session.matterId }, tx => new SessionRepository(tx).addMessage(data));
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
  }): Promise<string> {
    const session = await this.getSession(data.sessionId);
    if (session?.matterId && !isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, { tenantId: session.tenantId, matterId: session.matterId }, tx => new SessionRepository(tx).createApprovalRequest(data));
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

  public async resolveApproval(token: string, decision: 'APPROVED' | 'REJECTED', decidedBy: string): Promise<void> {
    const approval = await this.getApprovalByToken(token);
    const session = approval ? await this.getSession(approval.sessionId) : undefined;
    if (session?.matterId && !isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, { tenantId: session.tenantId, matterId: session.matterId }, tx => new SessionRepository(tx).resolveApproval(token, decision, decidedBy));
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

  public async saveCheckpoint(sessionId: string, turnNumber: number, stateSnapshot: Record<string, unknown>): Promise<string> {
    const session = await this.getSession(sessionId);
    if (session?.matterId && !isMatterWriteTransaction(this.db)) return withMatterWrite(this.db, { tenantId: session.tenantId, matterId: session.matterId }, tx => new SessionRepository(tx).saveCheckpoint(sessionId, turnNumber, stateSnapshot));
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
