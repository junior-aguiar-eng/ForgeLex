import { createDatabase } from '@forgelex/persistence';
import { OperationalRetentionService, resolveRetentionPolicy } from './retention-service.js';

export function resolveRetentionCommand(args: string[], environment: Record<string, string | undefined>) {
  if (args.some(arg => arg !== '--apply') || args.length > 1) throw new Error('RETENTION_ARGUMENT_INVALID');
  const apply = args.includes('--apply');
  if (apply && environment.FORGELEX_RETENTION_EXECUTION_ENABLED !== 'true') throw new Error('RETENTION_EXECUTION_NOT_AUTHORIZED');
  // Validate the same cutoffs without enabling the in-process worker.
  const { enabled: _enabled, ...policy } = resolveRetentionPolicy({ ...environment, FORGELEX_RETENTION_WORKER_ENABLED: 'true' });
  return { apply, policy };
}

export async function runRetentionCommand(args: string[], environment: Record<string, string | undefined>) {
  const command = resolveRetentionCommand(args, environment);
  const url = environment.FORGELEX_DATABASE_URL ?? environment.DATABASE_URL;
  if (!url) throw new Error('RETENTION_DATABASE_REQUIRED');
  const connection = await createDatabase({ url });
  const now = new Date();
  try {
    const service = new OperationalRetentionService(connection.client, command.policy);
    const counts = await (command.apply ? service.purge(now) : service.inspect(now));
    return { event: 'retention.completed', mode: command.apply ? 'apply' : 'inspect', measuredAt: now.toISOString(), policy: command.policy, counts };
  } finally { connection.client.close(); }
}
