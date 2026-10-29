import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AgenticWorkspaceRepository,
  createDatabase,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';

// Always creates its own temporary database; never migrates an existing project database.
const file = fileURLToPath(import.meta.url);
if (process.argv[2] === '--recover') {
  const { db, client } = await createDatabase({ url: process.env.FORGELEX_AGENTIC_TEST_URL });
  try {
    const { owner, conversationId, executionId } = JSON.parse(process.env.FORGELEX_AGENTIC_TEST_FIXTURE);
    const repo = new AgenticWorkspaceRepository(db);
    const conversation = await repo.getConversation(owner, conversationId);
    assert.equal(conversation.contexts.length, 2);
    assert.equal(conversation.messages.length, 2);
    assert.deepEqual(conversation.messages[1].answer.selectedOptionIds, ['research']);
    const execution = await repo.getExecution(owner, executionId);
    assert.deepEqual(execution.checkpoint, { step: 'research' });
    assert.deepEqual(execution.deliveryIds, ['partial']);
    assert.equal(execution.requiresReevaluation, true);
    assert.equal((await repo.listEventsAfter(owner, executionId, 0)).length, 20);
    const successor = await repo.createExecution(owner, {
      conversationId,
      contextRevision: 2,
      idempotencyKey: 'successor',
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    assert.equal(successor.contextRevision, 2);
    console.log('RECOVERY_PASSED');
  } finally {
    client.close();
  }
} else {
  const name = `forgelex-agentic-test-${randomUUID().slice(0, 8)}`;
  const password = randomUUID();
  let started = false;
  let first, second;
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
        'POSTGRES_DB=forgelex_agentic_test',
        'postgres:16-alpine',
      ],
      { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: 'pipe' },
    );
    started = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      const check = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'forgelex_agentic_test'], {
        stdio: 'pipe',
      });
      if (check.status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready, 'TEMPORARY_POSTGRES_NOT_READY');
    const mapping = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim();
    const port = mapping.split(':').at(-1);
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/forgelex_agentic_test`;
    first = await createDatabase({ url });
    await runPersistenceMigrations(first.client);
    await runPersistenceMigrations(first.client);
    second = await createDatabase({ url });
    const a = new AgenticWorkspaceRepository(first.db),
      b = new AgenticWorkspaceRepository(second.db);
    const owner = { tenantId: 'synthetic-a', userId: 'author' };
    const context = { text: 'Contexto sintético informado pelo usuário', origin: 'USER', documents: [] };
    const conversation = await a.createConversation(owner, { objective: 'Pesquisar', context });
    const input = {
      conversationId: conversation.id,
      contextRevision: 1,
      idempotencyKey: 'initial',
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    };
    const runs = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).createExecution(owner, input)));
    assert.equal(new Set(runs.map((r) => r.id)).size, 1);
    const execution = runs[0];
    const swaps = await Promise.all([
      a.compareAndSetStatus(owner, execution.id, 'QUEUED', 'RUNNING', {
        checkpoint: { step: 'research' },
        deliveryIds: ['partial'],
      }),
      b.compareAndSetStatus(owner, execution.id, 'QUEUED', 'RUNNING', {
        checkpoint: { step: 'research' },
        deliveryIds: ['partial'],
      }),
    ]);
    assert.deepEqual(swaps.sort(), [false, true]);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        (i % 2 ? a : b).appendEvent(owner, execution.id, { type: 'STATUS', payload: { i } }),
      ),
    );
    assert.deepEqual(
      (await a.listEventsAfter(owner, execution.id, 0)).map((e) => e.sequence),
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    for (const stranger of [
      { ...owner, tenantId: 'synthetic-b' },
      { ...owner, userId: 'stranger' },
    ]) {
      assert.equal(await b.getExecution(stranger, execution.id), undefined);
      assert.equal(await b.getConversation(stranger, conversation.id), undefined);
      await assert.rejects(b.listEventsAfter(stranger, execution.id, 0));
    }
    await a.askQuestion(owner, execution.id, {
      id: 'q1',
      version: 1,
      contextRevision: 1,
      prompt: 'Qual objetivo?',
      selection: 'single',
      options: [{ id: 'research', label: 'Pesquisar' }],
      allowFreeText: true,
      allowUnknown: true,
      reason: 'Delimitar objetivo',
    });
    const answer = { questionId: 'q1', questionVersion: 1, contextRevision: 1, selectedOptionIds: ['research'] };
    const replies = await Promise.allSettled([
      a.answerQuestion(owner, execution.id, answer),
      b.answerQuestion(owner, execution.id, answer),
    ]);
    assert.equal(replies.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(replies.filter((r) => r.status === 'rejected').length, 1);
    assert.equal((await first.client.execute('SELECT id FROM legal_documents')).rows.length, 0);
    const concurrentConversation = await a.createConversation(owner, { objective: 'Leitura concorrente', context });
    await Promise.all([
      (async () => {
        for (let revision = 1; revision <= 20; revision++)
          await b.reviseContext(owner, concurrentConversation.id, revision, {
            ...context,
            text: `Revisão ${revision + 1}`,
          });
      })(),
      (async () => {
        for (let i = 0; i < 60; i++) {
          const snapshot = await a.getConversation(owner, concurrentConversation.id);
          assert.equal(
            snapshot.contextRevision,
            snapshot.contexts.at(-1).revision,
            'INCONSISTENT_CONVERSATION_SNAPSHOT',
          );
          assert.equal(snapshot.contextRevision, snapshot.contexts.length, 'INCONSISTENT_CONVERSATION_HISTORY');
        }
      })(),
    ]);
    first.client.close();
    first = undefined;
    second.client.close();
    second = undefined;
    const recovery = spawnSync(process.execPath, [file, '--recover'], {
      env: {
        ...process.env,
        FORGELEX_AGENTIC_TEST_URL: url,
        FORGELEX_AGENTIC_TEST_FIXTURE: JSON.stringify({
          owner,
          conversationId: conversation.id,
          executionId: execution.id,
        }),
      },
      encoding: 'utf8',
      timeout: 30000,
    });
    // Do not print child errors: database connection strings may contain credentials.
    assert.equal(recovery.status, 0, 'SEPARATE_PROCESS_RECOVERY_FAILED');
    assert.match(recovery.stdout, /RECOVERY_PASSED/);
    console.log(
      JSON.stringify({
        status: 'passed',
        checks: [
          'additive_migration_twice',
          'concurrent_execution_idempotency',
          'concurrent_status_compare_and_set',
          'concurrent_event_sequence',
          'tenant_and_user_isolation',
          'concurrent_answer_once',
          'consistent_concurrent_conversation_reads',
          'no_fictitious_documents',
          'separate_process_recovery',
          'successor_from_revised_context',
        ],
      }),
    );
  } finally {
    first?.client.close();
    second?.client.close();
    if (started) execFileSync('docker', ['rm', '--force', name], { stdio: 'pipe' });
  }
}
