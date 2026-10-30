import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  runPersistenceMigrations,
  AgenticWorkspaceRepository,
} from '../packages/persistence/dist/index.js';
import { LedgerService, InferenceBudgetService } from '../packages/billing-ledger/dist/index.js';

const file = fileURLToPath(import.meta.url);
const policy = {
  id: 'synthetic',
  version: '1',
  approvalReference: 'fixture-only',
  provider: 'fake',
  model: 'fake',
  maxCalls: 4,
  maxInputTokens: 1000,
  maxOutputTokens: 1000,
  inputCentsPerMillion: 10000,
  outputCentsPerMillion: 10000,
};
const owner = { tenantId: 'synthetic-budget', userId: 'author' };
const quote = { callId: 'model-1', upperBoundCents: 20, inputTokens: 1000, maxOutputTokens: 1000 };
const usage = { provider: 'fake', model: 'fake', inputTokens: 500, outputTokens: 500 };

if (process.argv[2] === '--recover') {
  const c = await createDatabase({ url: process.env.FORGELEX_INFERENCE_TEST_URL });
  try {
    const { settledExecutionId, uncertainExecutionId } = JSON.parse(process.env.FORGELEX_INFERENCE_TEST_IDS);
    const service = new InferenceBudgetService(c.db, c.client),
      ledger = new LedgerService(c.db, c.client, { migrationMode: 'verify' });
    assert.equal((await service.authorizeProviderCall(owner, settledExecutionId, quote)).shouldExecute, false);
    await service.settleProviderCall(owner, settledExecutionId, { callId: quote.callId, usage, actualCostCents: 10 });
    await service.releaseUnusedBudget(owner, uncertainExecutionId);
    assert.equal(await ledger.getAvailableBalanceCents(owner.tenantId), 55);
    assert.equal((await ledger.getUsageEvents(owner.tenantId)).length, 2);
    await assert.rejects(
      service.authorizeProviderCall(owner, uncertainExecutionId, { ...quote, callId: 'new' }),
      /BUDGET_NOT_ACTIVE/,
    );
    console.log('RECOVERY_PASSED');
  } finally {
    c.client.close();
  }
} else {
  const name = `forgelex-inference-test-${randomUUID().slice(0, 8)}`,
    password = randomUUID();
  let started = false,
    a,
    b;
  try {
    execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--detach',
        '--name',
        name,
        '-p',
        '127.0.0.1::5432',
        '-e',
        'POSTGRES_PASSWORD',
        '-e',
        'POSTGRES_DB=forgelex_inference_test',
        'postgres:16-alpine',
      ],
      { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: 'pipe' },
    );
    started = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (
        spawnSync(
          'docker',
          ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'forgelex_inference_test'],
          {
            stdio: 'pipe',
          },
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'TEMPORARY_POSTGRES_NOT_READY');
    const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/forgelex_inference_test`;
    a = await createDatabase({ url });
    b = await createDatabase({ url });
    await runPersistenceMigrations(a.client);
    const ledger = new LedgerService(a.db, a.client);
    await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    await ledger.runMigrations();
    const left = new InferenceBudgetService(a.db, a.client),
      right = new InferenceBudgetService(b.db, b.client);
    const repo = new AgenticWorkspaceRepository(a.db);
    const conversation = await repo.createConversation(owner, {
      objective: 'Orçamento sintético',
      context: { text: 'Teste', origin: 'USER', documents: [] },
    });
    const executions = [];
    for (let i = 0; i < 8; i++)
      executions.push(
        await repo.createExecution(owner, {
          conversationId: conversation.id,
          contextRevision: 1,
          idempotencyKey: `execution-${i}`,
          authorizationId: 'fixture-consent',
          budgetReservationId: null,
          provider: null,
          model: null,
        }),
      );
    const results = await Promise.allSettled(
      executions.map((e, i) =>
        (i % 2 ? left : right).reserveExecutionBudget({
          ...owner,
          executionId: e.id,
          maxCostCents: 20,
          idempotencyKey: `budget-${i}`,
          policy,
        }),
      ),
    );
    const budgets = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    assert.equal(budgets.length, 5);
    assert.equal(await ledger.getAvailableBalanceCents(owner.tenantId), 0);
    const settledExecutionId = budgets[0].executionId;
    const authorizations = await Promise.all([
      left.authorizeProviderCall(owner, settledExecutionId, quote),
      right.authorizeProviderCall(owner, settledExecutionId, quote),
    ]);
    assert.equal(authorizations.filter((c) => c.shouldExecute).length, 1);
    await Promise.all([
      left.settleProviderCall(owner, settledExecutionId, { callId: quote.callId, usage, actualCostCents: 10 }),
      right.settleProviderCall(owner, settledExecutionId, { callId: quote.callId, usage, actualCostCents: 10 }),
    ]);
    for (const budget of budgets) await left.releaseUnusedBudget(owner, budget.executionId);
    assert.equal(await ledger.getAvailableBalanceCents(owner.tenantId), 90);
    const unused = executions.find((e) => !budgets.some((budget) => budget.executionId === e.id));
    const uncertainExecutionId = unused.id;
    await left.reserveExecutionBudget({
      ...owner,
      executionId: uncertainExecutionId,
      maxCostCents: 60,
      idempotencyKey: 'mixed-budget',
      policy,
    });
    let researchCalls = 0,
      unblock,
      signalStarted;
    const gate = new Promise((resolve) => {
      unblock = resolve;
    });
    const researchStarted = new Promise((resolve) => {
      signalStarted = resolve;
    });
    const research = {
      callId: 'research-1',
      idempotencyKey: 'stj-original-key',
      requestFingerprint: 'synthetic-query',
      costCents: 15,
      operation: async () => {
        researchCalls++;
        signalStarted();
        await gate;
        return { results: [] };
      },
    };
    const original = left.executeResearchCall(owner, uncertainExecutionId, research);
    await researchStarted;
    await a.client.execute({
      sql: "UPDATE billing_operations SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE idempotency_key=?",
      args: [research.idempotencyKey],
    });
    try {
      await assert.rejects(right.executeResearchCall(owner, uncertainExecutionId, research), /CALL_ALREADY_AUTHORIZED/);
    } finally {
      unblock();
      await original;
    }
    await right.executeResearchCall(owner, uncertainExecutionId, research);
    assert.equal(researchCalls, 1);
    assert.equal(await ledger.getSettledChargeCents(owner.tenantId, research.idempotencyKey), 15);
    await left.authorizeProviderCall(owner, uncertainExecutionId, { ...quote, callId: 'uncertain' });
    await left.settleProviderCall(owner, uncertainExecutionId, {
      callId: 'uncertain',
      usage: null,
      actualCostCents: null,
    });
    await left.releaseUnusedBudget(owner, uncertainExecutionId);
    assert.equal(await ledger.getAvailableBalanceCents(owner.tenantId), 55);
    await assert.rejects(right.releaseUnusedBudget({ ...owner, userId: 'other' }, uncertainExecutionId), /NOT_FOUND/);
    a.client.close();
    a = undefined;
    b.client.close();
    b = undefined;
    const recovery = spawnSync(process.execPath, [file, '--recover'], {
      env: {
        ...process.env,
        FORGELEX_INFERENCE_TEST_URL: url,
        FORGELEX_INFERENCE_TEST_IDS: JSON.stringify({ settledExecutionId, uncertainExecutionId }),
      },
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(recovery.status, 0, 'SEPARATE_PROCESS_RECOVERY_FAILED');
    assert.match(recovery.stdout, /RECOVERY_PASSED/);
    console.log(
      JSON.stringify({
        status: 'passed',
        checks: [
          'concurrent_budgets_no_overspend',
          'concurrent_call_once',
          'concurrent_settlement_one_debit',
          'research_original_key_and_debit',
          'expired_research_lease_no_redispatch',
          'unknown_usage_keeps_coverage',
          'owner_isolation',
          'separate_process_recovery',
        ],
      }),
    );
  } finally {
    a?.client.close();
    b?.client.close();
    if (started) execFileSync('docker', ['rm', '--force', name], { stdio: 'pipe' });
  }
}
