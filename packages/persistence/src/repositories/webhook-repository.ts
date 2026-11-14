import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';

export type WebhookEndpointStatus = 'ACTIVE' | 'REVOKED' | 'SUSPENDED';
export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERING' | 'DELIVERED' | 'FAILED' | 'RETRYING';

export interface WebhookEndpointRecord {
  id: string;
  tenantId: string;
  url: string;
  description?: string;
  secretCiphertext: string;
  eventTypes: string[];
  status: WebhookEndpointStatus;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
  lastError?: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  eventId: string;
  endpointId: string;
  tenantId: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  responseStatus?: number;
  responseBodyExcerpt?: string;
  lastError?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDispatchRecord extends WebhookDeliveryRecord {
  claimToken: string;
  endpoint: WebhookEndpointRecord;
  eventType: string;
  payloadJson: string;
  occurredAt: string;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function endpointFromRow(row: Record<string, unknown>): WebhookEndpointRecord {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), url: String(row.url),
    description: text(row.description), secretCiphertext: String(row.secret_ciphertext),
    eventTypes: JSON.parse(String(row.event_types)) as string[], status: String(row.status) as WebhookEndpointStatus,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), revokedAt: text(row.revoked_at), lastError: text(row.last_error),
  };
}

/** Every admission and scheduling bound in one place, so SQL and tests agree on the same numbers. */
export interface WebhookLimits {
  /** Queued deliveries (PENDING, RETRYING, DELIVERING) across all tenants; beyond it an event is refused. */
  globalQueued: number;
  /** Queued deliveries of one tenant; beyond it an event is refused. */
  tenantQueued: number;
  /** Queued deliveries of one endpoint; beyond it only that endpoint's delivery is recorded as FAILED, replayable. */
  endpointQueued: number;
  /** Deliveries in flight across all replicas. A tenant never has more than one. */
  concurrentDeliveries: number;
  leaseMs: number;
  maxAttempts: number;
}
export const WEBHOOK_LIMITS: WebhookLimits = {
  globalQueued: 1000, tenantQueued: 250, endpointQueued: 100, concurrentDeliveries: 4, leaseMs: 30_000, maxAttempts: 8,
};
export interface EnqueueResult { id: string; queued: number; overflowed: number }

export class WebhookRepository {
  private readonly limits: WebhookLimits;

  public constructor(private readonly client: Client, options: { limits?: Partial<WebhookLimits> } = {}) {
    this.limits = { ...WEBHOOK_LIMITS, ...options.limits };
  }

  public async createEndpoint(input: Omit<WebhookEndpointRecord, 'createdAt' | 'updatedAt' | 'status'>): Promise<WebhookEndpointRecord> {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO webhook_endpoints (id, tenant_id, url, description, secret_ciphertext, event_types, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      args: [input.id, input.tenantId, input.url, input.description ?? null, input.secretCiphertext, JSON.stringify(input.eventTypes), now, now],
    });
    return { ...input, status: 'ACTIVE', createdAt: now, updatedAt: now };
  }

  public async listEndpoints(tenantId: string): Promise<WebhookEndpointRecord[]> {
    const result = await this.client.execute({ sql: 'SELECT * FROM webhook_endpoints WHERE tenant_id = ? ORDER BY created_at DESC', args: [tenantId] });
    return result.rows.map((row) => endpointFromRow(row as Record<string, unknown>));
  }

  public async findEndpoint(tenantId: string, id: string): Promise<WebhookEndpointRecord | undefined> {
    const result = await this.client.execute({ sql: 'SELECT * FROM webhook_endpoints WHERE tenant_id = ? AND id = ?', args: [tenantId, id] });
    return result.rows[0] ? endpointFromRow(result.rows[0] as Record<string, unknown>) : undefined;
  }

  /** Revoking is final: it also cancels every queued delivery of the endpoint, including those held while suspended. */
  public async revokeEndpoint(tenantId: string, id: string): Promise<boolean> {
    const now = new Date().toISOString();
    return this.withAdmission(async (transaction) => {
      const result = await transaction.execute({ sql: "UPDATE webhook_endpoints SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND status IN ('ACTIVE', 'SUSPENDED')", args: [now, now, tenantId, id] });
      if (result.rowsAffected === 0) return false;
      await transaction.execute({ sql: `UPDATE webhook_deliveries SET status = 'FAILED', claim_token = NULL, last_error = 'WEBHOOK_ENDPOINT_INACTIVE', updated_at = ?
        WHERE tenant_id = ? AND endpoint_id = ? AND status IN ('PENDING', 'RETRYING', 'DELIVERING')`, args: [now, tenantId, id] });
      return true;
    });
  }

  /** Suspending is recoverable: queued deliveries are held, not cancelled, and resume on reactivateEndpoint. */
  public async suspendEndpoint(tenantId: string, id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.withAdmission((transaction) => transaction.execute({ sql: "UPDATE webhook_endpoints SET status = 'SUSPENDED', last_error = 'WEBHOOK_URL_BLOCKED', updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'", args: [now, tenantId, id] }));
  }

  /** Puts a suspended endpoint back in service and makes its held deliveries due immediately. */
  public async reactivateEndpoint(tenantId: string, id: string): Promise<boolean> {
    const now = new Date().toISOString();
    return this.withAdmission(async (transaction) => {
      const result = await transaction.execute({ sql: "UPDATE webhook_endpoints SET status = 'ACTIVE', last_error = NULL, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'SUSPENDED'", args: [now, tenantId, id] });
      if (result.rowsAffected === 0) return false;
      await transaction.execute({ sql: "UPDATE webhook_deliveries SET next_attempt_at = ?, updated_at = ? WHERE tenant_id = ? AND endpoint_id = ? AND status IN ('PENDING', 'RETRYING') AND next_attempt_at > ?", args: [now, now, tenantId, id, now] });
      return true;
    });
  }

  /** One transaction serialized across replicas and dialects by the shared admission row. */
  private async withAdmission<T>(work: (transaction: Pick<Client, 'execute'>) => Promise<T>): Promise<T> {
    const transaction = await this.client.transaction();
    try {
      await transaction.execute('UPDATE webhook_admission SET revision = revision WHERE id = 1');
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } catch (error) { await transaction.rollback(); throw error; }
  }

  public async enqueueEvent(input: { id?: string; tenantId: string; eventType: string; payloadJson: string; endpointIds: string[] }): Promise<EnqueueResult> {
    const id = input.id ?? randomUUID();
    const none: EnqueueResult = { id, queued: 0, overflowed: 0 };
    if (!input.endpointIds.length) return none;
    const now = new Date().toISOString();
    return this.withAdmission(async (transaction) => {
      const active = ['PENDING', 'RETRYING', 'DELIVERING'];
      const marks = active.map(() => '?').join(', ');
      const targets: Array<{ endpointId: string; full: boolean }> = [];
      for (const endpointId of new Set(input.endpointIds)) {
        const found = await transaction.execute({ sql: "SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE'", args: [endpointId, input.tenantId] });
        if (!found.rows.length) continue;
        const queued = await transaction.execute({ sql: `SELECT COUNT(*) total FROM webhook_deliveries WHERE endpoint_id = ? AND tenant_id = ? AND status IN (${marks})`, args: [endpointId, input.tenantId, ...active] });
        targets.push({ endpointId, full: Number(queued.rows[0]?.total) >= this.limits.endpointQueued });
      }
      if (!targets.length) return none;
      const admitted = targets.filter((target) => !target.full).length;
      const queued = await transaction.execute({ sql: `SELECT COUNT(*) total, SUM(CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) tenant_total FROM webhook_deliveries WHERE status IN (${marks})`, args: [input.tenantId, ...active] });
      if (Number(queued.rows[0]?.total) + admitted > this.limits.globalQueued || Number(queued.rows[0]?.tenant_total ?? 0) + admitted > this.limits.tenantQueued) throw new Error('WEBHOOK_QUEUE_FULL');
      await transaction.execute({ sql: 'INSERT INTO webhook_events (id, tenant_id, event_type, payload_json, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id, input.tenantId, input.eventType, input.payloadJson, now, now] });
      for (const { endpointId, full } of targets) {
        await transaction.execute({
          sql: `INSERT INTO webhook_deliveries (id, event_id, endpoint_id, tenant_id, status, attempt_count, max_attempts, next_attempt_at, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
          args: [randomUUID(), id, endpointId, input.tenantId, full ? 'FAILED' : 'PENDING', this.limits.maxAttempts, now, full ? 'WEBHOOK_QUEUE_FULL' : null, now, now],
        });
      }
      return { id, queued: admitted, overflowed: targets.length - admitted };
    });
  }

  public async listDeliveries(tenantId: string, endpointId?: string): Promise<WebhookDeliveryRecord[]> {
    const result = endpointId
      ? await this.client.execute({ sql: 'SELECT * FROM webhook_deliveries WHERE tenant_id = ? AND endpoint_id = ? ORDER BY created_at DESC', args: [tenantId, endpointId] })
      : await this.client.execute({ sql: 'SELECT * FROM webhook_deliveries WHERE tenant_id = ? ORDER BY created_at DESC', args: [tenantId] });
    return result.rows.map((row) => this.deliveryFromRow(row as Record<string, unknown>));
  }

  public async requeue(tenantId: string, deliveryId: string): Promise<boolean> {
    const now = new Date().toISOString();
    return this.withAdmission(async (transaction) => {
      const candidate = await transaction.execute({ sql: "SELECT d.status, d.endpoint_id FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id AND e.tenant_id = d.tenant_id WHERE d.tenant_id = ? AND d.id = ? AND d.status IN ('FAILED', 'RETRYING') AND e.status = 'ACTIVE'", args: [tenantId, deliveryId] });
      const row = candidate.rows[0] as Record<string, unknown> | undefined;
      if (!row) return false;
      if (row.status === 'FAILED') {
        const queued = await transaction.execute({ sql: "SELECT COUNT(*) total, SUM(CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) tenant_total, SUM(CASE WHEN endpoint_id = ? THEN 1 ELSE 0 END) endpoint_total FROM webhook_deliveries WHERE status IN ('PENDING', 'RETRYING', 'DELIVERING')", args: [tenantId, String(row.endpoint_id)] });
        const counts = queued.rows[0];
        if (Number(counts?.total) >= this.limits.globalQueued || Number(counts?.tenant_total ?? 0) >= this.limits.tenantQueued || Number(counts?.endpoint_total ?? 0) >= this.limits.endpointQueued) throw new Error('WEBHOOK_QUEUE_FULL');
      }
      const result = await transaction.execute({ sql: "UPDATE webhook_deliveries SET status = 'RETRYING', next_attempt_at = ?, last_error = NULL, updated_at = ? WHERE tenant_id = ? AND id = ? AND status IN ('FAILED', 'RETRYING')", args: [now, now, tenantId, deliveryId] });
      return result.rowsAffected > 0;
    });
  }

  public async claimDueDelivery(now = new Date().toISOString(), leaseMs = this.limits.leaseMs): Promise<WebhookDispatchRecord | undefined> {
    const leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
    let transaction;
    try { transaction = await this.client.transaction(); } catch (error) {
      if (['SQLITE_BUSY', 'TRANSACTION_ACTIVE'].includes(String((error as { code?: string }).code))) return undefined;
      throw error;
    }
    let dispatch: WebhookDispatchRecord | undefined;
    try {
      // Shared admission row serializes candidate selection across replicas and dialects.
      await transaction.execute('UPDATE webhook_admission SET revision = revision WHERE id = 1');
      const claimed = await transaction.execute({
        sql: `UPDATE webhook_deliveries SET status = 'DELIVERING', attempt_count = attempt_count + 1,
              last_attempt_at = ?, next_attempt_at = ?, updated_at = ?, claim_token = ?
              WHERE id = (
                SELECT d.id FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id
                WHERE d.status IN ('PENDING', 'RETRYING', 'DELIVERING') AND d.next_attempt_at <= ? AND e.status = 'ACTIVE'
                  AND (SELECT COUNT(*) FROM webhook_deliveries a WHERE a.status = 'DELIVERING' AND a.next_attempt_at > ?) < ?
                  AND NOT EXISTS (SELECT 1 FROM webhook_deliveries a WHERE a.tenant_id = d.tenant_id AND a.status = 'DELIVERING' AND a.next_attempt_at > ?)
                ORDER BY COALESCE((SELECT MAX(a.last_attempt_at) FROM webhook_deliveries a WHERE a.tenant_id = d.tenant_id), '') ASC,
                         d.next_attempt_at ASC, d.created_at ASC, d.id ASC LIMIT 1
              ) RETURNING id`,
        args: [now, leaseUntil, now, randomUUID(), now, now, this.limits.concurrentDeliveries, now],
      });
      const id = claimed.rows[0] ? String((claimed.rows[0] as Record<string, unknown>).id) : undefined;
      dispatch = id ? await this.findDispatch(id, transaction) : undefined;
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; }

    return dispatch;
  }

  public async markDelivered(deliveryId: string, statusCode: number, claimToken: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({ sql: "UPDATE webhook_deliveries SET status = 'DELIVERED', response_status = ?, response_body_excerpt = NULL, claim_token = NULL, delivered_at = ?, updated_at = ? WHERE id = ? AND status = 'DELIVERING' AND claim_token = ?", args: [statusCode, now, now, deliveryId, claimToken] });
  }

  public async markDeliveryFailure(deliveryId: string, error: string, claimToken: string, statusCode?: number): Promise<'RETRYING' | 'FAILED'> {
    const current = await this.client.execute({ sql: 'SELECT attempt_count, max_attempts, status, claim_token FROM webhook_deliveries WHERE id = ?', args: [deliveryId] });
    const row = current.rows[0] as Record<string, unknown> | undefined;
    if (!row) return 'FAILED';
    if (row.status !== 'DELIVERING' || row.claim_token !== claimToken) return row.status === 'RETRYING' ? 'RETRYING' : 'FAILED';
    const attemptCount = Number(row.attempt_count);
    const maxAttempts = Number(row.max_attempts);
    const terminal = attemptCount >= maxAttempts;
    const nextAttemptAt = new Date(Date.now() + Math.min(3_600_000, 1_000 * 2 ** Math.max(0, attemptCount - 1))).toISOString();
    const now = new Date().toISOString();
    await this.client.execute({ sql: `UPDATE webhook_deliveries SET status = ?, next_attempt_at = ?, response_status = ?, response_body_excerpt = NULL, claim_token = NULL, last_error = ?, updated_at = ? WHERE id = ? AND status = 'DELIVERING' AND claim_token = ?`, args: [terminal ? 'FAILED' : 'RETRYING', nextAttemptAt, statusCode ?? null, error.slice(0, 500), now, deliveryId, claimToken] });
    return terminal ? 'FAILED' : 'RETRYING';
  }

  private deliveryFromRow(row: Record<string, unknown>): WebhookDeliveryRecord {
    return { id: String(row.id), eventId: String(row.event_id), endpointId: String(row.endpoint_id), tenantId: String(row.tenant_id), status: String(row.status) as WebhookDeliveryStatus, attemptCount: Number(row.attempt_count), maxAttempts: Number(row.max_attempts), nextAttemptAt: String(row.next_attempt_at), responseStatus: row.response_status == null ? undefined : Number(row.response_status), lastError: text(row.last_error), deliveredAt: text(row.delivered_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }

  private async findDispatch(id: string, client: Pick<Client, 'execute'> = this.client): Promise<WebhookDispatchRecord | undefined> {
    const result = await client.execute({
      sql: `SELECT d.*, e.url, e.description, e.secret_ciphertext, e.event_types, e.status endpoint_status,
            e.created_at endpoint_created_at, e.updated_at endpoint_updated_at, e.revoked_at endpoint_revoked_at,
            w.event_type, w.payload_json, w.occurred_at
            FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id
            JOIN webhook_events w ON w.id = d.event_id WHERE d.id = ?`,
      args: [id],
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      ...this.deliveryFromRow(row),
      claimToken: String(row.claim_token),
      endpoint: { id: String(row.endpoint_id), tenantId: String(row.tenant_id), url: String(row.url), description: text(row.description), secretCiphertext: String(row.secret_ciphertext), eventTypes: JSON.parse(String(row.event_types)) as string[], status: String(row.endpoint_status) as WebhookEndpointStatus, createdAt: String(row.endpoint_created_at), updatedAt: String(row.endpoint_updated_at), revokedAt: text(row.endpoint_revoked_at) },
      eventType: String(row.event_type), payloadJson: String(row.payload_json), occurredAt: String(row.occurred_at),
    };
  }
}
