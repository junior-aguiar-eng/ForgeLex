import { createHash, randomUUID } from 'node:crypto';
import { ForgeLexDatabase, auditLogs } from '@forgelex/persistence';
import { eq } from 'drizzle-orm';

export interface AuditEventData {
  sessionId: string;
  tenantId: string;
  userId: string;
  toolName?: string;
  durationMs: number;
  status: 'SUCCESS' | 'FAILED' | 'SUSPENDED_APPROVAL' | 'CANCELLED';
  payload?: unknown;
}

export class AuditRecorder {
  private readonly db: ForgeLexDatabase;

  constructor(db: ForgeLexDatabase) {
    this.db = db;
  }

  /**
   * Calcula o hash criptográfico SHA-256 do payload sanitizado.
   * Garante a integridade probatória sem expor conteúdo confidencial nos logs.
   */
  public computePayloadHash(payload: unknown): string {
    if (!payload) {
      return 'empty_payload_hash';
    }

    const sanitized = this.redactSensitiveFields(payload);
    const jsonStr = JSON.stringify(sanitized);
    return createHash('sha256').update(jsonStr).digest('hex');
  }

  /**
   * Remove recursivamente segredos conhecidos (API keys, senhas, tokens).
   */
  public redactSensitiveFields(obj: unknown): unknown {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactSensitiveFields(item));
    }

    const result: Record<string, unknown> = {};
    const sensitiveKeys = ['apikey', 'api_key', 'token', 'secret', 'password', 'authorization'];

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
        result[key] = '[REDACTED_SECRET]';
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactSensitiveFields(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  public async recordEvent(event: AuditEventData): Promise<string> {
    const auditId = randomUUID();
    const payloadHash = this.computePayloadHash(event.payload);
    const now = new Date().toISOString();

    await this.db.insert(auditLogs).values({
      id: auditId,
      sessionId: event.sessionId,
      tenantId: event.tenantId,
      userId: event.userId,
      toolName: event.toolName,
      durationMs: event.durationMs,
      status: event.status,
      payloadHash,
      costMetadata: null,
      createdAt: now,
    });

    return auditId;
  }

  public async getLogsForSession(sessionId: string) {
    return await this.db.select().from(auditLogs).where(eq(auditLogs.sessionId, sessionId));
  }
}
