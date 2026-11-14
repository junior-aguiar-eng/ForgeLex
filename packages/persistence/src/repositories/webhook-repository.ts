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

export class WebhookRepository {
  public constructor(private readonly client: Client) {}

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

  public async revokeEndpoint(tenantId: string, id: string): Promise<boolean> {
    return this.retireEndpoint(tenantId, id, 'REVOKED');
  }

  public async suspendEndpoint(tenantId: string, id: string): Promise<void> {
    await this.retireEndpoint(tenantId, id, 'SUSPENDED');
  }

  private async retireEndpoint(tenantId: string, id: string, status: 'REVOKED' | 'SUSPENDED'): Promise<boolean> {
    const now = new Date().toISOString();
    const transaction = await this.client.transaction();
    try {
      await transaction.execute('UPDATE webhook_admission SET revision = revision WHERE id = 1');
      const result = await transaction.execute({ sql: status === 'REVOKED'
        ? "UPDATE webhook_endpoints SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND status IN ('ACTIVE', 'SUSPENDED')"
        : "UPDATE webhook_endpoints SET status = 'SUSPENDED', last_error = 'WEBHOOK_URL_BLOCKED', updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'",
        args: status === 'REVOKED' ? [now, now, tenantId, id] : [now, tenantId, id] });
      await this.cancelInactiveDeliveries(transaction, now);
      await transaction.commit();
      return result.rowsAffected > 0;
    } catch (error) { await transaction.rollback(); throw error; }
  }

  private async cancelInactiveDeliveries(client: Pick<Client, 'execute'>, now: string): Promise<void> {
    await client.execute({ sql: `UPDATE webhook_deliveries SET status = 'FAILED', claim_token = NULL,
      last_error = 'WEBHOOK_ENDPOINT_INACTIVE', updated_at = ?
      WHERE status IN ('PENDING', 'RETRYING', 'DELIVERING') AND NOT EXISTS (
        SELECT 1 FROM webhook_endpoints e WHERE e.id = webhook_deliveries.endpoint_id
        AND e.tenant_id = webhook_deliveries.tenant_id AND e.status = 'ACTIVE')`, args: [now] });
  }

  public async enqueueEvent(input: { id?: string; tenantId: string; eventType: string; payloadJson: string; endpointIds: string[] }): Promise<string> {
    const id = input.id ?? randomUUID();
    if (!input.endpointIds.length) return id;
    const now = new Date().toISOString();
    const transaction = await this.client.transaction();
    try {
      await transaction.execute('UPDATE webhook_admission SET revision = revision WHERE id = 1');
      await this.cancelInactiveDeliveries(transaction, now);
      const activeEndpoints: string[] = [];
      for (const endpointId of new Set(input.endpointIds)) {
        const active = await transaction.execute({ sql: "SELECT id FROM webhook_endpoints WHERE id = ? AND tenant_id = ? AND status = 'ACTIVE'", args: [endpointId, input.tenantId] });
        if (active.rows.length) activeEndpoints.push(endpointId);
      }
      if (!activeEndpoints.length) { await transaction.commit(); return id; }
      const queued = await transaction.execute({ sql: "SELECT COUNT(*) total, SUM(CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) tenant_total FROM webhook_deliveries WHERE status IN ('PENDING', 'RETRYING', 'DELIVERING')", args: [input.tenantId] });
      if (Number(queued.rows[0]?.total) + activeEndpoints.length > 1000 || Number(queued.rows[0]?.tenant_total ?? 0) + activeEndpoints.length > 250) throw new Error('WEBHOOK_QUEUE_FULL');
      await transaction.execute({ sql: 'INSERT INTO webhook_events (id, tenant_id, event_type, payload_json, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id, input.tenantId, input.eventType, input.payloadJson, now, now] });
      for (const endpointId of activeEndpoints) {
        await transaction.execute({ sql: `INSERT INTO webhook_deliveries (id, event_id, endpoint_id, tenant_id, status, attempt_count, max_attempts, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'PENDING', 0, 8, ?, ?, ?)`, args: [randomUUID(), id, endpointId, input.tenantId, now, now, now] });
      }
      await transaction.commit();
      return id;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  public async listDeliveries(tenantId: string, endpointId?: string): Promise<WebhookDeliveryRecord[]> {
    const result = endpointId
      ? await this.client.execute({ sql: 'SELECT * FROM webhook_deliveries WHERE tenant_id = ? AND endpoint_id = ? ORDER BY created_at DESC', args: [tenantId, endpointId] })
      : await this.client.execute({ sql: 'SELECT * FROM webhook_deliveries WHERE tenant_id = ? ORDER BY created_at DESC', args: [tenantId] });
    return result.rows.map((row) => this.deliveryFromRow(row as Record<string, unknown>));
  }

  public async requeue(tenantId: string, deliveryId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const transaction = await this.client.transaction();
    try {
      await transaction.execute('UPDATE webhook_admission SET revision = revision WHERE id = 1');
      await this.cancelInactiveDeliveries(transaction, now);
      const candidate = await transaction.execute({ sql: "SELECT d.status FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id AND e.tenant_id = d.tenant_id WHERE d.tenant_id = ? AND d.id = ? AND d.status IN ('FAILED', 'RETRYING') AND e.status = 'ACTIVE'", args: [tenantId, deliveryId] });
      if (!candidate.rows.length) { await transaction.commit(); return false; }
      if (candidate.rows[0]!.status === 'FAILED') {
        const queued = await transaction.execute({ sql: "SELECT COUNT(*) total, SUM(CASE WHEN tenant_id = ? THEN 1 ELSE 0 END) tenant_total FROM webhook_deliveries WHERE status IN ('PENDING', 'RETRYING', 'DELIVERING')", args: [tenantId] });
        if (Number(queued.rows[0]?.total) >= 1000 || Number(queued.rows[0]?.tenant_total ?? 0) >= 250) throw new Error('WEBHOOK_QUEUE_FULL');
      }
      const result = await transaction.execute({ sql: "UPDATE webhook_deliveries SET status = 'RETRYING', next_attempt_at = ?, last_error = NULL, updated_at = ? WHERE tenant_id = ? AND id = ? AND status IN ('FAILED', 'RETRYING')", args: [now, now, tenantId, deliveryId] });
      await transaction.commit();
      return result.rowsAffected > 0;
    } catch (error) { await transaction.rollback(); throw error; }
  }

  public async claimDueDelivery(now = new Date().toISOString(), leaseMs = 30_000): Promise<WebhookDispatchRecord | undefined> {
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
      await this.cancelInactiveDeliveries(transaction, now);
      const claimed = await transaction.execute({
        sql: `UPDATE webhook_deliveries SET status = 'DELIVERING', attempt_count = attempt_count + 1,
              last_attempt_at = ?, next_attempt_at = ?, updated_at = ?, claim_token = ?
              WHERE id = (
                SELECT d.id FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id
                WHERE d.status IN ('PENDING', 'RETRYING', 'DELIVERING') AND d.next_attempt_at <= ? AND e.status = 'ACTIVE'
                  AND (SELECT COUNT(*) FROM webhook_deliveries a WHERE a.status = 'DELIVERING' AND a.next_attempt_at > ?) < 4
                  AND NOT EXISTS (SELECT 1 FROM webhook_deliveries a WHERE a.tenant_id = d.tenant_id AND a.status = 'DELIVERING' AND a.next_attempt_at > ?)
                ORDER BY COALESCE((SELECT MAX(a.last_attempt_at) FROM webhook_deliveries a WHERE a.tenant_id = d.tenant_id), '') ASC,
                         d.next_attempt_at ASC, d.created_at ASC, d.id ASC LIMIT 1
              ) RETURNING id`,
        args: [now, leaseUntil, now, randomUUID(), now, now, now],
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
