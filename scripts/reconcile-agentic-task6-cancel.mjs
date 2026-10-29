import { readFile, writeFile, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createDatabase } from '../packages/persistence/dist/index.js';
import { InferenceBudgetService, LedgerService } from '../packages/billing-ledger/dist/index.js';

// Local accounting only. Never loads a credential, calls a provider or funds an account.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, '.superpowers/sdd/2026-10-10-agentic-workspace-transition/task6-pilot');
const lockPath = resolve(directory, 'running.lock');
const lock = await open(lockPath, 'wx');
let connection;
try {
  const report = JSON.parse(await readFile(resolve(directory, 'evidence.json'), 'utf8'));
  if (report.provider !== 'openai' || report.model !== 'gpt-6.1-sol' || report.ceilingCents !== 500)
    throw new Error('PILOT_APPROVAL_INVALID');
  const cancellation = report.attempts.filter((a) => a.caseId === 'T6-CANCEL').at(-1);
  if (
    cancellation?.status !== 'CANCELLED' ||
    cancellation.dispatched !== true ||
    !cancellation.events.some((e) => e.code === 'SESSION_CANCELLED')
  )
    throw new Error('CANCELLATION_EVIDENCE_INVALID');
  connection = await createDatabase({ url: 'file:' + resolve(directory, 'pilot.sqlite').replaceAll('\\', '/') });
  const { db, client } = connection;
  const owner = { tenantId: 'boni-task6-synthetic-only', userId: 'boni' };
  const rows = await client.execute('SELECT payload_json FROM inference_calls');
  const calls = rows.rows.map((r) => JSON.parse(String(r.payload_json)));
  const target = calls.filter((c) => c.executionId === cancellation.executionId);
  if (
    calls.length !== report.observations.length ||
    target.length !== 1 ||
    target[0].upperBoundCents !== 4 ||
    !['RECONCILIATION_REQUIRED', 'PROVISIONED'].includes(target[0].status) ||
    calls.some((c) => c.tenantId !== owner.tenantId || c.userId !== owner.userId)
  )
    throw new Error('PILOT_ACCOUNTING_INVALID');
  const covered = calls.reduce(
    (sum, c) => sum + (c.status === 'SETTLED' ? c.settlement.actualCostCents : c.upperBoundCents),
    0,
  );
  if (covered > 500) throw new Error('PILOT_CEILING_EXCEEDED');
  const evidenceHash = createHash('sha256').update(JSON.stringify(cancellation)).digest('hex');
  const service = new InferenceBudgetService(db, client);
  const ledger = new LedgerService(db, client, { migrationMode: 'verify' });
  const before = await ledger.getAvailableBalanceCents(owner.tenantId);
  const provision = await service.provisionCancelledProviderCall(owner, cancellation.executionId, {
    callId: target[0].callId,
    approvalReference: 'boni-task6',
    evidenceReference: 'sha256:' + evidenceHash,
  });
  const budget = await service.releaseUnusedBudget(owner, cancellation.executionId);
  const after = await ledger.getAvailableBalanceCents(owner.tenantId);
  const receipt = {
    version: 1,
    reconciliation: 'CLOSED_WITH_CONSERVATIVE_PROVISION',
    provider: 'openai',
    model: 'gpt-6.1-sol',
    executionId: cancellation.executionId,
    callId: target[0].callId,
    providerActualCostCents: null,
    providerUsage: null,
    providerInvoiceReconciled: false,
    noNewProviderCalls: true,
    noCustomerDebit: true,
    evidenceHash,
    approvalReference: 'boni-task6',
    status: provision.status,
    provision: provision.provision,
    budgetStatus: budget.status,
    remainingEscrowCents: budget.remainingPaidCents + budget.remainingPromoCents,
    availableBeforeCents: before,
    availableAfterCents: after,
    totalLocalAccountedCents: covered,
    ceilingCents: 500,
    recordedAt: provision.provision.recordedAt,
  };
  if (receipt.status !== 'PROVISIONED' || receipt.remainingEscrowCents !== 0 || before !== after)
    throw new Error('PILOT_ACCOUNTING_INVALID');
  await writeFile(resolve(directory, 'cancellation-reconciliation.json'), JSON.stringify(receipt, null, 2) + '\n');
  await writeFile(
    resolve(root, 'docs/architecture/evidence/2026-10-28-task6-cancellation-reconciliation.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  process.stdout.write(JSON.stringify(receipt) + '\n');
} finally {
  connection?.client.close();
  await lock.close();
  await unlink(lockPath);
}
