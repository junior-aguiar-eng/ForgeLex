import type { Client } from '@forgelex/persistence';

export interface RetentionPolicy {
  enabled: boolean;
  retentionDays: number;
}

export function resolveRetentionPolicy(environment: Record<string, string | undefined>): RetentionPolicy {
  const enabled = environment.FORGELEX_RETENTION_WORKER_ENABLED === 'true';
  if (!enabled) return { enabled: false, retentionDays: 90 };
  const raw = environment.FORGELEX_OPERATION_RETENTION_DAYS ?? '90';
  const retentionDays = Number(raw);
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('FORGELEX_OPERATION_RETENTION_DAYS_INVALID');
  }
  return { enabled: true, retentionDays };
}

export class OperationalRetentionService {
  public constructor(private readonly client: Client, private readonly retentionDays = 90) {}

  public async purge(now = new Date()): Promise<{ history: number; snapshots: number; webhookBodies: number }> {
    const cutoff = new Date(now.getTime() - this.retentionDays * 86_400_000).toISOString();
    const history = await this.client.execute({ sql: 'DELETE FROM research_search_history WHERE created_at < ?', args: [cutoff] });
    const operations = await this.client.execute({ sql: "UPDATE billing_operations SET result_snapshot = NULL WHERE status = 'COMPLETED' AND updated_at < ? AND result_snapshot IS NOT NULL", args: [cutoff] });
    const entries = await this.client.execute({ sql: 'UPDATE ledger_entries SET operation_result_snapshot = NULL WHERE created_at < ? AND operation_result_snapshot IS NOT NULL', args: [cutoff] });
    const webhookBodies = await this.client.execute({ sql: "UPDATE webhook_deliveries SET response_body_excerpt = NULL WHERE status IN ('DELIVERED','FAILED') AND updated_at < ? AND response_body_excerpt IS NOT NULL", args: [cutoff] });
    return { history: history.rowsAffected, snapshots: operations.rowsAffected + entries.rowsAffected, webhookBodies: webhookBodies.rowsAffected };
  }
}
