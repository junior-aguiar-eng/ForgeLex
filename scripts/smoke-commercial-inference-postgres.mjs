import assert from 'node:assert/strict';
import postgres from 'postgres';
import {
  createDatabase,
  runPersistenceMigrations,
  AgenticWorkspaceRepository,
} from '../packages/persistence/dist/index.js';
import {
  runLedgerMigrations,
  LedgerService,
  BillingService,
  CommercialInferenceService,
  COMMERCIAL_POLICY_VERSION,
} from '../packages/billing-ledger/dist/index.js';
import { AccountClosureBillingRetention } from '../apps/api/dist/account/account-closure-billing-retention.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';
import { createCommercialRuntime } from '../apps/api/dist/agentic-workspace/commercial-runtime.js';
import {
  adminConnectionUrl,
  disposableName,
  createDisposableDatabase,
  databaseUrl,
  dropDisposableDatabase,
} from './account-closure-test-db.mjs';

const admin = adminConnectionUrl(),
  name = disposableName('forgelex_closure_smoke_');
const checks = [];
let first, second, locker;
await createDisposableDatabase(admin, name);
try {
  const url = databaseUrl(admin, name);
  first = await createDatabase({ url });
  second = await createDatabase({ url });
  locker = postgres(url, { max: 2 });
  await runPersistenceMigrations(first.client);
  await runLedgerMigrations(first.client);
  const ledger = new LedgerService(first.db, first.client, { migrationMode: 'verify' });
  const billing = new BillingService(second.db, second.client);
  async function waitingForWallet() {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const [row] =
        await locker`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=${name} AND wait_event_type='Lock'`;
      if (row.count > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('WALLET_LOCK_NOT_OBSERVED');
  }
  for (const kind of ['credit', 'debit', 'refund']) {
    const tenantId = 'wallet-' + kind;
    await ledger.provisionAccount(tenantId, { paidBalanceCents: 0, promotionalBalanceCents: 0 });
    await billing.creditPurchase({
      tenantId,
      purchaseId: 'seed-' + kind,
      amountCents: 1000,
      idempotencyKey: 'seed-' + kind,
    });
    let result;
    await locker.begin(async (tx) => {
      // Simulates the committed-value boundary of an in-flight BRL500 escrow.
      await tx`UPDATE ledger_accounts SET paid_balance_cents=500 WHERE tenant_id=${tenantId}`;
      const pending =
        kind === 'credit'
          ? billing.creditPurchase({
              tenantId,
              purchaseId: 'new-credit',
              amountCents: 2500,
              idempotencyKey: 'concurrent-credit',
            })
          : kind === 'debit'
            ? billing.debitPaidCredits({ tenantId, amountCents: 600, idempotencyKey: 'concurrent-debit' })
            : billing.refundUnusedCredits({
                tenantId,
                purchaseId: 'seed-' + kind,
                amountCents: 600,
                idempotencyKey: 'concurrent-refund',
              });
      result = pending.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      await waitingForWallet();
    });
    const outcome = await result;
    const [account] = await locker`SELECT paid_balance_cents FROM ledger_accounts WHERE tenant_id=${tenantId}`;
    if (kind === 'credit') {
      assert.equal(outcome.error, undefined);
      assert.equal(account.paid_balance_cents, 3000);
    } else {
      assert.ok(outcome.error);
      assert.match(outcome.error.message, /BILLING_(INSUFFICIENT_PAID_BALANCE|REFUND_BALANCE_INCONSISTENT)/);
      assert.equal(account.paid_balance_cents, 500);
    }
    checks.push(`${kind}_waits_and_reads_committed_escrow_balance`);
  }
  const owner = { tenantId: 'commercial-owner', userId: 'commercial-user' };
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 2000, promotionalBalanceCents: 0 });
  const repo = new AgenticWorkspaceRepository(first.db);
  const conversation = await repo.createConversation(owner, {
    objective: 'Ensaio comercial sintético',
    context: { text: '', origin: 'USER', documents: [] },
  });
  async function execution(key) {
    const e = await repo.createExecution(owner, {
      conversationId: conversation.id,
      contextRevision: 1,
      idempotencyKey: key,
      authorizationId: 'synthetic-commercial',
      budgetReservationId: null,
      provider: 'openai',
      model: 'gpt-6.1-sol',
    });
    return {
      executionId: e.id,
      idempotencyKey: key,
      requestFingerprint: key,
      policyVersion: COMMERCIAL_POLICY_VERSION,
    };
  }
  const finance = new CommercialInferenceService(first.db, first.client),
    otherFinance = new CommercialInferenceService(second.db, second.client);
  const a = await execution('a'),
    b = await execution('b');
  const attempts = await Promise.allSettled([finance.reserve(owner, a), otherFinance.reserve(owner, b)]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  const admitted = attempts[0].status === 'fulfilled' ? a : b;
  const [reserved] = await locker`SELECT paid_balance_cents FROM ledger_accounts WHERE tenant_id=${owner.tenantId}`;
  assert.equal(reserved.paid_balance_cents, 1500);
  checks.push('two_connections_admit_one_active_execution');
  await finance.authorizeCall(owner, admitted.executionId, {
    callId: 'measured',
    inputTokens: 100,
    maxOutputTokens: 20,
    upperBoundMicroUsd: 400,
  });
  await finance.settleCall(owner, admitted.executionId, 'measured', {
    inputTokens: 100,
    outputTokens: 20,
    cachedInputTokens: 0,
  });
  const receipt = await finance.finalize(owner, admitted.executionId, { usableDelivery: true, outcome: 'COMPLETED' });
  assert.equal(receipt.chargedCents, 50);
  assert.equal(receipt.releasedCents, 450);
  const [settled] = await locker`SELECT paid_balance_cents FROM ledger_accounts WHERE tenant_id=${owner.tenantId}`;
  assert.equal(settled.paid_balance_cents, 1950);
  const replay = await otherFinance.finalize(owner, admitted.executionId, {
    usableDelivery: true,
    outcome: 'COMPLETED',
  });
  assert.equal(replay.chargedCents, 50);
  checks.push('measured_settlement_releases_once_without_duplicate_charge');
  await new AccountClosureBillingRetention(first.client).minimize({
    ...owner,
    tenantPseudonym: 'closed-commercial',
    userPseudonym: 'closed-user',
  });
  const [retained] =
    await locker`SELECT tenant_id,user_id,payload_json FROM commercial_executions WHERE execution_id=${admitted.executionId}`;
  assert.equal(retained.tenant_id, 'closed-commercial');
  assert.equal(retained.user_id, 'closed-user');
  assert.equal(JSON.parse(retained.payload_json).chargedCents, 50);
  checks.push('terminal_commercial_finance_minimized_on_postgres');
  for (const kind of ['question', 'reconciliation', 'held-question']) {
    const subject = { tenantId: `closure-commercial-${kind}`, userId: `user-${kind}` };
    await ledger.provisionAccount(subject.tenantId, { paidBalanceCents: 2000, promotionalBalanceCents: 0 });
    let providerCalls = 0;
    const commercial = await createCommercialRuntime(first.db, first.client, {
      FORGELEX_COMMERCIAL_EXECUTION_ENABLED: 'true', FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true',
      DATABASE_URL: url,
    }, {
      apiKey: 'synthetic-key', authorizeOwner: async () => {},
      transport: async () => { providerCalls++; throw new Error('PROVIDER_MUST_NOT_BE_CALLED'); },
    });
    const run = await commercial.start(subject, `closure-${kind}`, {
      objective: 'Ensaio de exclusão sintético', confirmed: true, policyVersion: COMMERCIAL_POLICY_VERSION,
    });
    const lease = await commercial.service.claimNext(`closure-worker-${kind}`);
    assert.equal(lease.executionId, run.id);
    await commercial.service.beginStep(lease, 'step');
    if (kind === 'reconciliation') {
      await commercial.finance.authorizeCall(subject, run.id, {
        callId: 'http', inputTokens: 1000, maxOutputTokens: 1000, upperBoundMicroUsd: 12000,
      });
      await commercial.service.failLease(lease);
    } else {
      await commercial.service.finishStep(lease, 'step', {
        kind: 'question', checkpoint: {}, question: {
          id: 'purpose', version: 1, contextRevision: 1, prompt: 'Finalidade?', selection: 'free_text',
          options: [], allowFreeText: true, allowUnknown: true, reason: 'Delimitar',
        },
      });
    }
    const before = await commercial.finance.getReceipt(subject, run.id);
    assert.equal(before.chargedCents, 0);
    assert.equal(before.releasedCents, 500);
    const closureId = `closure-${kind}`, now = new Date().toISOString();
    if (kind === 'held-question') {
      await first.client.execute({
        sql: 'INSERT INTO account_closures(id,subject_hash,user_hash,tenant_hash,status_token_hash,idempotency_key_hash,request_fingerprint,policy_version,status,requested_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        args: [closureId, closureId, closureId, closureId, closureId, closureId, 'fingerprint', 'policy', 'PURGING', now, now],
      });
      await first.client.execute({
        sql: "INSERT INTO retention_exceptions(id,closure_id,category,legal_basis_reference,authority_reference,responsible,starts_at,review_at,status) VALUES(?,?,'SESSIONS','LEGAL_HOLD','case','Boni',?,?,'ACTIVE')",
        args: [closureId, closureId, now, now],
      });
    }
    const purge = new AccountClosurePurgeService(first.client);
    assert.equal((await purge.purgePrivateContent({ tenantId: subject.tenantId, closureId })).remainingPrivateRows, 0);
    if (kind === 'held-question') {
      assert.equal((await repo.getExecution(subject, run.id)).status, 'CANCELLED');
      await first.client.execute({sql: "UPDATE retention_exceptions SET status='RELEASED' WHERE id=?", args: [closureId]});
      await purge.purgePrivateContent({ tenantId: subject.tenantId, closureId });
    }
    const [remaining] = await locker`SELECT COUNT(*)::int AS count FROM agentic_conversations WHERE tenant_id=${subject.tenantId}`;
    assert.equal(remaining.count, 0);
    await new AccountClosureBillingRetention(first.client).minimize({ ...subject,
      tenantPseudonym: `closed-${kind}`, userPseudonym: `closed-user-${kind}`,
    });
    const [retainedClosure] = await locker`SELECT payload_json FROM commercial_executions WHERE execution_id=${run.id}`;
    const after = JSON.parse(retainedClosure.payload_json);
    for (const field of ['chargedCents', 'releasedCents', 'uncertainMicroUsd']) assert.equal(after[field], before[field]);
    assert.equal(providerCalls, 0);
    checks.push(`${kind}_drains_purges_and_preserves_finance_on_postgres`);
  }
  console.log(JSON.stringify({ status: 'passed', checks, providerCalls: 0 }));
} finally {
  await locker?.end();
  first?.client.close();
  second?.client.close();
  await dropDisposableDatabase(admin, name);
}
