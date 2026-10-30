import { AgenticExecutionSchema } from '@forgelex/domain';
import type { Client } from '@forgelex/persistence';
import type { ExecutionJob } from '../agentic-workspace/execution-store.js';

/** After commercial finance is terminal, under the tenant and wallet locks.
 * Only idle commercial jobs are drained; active leases and legacy jobs keep the purge gate closed.
 */
export async function drainCommercialClosureJobs(client: Pick<Client, 'execute'>, tenantId: string, now: string) {
  const rows = await client.execute({
    sql: `SELECT j.execution_id,j.user_id,j.state,j.lease_expires_at,j.budget_release_pending,
      j.payload_json AS job_json,e.payload_json AS execution_json,c.payload_json AS finance_json
      FROM agentic_execution_jobs j
      JOIN agentic_executions e ON e.id=j.execution_id AND e.tenant_id=j.tenant_id AND e.user_id=j.user_id
      JOIN commercial_executions c ON c.execution_id=j.execution_id AND c.tenant_id=j.tenant_id AND c.user_id=j.user_id
      WHERE j.tenant_id=? AND j.state IN ('WAITING','RECONCILIATION')`,
    args: [tenantId],
  });
  for (const row of rows.rows) {
    const execution = AgenticExecutionSchema.parse(JSON.parse(String(row.execution_json)));
    const job = JSON.parse(String(row.job_json)) as ExecutionJob;
    const finance = JSON.parse(String(row.finance_json));
    if (
      execution.tenantId !== tenantId ||
      execution.userId !== row.user_id ||
      execution.id !== row.execution_id ||
      execution.authorizationId !== `commercial:${finance.policyVersion}` ||
      execution.provider !== 'openai' ||
      execution.model !== 'gpt-6.1-sol' ||
      finance.executionId !== execution.id ||
      finance.tenantId !== tenantId ||
      finance.userId !== execution.userId ||
      !['COMPLETED', 'FAILED', 'CANCELLED'].includes(finance.status) ||
      job.executionId !== execution.id ||
      job.tenantId !== tenantId ||
      job.userId !== execution.userId ||
      job.state !== row.state ||
      job.leaseToken !== null ||
      job.leaseExpiresAt !== null ||
      row.lease_expires_at !== null ||
      job.budgetReleasePending !== false ||
      Number(row.budget_release_pending) !== 0
    )
      continue;
    const waiting = job.state === 'WAITING' && execution.status === 'WAITING_USER' && job.pendingCallId === null;
    const reconciliation =
      job.state === 'RECONCILIATION' && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(execution.status);
    if (!waiting && !reconciliation) continue;
    const calls = await client.execute({
      sql: 'SELECT state FROM agentic_execution_calls WHERE execution_id=?',
      args: [execution.id],
    });
    if (calls.rows.some((call) => !['CONFIRMED', 'RECONCILIATION'].includes(String(call.state)))) continue;
    const status = waiting ? 'CANCELLED' : execution.status;
    if (waiting)
      await client.execute({
        sql: 'UPDATE agentic_executions SET payload_json=? WHERE id=? AND tenant_id=? AND user_id=?',
        args: [
          JSON.stringify({ ...execution, status, pendingQuestion: null, updatedAt: now }),
          execution.id,
          tenantId,
          execution.userId,
        ],
      });
    await client.execute({
      sql: 'UPDATE agentic_execution_jobs SET state=?,payload_json=? WHERE execution_id=? AND tenant_id=? AND user_id=?',
      args: [
        status,
        JSON.stringify({ ...job, state: status, pendingCallId: null, workerId: null }),
        execution.id,
        tenantId,
        execution.userId,
      ],
    });
  }
}
