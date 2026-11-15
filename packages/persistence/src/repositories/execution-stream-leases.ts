import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
export const EXECUTION_STREAM_LEASE_MS = 30_000;
/** A short database transaction serializes admission across all API replicas. No network work holds this lock. */
export class ExecutionStreamLeases {
  constructor(
    private readonly client: Client,
    private readonly now?: () => number,
  ) {}
  private async time(executor: Pick<Client, 'execute'>): Promise<number> {
    // Replicas must agree on expiration; PostgreSQL uses its clock, not the API host's clock.
    if ((this.client as Client & { forgelexDialect?: string }).forgelexDialect === 'postgres') {
      const result = await executor.execute('SELECT floor(extract(epoch from clock_timestamp()) * 1000) AS now');
      return Number(result.rows[0].now);
    }
    if (this.now) return this.now();
    const result = await executor.execute("SELECT CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER) AS now");
    return Number(result.rows[0].now);
  }
  async acquire(owner: { tenantId: string; userId: string }, executionId: string): Promise<string> {
    const tx = await this.client.transaction('write');
    try {
      await tx.execute('UPDATE execution_stream_admission_lock SET value = 1 WHERE id = 1');
      const now = await this.time(tx);
      await tx.execute({ sql: 'DELETE FROM execution_stream_leases WHERE expires_at <= ?', args: [now] });
      const { rows } = await tx.execute({
        sql: `SELECT tenant_id, user_id, execution_id FROM execution_stream_leases WHERE tenant_id = ? OR user_id = ?`,
        args: [owner.tenantId, owner.userId],
      });
      const user = rows.filter((row) => row.user_id === owner.userId);
      if (
        rows.filter((row) => row.tenant_id === owner.tenantId).length >= 20 ||
        user.length >= 5 ||
        user.filter((row) => row.execution_id === executionId).length >= 2
      )
        throw new Error('STREAM_LIMIT_EXCEEDED');
      const id = randomUUID();
      await tx.execute({
        sql: 'INSERT INTO execution_stream_leases (id, tenant_id, user_id, execution_id, expires_at) VALUES (?, ?, ?, ?, ?)',
        args: [id, owner.tenantId, owner.userId, executionId, now + EXECUTION_STREAM_LEASE_MS],
      });
      await tx.commit();
      return id;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
  async release(id: string): Promise<void> {
    await this.client.execute({ sql: 'DELETE FROM execution_stream_leases WHERE id = ?', args: [id] });
  }
  async renew(id: string): Promise<boolean> {
    const tx = await this.client.transaction('write');
    try {
      await tx.execute('UPDATE execution_stream_admission_lock SET value = 1 WHERE id = 1');
      const now = await this.time(tx);
      const result = await tx.execute({
        sql: 'UPDATE execution_stream_leases SET expires_at = ? WHERE id = ? AND expires_at > ?',
        args: [now + EXECUTION_STREAM_LEASE_MS, id, now],
      });
      await tx.commit();
      return result.rowsAffected === 1;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}
