import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  runPersistenceMigrations,
  AgenticWorkspaceRepository,
} from '../packages/persistence/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { ExecutionService } from '../apps/api/dist/agentic-workspace/execution-service.js';
import { ExecutionWorker } from '../apps/api/dist/agentic-workspace/execution-worker.js';

const file = fileURLToPath(import.meta.url),
  owner = { tenantId: 'runtime-synthetic', userId: 'author' };
const options = { executorAvailable: true, now: () => 100000 };
const input = { objective: 'Trabalho sintético', context: { text: 'Contexto escrito', origin: 'USER', documents: [] } };
if (process.argv[2] === '--recover') {
  const c = await createDatabase({ url: process.env.FORGELEX_RUNTIME_TEST_URL });
  try {
    const { uncertainId, safeId } = JSON.parse(process.env.FORGELEX_RUNTIME_TEST_IDS);
    const service = new ExecutionService(c.db, c.client, { ...options, now: () => 100101 });
    let calls = 0;
    const worker = new ExecutionWorker(service, {
      next: ({ execution }) => {
        assert.equal(execution.id, safeId);
        assert.equal(execution.checkpoint.step, 1);
        return {
          callId: 'next-safe',
          run: async () => {
            calls++;
            return { kind: 'completed', checkpoint: { step: 2 } };
          },
        };
      },
    });
    await worker.runOnce();
    await worker.runOnce();
    assert.equal(calls, 1);
    assert.equal((await service.getExecution(owner, safeId)).status, 'COMPLETED');
    const uncertain = await service.getExecution(owner, uncertainId);
    assert.equal(uncertain.status, 'FAILED');
    assert.deepEqual(uncertain.deliveryIds, ['partial']);
    await assert.rejects(
      service.continueFromCheckpoint(owner, uncertainId, 'blind-continue'),
      /RECONCILIATION_REQUIRED/,
    );
    const events = await service.listClientEvents(owner, uncertainId, 0);
    assert.ok(events.events.some((e) => e.type === 'ERROR' && e.payload.code === 'RECONCILIATION_REQUIRED'));
    assert.ok(!JSON.stringify(events).includes('private-prompt'));
    assert.equal(
      (
        await c.client.execute({
          sql: "SELECT id FROM agentic_execution_calls WHERE execution_id=? AND call_id='uncertain'",
          args: [uncertainId],
        })
      ).rows.length,
      1,
    );
    console.log('RECOVERY_PASSED');
  } finally {
    c.client.close();
  }
} else {
  const name = `forgelex-runtime-test-${randomUUID().slice(0, 8)}`,
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
        'POSTGRES_DB=forgelex_runtime_test',
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
          ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'forgelex_runtime_test'],
          { stdio: 'pipe' },
        ).status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'TEMPORARY_POSTGRES_NOT_READY');
    const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/forgelex_runtime_test`;
    a = await createDatabase({ url });
    b = await createDatabase({ url });
    await runPersistenceMigrations(a.client);
    await runPersistenceMigrations(a.client);
    await new LedgerService(a.db, a.client).runMigrations();
    const left = new ExecutionService(a.db, a.client, options),
      right = new ExecutionService(b.db, b.client, options);
    const reversedOwner = { userId: owner.userId, tenantId: owner.tenantId };
    const runs = await Promise.all([
      left.startExecution(owner, 'same-start', input),
      right.startExecution(reversedOwner, 'same-start', input),
    ]);
    assert.equal(runs[0].id, runs[1].id);
    assert.equal((await a.client.execute('SELECT id FROM agentic_conversations')).rows.length, 1);
    let calls = 0;
    const driver = {
      next: () => ({
        callId: 'one',
        run: async () => {
          calls++;
          return { kind: 'completed', checkpoint: { done: true }, deliveryIds: ['first-delivery'] };
        },
      }),
    };
    await Promise.all([new ExecutionWorker(left, driver).runOnce(), new ExecutionWorker(right, driver).runOnce()]);
    assert.equal(calls, 1);
    assert.equal((await left.getExecution(owner, runs[0].id)).status, 'COMPLETED');
    const questionRun = await left.startExecution(owner, 'question', {
      objective: 'Esclarecer',
      conversationId: runs[0].conversationId,
    });
    const question = {
      id: 'q',
      version: 1,
      contextRevision: 1,
      prompt: 'Finalidade?',
      selection: 'single',
      options: [{ id: 'a', label: 'Pesquisar' }],
      allowFreeText: true,
      allowUnknown: true,
      reason: 'Delimitar',
    };
    await new ExecutionWorker(left, {
      next: () => ({ callId: 'ask', run: async () => ({ kind: 'question', checkpoint: { awaiting: 'q' }, question }) }),
    }).runOnce();
    const answer = { questionId: 'q', questionVersion: 1, contextRevision: 1, selectedOptionIds: ['a'] };
    const replies = await Promise.all([
      left.answerExecution(owner, questionRun.id, 'same-answer', answer),
      right.answerExecution(reversedOwner, questionRun.id, 'same-answer', answer),
    ]);
    assert.equal(replies[0].id, replies[1].id);
    assert.equal(
      (await new AgenticWorkspaceRepository(a.db).getConversation(owner, runs[0].conversationId)).messages.filter(
        (m) => m.answer,
      ).length,
      1,
    );
    assert.equal((await new AgenticWorkspaceRepository(a.db).getExecution(owner, replies[0].id)).checkpoint, null);
    await left.cancelExecution(owner, replies[0].id, 'cancel-successor');
    await assert.rejects(right.getExecution({ ...owner, userId: 'other' }, runs[0].id), /NOT_FOUND/);
    const uncertain = await left.startExecution(owner, 'uncertain', {
      objective: 'Dispatch incerto',
      conversationId: runs[0].conversationId,
    });
    const lease = await left.claimNext('lost-worker', 100);
    assert.equal(lease.executionId, uncertain.id);
    await left.beginStep(lease, 'confirmed');
    await left.finishStep(lease, 'confirmed', {
      kind: 'checkpoint',
      checkpoint: { step: 1 },
      deliveryIds: ['partial'],
      events: [{ type: 'INTERNAL', payload: { prompt: 'private-prompt' } }],
    });
    await left.beginStep(lease, 'uncertain');
    const safe = await right.startExecution(owner, 'safe', {
      objective: 'Checkpoint seguro',
      conversationId: runs[0].conversationId,
    });
    const safeLease = await right.claimNext('other-lost-worker', 100);
    assert.equal(safeLease.executionId, safe.id);
    await right.beginStep(safeLease, 'confirmed');
    await right.finishStep(safeLease, 'confirmed', { kind: 'checkpoint', checkpoint: { step: 1 } });
    a.client.close();
    a = undefined;
    b.client.close();
    b = undefined;
    const recovered = spawnSync(process.execPath, [file, '--recover'], {
      env: {
        ...process.env,
        FORGELEX_RUNTIME_TEST_URL: url,
        FORGELEX_RUNTIME_TEST_IDS: JSON.stringify({ uncertainId: uncertain.id, safeId: safe.id }),
      },
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(recovered.status, 0, 'SEPARATE_PROCESS_RECOVERY_FAILED');
    assert.match(recovered.stdout, /RECOVERY_PASSED/);
    console.log(
      JSON.stringify({
        status: 'passed',
        checks: [
          'migration_twice',
          'concurrent_start_one_conversation',
          'canonical_owner_lock',
          'concurrent_workers_one_call',
          'concurrent_answer_one_successor',
          'fresh_checkpoint_after_answer',
          'owner_isolation',
          'separate_process_recovery',
          'safe_checkpoint_resume',
          'uncertain_dispatch_not_repeated',
          'partial_delivery_preserved',
          'internal_events_not_projected',
        ],
      }),
    );
  } finally {
    a?.client.close();
    b?.client.close();
    if (started) execFileSync('docker', ['rm', '--force', name], { stdio: 'pipe' });
  }
}
