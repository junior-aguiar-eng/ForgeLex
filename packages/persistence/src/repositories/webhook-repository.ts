import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';

export type WebhookEndpointStatus = 'ACTIVE' | 'REVOKED';
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
    createdAt: String(row.created_at), updatedAt: String(row.updated_at), revokedAt: text(row.revoked_at),
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
    const now = new Date().toISOString();
    const result = await this.client.execute({ sql: "UPDATE webhook_endpoints SET status = 'REVOKED', revoked_at = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'", args: [now, now, tenantId, id] });
    return result.rowsAffected > 0;
  }

  public async enqueueEvent(input: { id?: string; tenantId: string; eventType: string; payloadJson: string; endpointIds: string[] }): Promise<string> {
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    const transaction = await this.client.transaction();
    try {
      await transaction.execute({ sql: 'INSERT INTO webhook_events (id, tenant_id, event_type, payload_json, occurred_at, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [id, input.tenantId, input.eventType, input.payloadJson, now, now] });
      for (const endpointId of input.endpointIds) {
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
    const result = await this.client.execute({ sql: "UPDATE webhook_deliveries SET status = 'RETRYING', next_attempt_at = ?, last_error = NULL, updated_at = ? WHERE tenant_id = ? AND id = ? AND status IN ('FAILED', 'RETRYING')", args: [now, now, tenantId, deliveryId] });
    return result.rowsAffected > 0;
  }

  public async claimDueDelivery(now = new Date().toISOString(), leaseMs = 30_000): Promise<WebhookDispatchRecord | undefined> {
    const candidates = await this.client.execute({
      sql: `SELECT d.id FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id = d.endpoint_id
            WHERE d.status IN ('PENDING', 'RETRYING', 'DELIVERING') AND d.next_attempt_at <= ? AND e.status = 'ACTIVE'
            ORDER BY d.next_attempt_at ASC LIMIT 20`,
      args: [now],
    });
    for (const candidate of candidates.rows) {
      const id = String((candidate as Record<string, unknown>).id);
      const leaseUntil = new Date(Date.parse(now) + leaseMs).toISOString();
      const claimed = await this.client.execute({
        sql: `UPDATE webhook_deliveries SET status = 'DELIVERING', attempt_count = attempt_count + 1,
              last_attempt_at = ?, next_attempt_at = ?, updated_at = ?
              WHERE id = ? AND status IN ('PENDING', 'RETRYING', 'DELIVERING') AND next_attempt_at <= ?`,
        args: [now, leaseUntil, now, id, now],
      });
      if (claimed.rowsAffected === 0) continue;
      const result = await this.client.execute({
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
        endpoint: { id: String(row.endpoint_id), tenantId: String(row.tenant_id), url: String(row.url), description: text(row.description), secretCiphertext: String(row.secret_ciphertext), eventTypes: JSON.parse(String(row.event_types)) as string[], status: String(row.endpoint_status) as WebhookEndpointStatus, createdAt: String(row.endpoint_created_at), updatedAt: String(row.endpoint_updated_at), revokedAt: text(row.endpoint_revoked_at) },
        eventType: String(row.event_type), payloadJson: String(row.payload_json), occurredAt: String(row.occurred_at),
      };
    }
    return undefined;
  }

  public async markDelivered(deliveryId: string, statusCode: number, responseExcerpt: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client.execute({ sql: "UPDATE webhook_deliveries SET status = 'DELIVERED', response_status = ?, response_body_excerpt = ?, delivered_at = ?, updated_at = ? WHERE id = ? AND status = 'DELIVERING'", args: [statusCode, responseExcerpt, now, now, deliveryId] });
  }

  public async markDeliveryFailure(deliveryId: string, error: string, statusCode?: number, responseExcerpt?: string): Promise<'RETRYING' | 'FAILED'> {
    const current = await this.client.execute({ sql: 'SELECT attempt_count, max_attempts FROM webhook_deliveries WHERE id = ?', args: [deliveryId] });
    const row = current.rows[0] as Record<string, unknown> | undefined;
    if (!row) return 'FAILED';
    const attemptCount = Number(row.attempt_count);
    const maxAttempts = Number(row.max_attempts);
    const terminal = attemptCount >= maxAttempts;
    const nextAttemptAt = new Date(Date.now() + Math.min(3_600_000, 1_000 * 2 ** Math.max(0, attemptCount - 1))).toISOString();
    const now = new Date().toISOString();
    await this.client.execute({ sql: `UPDATE webhook_deliveries SET status = ?, next_attempt_at = ?, response_status = ?, response_body_excerpt = ?, last_error = ?, updated_at = ? WHERE id = ? AND status = 'DELIVERING'`, args: [terminal ? 'FAILED' : 'RETRYING', nextAttemptAt, statusCode ?? null, responseExcerpt ?? null, error.slice(0, 500), now, deliveryId] });
    return terminal ? 'FAILED' : 'RETRYING';
  }

  private deliveryFromRow(row: Record<string, unknown>): WebhookDeliveryRecord {
    return { id: String(row.id), eventId: String(row.event_id), endpointId: String(row.endpoint_id), tenantId: String(row.tenant_id), status: String(row.status) as WebhookDeliveryStatus, attemptCount: Number(row.attempt_count), maxAttempts: Number(row.max_attempts), nextAttemptAt: String(row.next_attempt_at), responseStatus: row.response_status == null ? undefined : Number(row.response_status), responseBodyExcerpt: text(row.response_body_excerpt), lastError: text(row.last_error), deliveredAt: text(row.delivered_at), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
}
