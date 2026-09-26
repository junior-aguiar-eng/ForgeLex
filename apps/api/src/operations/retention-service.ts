import type { Client } from '@forgelex/persistence';

export interface OperationalRetentionPolicy {
  operationalDays: number;
  accessLogDays: number;
  closureReceiptDays: number;
}

export interface RetentionPolicy extends OperationalRetentionPolicy {
  enabled: boolean;
}

export function resolveRetentionPolicy(environment: Record<string, string | undefined>): RetentionPolicy {
  const enabled = environment.FORGELEX_RETENTION_WORKER_ENABLED === 'true';
  const defaults = { accessLogDays: 180, closureReceiptDays: 1827 } as const;
  if (!enabled) return { enabled: false, operationalDays: 90, ...defaults };
  const raw = environment.FORGELEX_OPERATION_RETENTION_DAYS ?? '90';
  const operationalDays = Number(raw);
  if (!Number.isInteger(operationalDays) || operationalDays < 1 || operationalDays > 3650) {
    throw new Error('FORGELEX_OPERATION_RETENTION_DAYS_INVALID');
  }
  return { enabled: true, operationalDays, ...defaults };
}

export class OperationalRetentionService {
  private readonly policy: OperationalRetentionPolicy;

  public constructor(
    private readonly client: Client,
    policy: OperationalRetentionPolicy | number = {
      operationalDays: 90,
      accessLogDays: 180,
      closureReceiptDays: 1827,
    },
  ) {
    this.policy = typeof policy === 'number'
      ? { operationalDays: policy, accessLogDays: 180, closureReceiptDays: 1827 }
      : policy;
  }

  public async purge(now = new Date()): Promise<{
    history: number;
    snapshots: number;
    webhookBodies: number;
    financialWebhookBodies: number;
    accessLogs: number;
    closureReceipts: number;
  }> {
    const dayMs = 86_400_000;
    const operationalCutoff = new Date(
      now.getTime() - this.policy.operationalDays * dayMs,
    ).toISOString();
    const webhookCutoff = new Date(
      now.getTime() - Math.min(this.policy.operationalDays, 90) * dayMs,
    ).toISOString();
    const accessLogCutoff = new Date(
      now.getTime() - this.policy.accessLogDays * dayMs,
    ).toISOString();
    const closureCutoff = new Date(
      now.getTime() - this.policy.closureReceiptDays * dayMs,
    ).toISOString();
    const transaction = await this.client.transaction();
    try {
      const history = await transaction.execute({
        sql: 'DELETE FROM research_search_history WHERE created_at < ?',
        args: [operationalCutoff],
      });
      const operations = await transaction.execute({
        sql: `UPDATE billing_operations SET result_snapshot = NULL
          WHERE status = 'COMPLETED' AND updated_at < ? AND result_snapshot IS NOT NULL`,
        args: [operationalCutoff],
      });
      const entries = await transaction.execute({
        sql: `UPDATE ledger_entries SET operation_result_snapshot = NULL
          WHERE created_at < ? AND operation_result_snapshot IS NOT NULL`,
        args: [operationalCutoff],
      });
      const webhookBodies = await transaction.execute({
        sql: `UPDATE webhook_deliveries SET response_body_excerpt = NULL
          WHERE status IN ('DELIVERED','FAILED') AND updated_at < ?
            AND response_body_excerpt IS NOT NULL`,
        args: [webhookCutoff],
      });
      const financialWebhookBodies = await transaction.execute({
        sql: `UPDATE billing_webhook_events
          SET payload = '{}', error_message = NULL
          WHERE received_at < ?
            AND (payload != '{}' OR error_message IS NOT NULL)`,
        args: [webhookCutoff],
      });
      const accessLogs = await transaction.execute({
        sql: `DELETE FROM audit_logs
          WHERE created_at < ? AND NOT EXISTS (
            SELECT 1 FROM account_closures c
            JOIN retention_exceptions r ON r.closure_id = c.id
            WHERE audit_logs.session_id = 'closure_' || c.id
              AND r.status = 'ACTIVE' AND r.starts_at <= ?
              AND (r.ends_at IS NULL OR r.ends_at > ?)
          )`,
        args: [accessLogCutoff, now.toISOString(), now.toISOString()],
      });
      const eligible = await transaction.execute({
        sql: `SELECT id FROM account_closures c
          WHERE c.status = 'COMPLETED' AND c.completed_at < ?
            AND NOT EXISTS (
              SELECT 1 FROM retention_exceptions r
              WHERE r.closure_id = c.id AND r.status = 'ACTIVE'
                AND r.starts_at <= ? AND (r.ends_at IS NULL OR r.ends_at > ?)
            )`,
        args: [closureCutoff, now.toISOString(), now.toISOString()],
      });
      const closureIds = eligible.rows.map((row) => String(row.id));
      let closureReceipts = 0;
      if (closureIds.length > 0) {
        const placeholders = closureIds.map(() => '?').join(', ');
        await transaction.execute({
          sql: `DELETE FROM retention_exceptions WHERE closure_id IN (${placeholders})`,
          args: closureIds,
        });
        await transaction.execute({
          sql: `DELETE FROM account_closure_steps WHERE closure_id IN (${placeholders})`,
          args: closureIds,
        });
        const closures = await transaction.execute({
          sql: `DELETE FROM account_closures WHERE id IN (${placeholders})`,
          args: closureIds,
        });
        closureReceipts = closures.rowsAffected;
      }
      await transaction.commit();
      return {
        history: history.rowsAffected,
        snapshots: operations.rowsAffected + entries.rowsAffected,
        webhookBodies: webhookBodies.rowsAffected,
        financialWebhookBodies: financialWebhookBodies.rowsAffected,
        accessLogs: accessLogs.rowsAffected,
        closureReceipts,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
