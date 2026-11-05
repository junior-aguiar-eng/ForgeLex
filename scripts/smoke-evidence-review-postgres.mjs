import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  runPersistenceMigrations,
  NativeEvidenceReviewRepository,
  ApprovedCaseContextRepository,
  EvidenceReapprovalRepository,
  NativeCaseTaskRepository,
  MatterWriteGuard,
  MatterLifecycleRepository,
  MatterPurgeRepository,
} from '../packages/persistence/dist/index.js';
import { createEvidenceFixture } from '../packages/persistence/dist/testing/native-evidence-review-fixture.js';

if (process.argv.includes('--replay-reapproval')) {
  const c = await createDatabase({ url: process.env.FORGELEX_REVIEW_TEST_URL });
  try {
    const { owner, matterId, input, frozen } = JSON.parse(process.env.FORGELEX_REVIEW_TEST_COMMAND);
    assert.equal(
      (await new EvidenceReapprovalRepository(c.db, async () => {}).approve(owner, matterId, input)).isReplay,
      true,
    );
    assert.equal((await new ApprovedCaseContextRepository(c.db).load(owner, matterId, frozen, true)).length, 2);
    console.log('REAPPROVAL_REPLAY_PASSED');
  } finally {
    c.client.close();
  }
} else if (process.argv.includes('--replay')) {
  const c = await createDatabase({ url: process.env.FORGELEX_REVIEW_TEST_URL });
  try {
    const { owner, id, input, matterId, approvedItems } = JSON.parse(process.env.FORGELEX_REVIEW_TEST_COMMAND);
    const result = await new NativeEvidenceReviewRepository(c.db, async () => {}).decide(owner, id, input);
    assert.equal(result.isReplay, true);
    if (approvedItems)
      assert.equal((await new ApprovedCaseContextRepository(c.db).load(owner, matterId, approvedItems)).length, 2);
    console.log('REVIEW_REPLAY_PASSED');
  } finally {
    c.client.close();
  }
} else {
  const name = `forgelex-evidence-review-${randomUUID().slice(0, 8)}`,
    password = randomUUID();
  let started = false,
    f,
    b;
  const checks = [];
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
        'POSTGRES_DB=evidence_test',
        'postgres:16-alpine',
      ],
      { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: 'pipe' },
    );
    started = true;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (
        spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'evidence_test'], {
          stdio: 'pipe',
        }).status === 0
      ) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(ready);
    const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/evidence_test`;
    f = await createEvidenceFixture({ url });
    b = await createDatabase({ url });
    await runPersistenceMigrations(b.client);
    checks.push('migration_idempotent');
    const review = await f.reviews.preview(f.owner, f.saved.id),
      other = new NativeEvidenceReviewRepository(b.db, async () => {});
    const fact = review.items.find((i) => i.kind === 'FACT'),
      proof = review.items.find((i) => i.kind === 'EVIDENCE');
    const command = (r, decisions) => ({
      approved: true,
      commandId: randomUUID(),
      reviewToken: r.reviewToken,
      expectedRevision: r.revision,
      decisions,
    });
    const input = command(review, [
      { itemId: fact.id, action: 'ADOPT' },
      { itemId: proof.id, action: 'ADOPT' },
    ]);
    const before = (await f.client.execute('SELECT payload_json,content_hash FROM agentic_task_deliveries')).rows;
    const results = await Promise.all([
      f.reviews.decide(f.owner, f.saved.id, input),
      other.decide(f.owner, f.saved.id, input),
    ]);
    assert.equal(results.filter((r) => r.isReplay).length, 1);
    assert.equal((await f.client.execute('SELECT id FROM facts')).rows.length, 1);
    assert.equal((await f.client.execute('SELECT id FROM evidence_items')).rows.length, 1);
    checks.push('concurrent_same_command_one_adoption');
    const approvedItems = await new ApprovedCaseContextRepository(f.db).capture(f.owner, f.matter.id);
    const approvedSources = await new ApprovedCaseContextRepository(b.db).load(f.owner, f.matter.id, approvedItems);
    assert.equal(approvedSources.length, 2);
    assert.equal(approvedSources.find((s) => s.kind === 'CASE_FACT').approvedItem.status, 'DISPUTED');
    assert.equal(approvedSources.find((s) => s.kind === 'CASE_EVIDENCE').approvedItem.relation, 'CONTRADICTS');
    assert.deepEqual(
      await new ApprovedCaseContextRepository(b.db).capture({ ...f.owner, userId: 'outro' }, f.matter.id),
      [],
    );
    checks.push('approved_context_cross_connection_owner_and_provenance');
    const conversation = await f.workspace.createConversation(f.owner, {
      matterId: f.matter.id,
      objective: 'Criar peça',
      context: { text: '', origin: 'USER', documents: [], approvedItems },
    });
    const execution = await f.workspace.createExecution(f.owner, {
      conversationId: conversation.id,
      contextRevision: 1,
      idempotencyKey: randomUUID(),
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    await f.workspace.compareAndSetStatus(f.owner, execution.id, 'QUEUED', 'RUNNING');
    const binding = {
      ...f.owner,
      matterId: f.matter.id,
      conversationId: conversation.id,
      contextRevision: 1,
      executionId: execution.id,
      objective: 'Criar peça',
    };
    const native = new NativeCaseTaskRepository(f.db, async () => {});
    const packet = await native.load(binding);
    const saved = await native.save(binding, {
      ...f.delivery,
      action: 'create_document',
      contextId: conversation.id,
      evidenceMatrix: undefined,
      issues: [],
      claims: [],
      sources: packet.sources.map(({ text, ...source }) => source),
      document: {
        title: 'Peça sintética',
        documentType: 'Registro de fatos',
        sections: [{ title: 'Fatos', content: 'Alegação controvertida.', sourceIds: packet.sources.map((s) => s.id) }],
      },
    });
    assert.ok(saved.draftId);
    const section = (await f.client.execute('SELECT linked_fact_ids, linked_evidence_ids FROM draft_sections')).rows[0];
    assert.equal(JSON.parse(section.linked_fact_ids).length, 1);
    assert.equal(JSON.parse(section.linked_evidence_ids).length, 1);
    checks.push('approved_context_native_draft_links');

    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--replay'], {
      env: {
        ...process.env,
        FORGELEX_REVIEW_TEST_URL: url,
        FORGELEX_REVIEW_TEST_COMMAND: JSON.stringify({
          owner: f.owner,
          id: f.saved.id,
          input,
          matterId: f.matter.id,
          approvedItems,
        }),
      },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(child.stdout.includes('REVIEW_REPLAY_PASSED'));
    checks.push('idempotent_recovery_separate_process');
    checks.push('approved_context_recovery_separate_process');
    await f.client.execute("UPDATE facts SET statement='Relato revisto no teste PostgreSQL.'");
    const changesA = new EvidenceReapprovalRepository(f.db, async () => {}),
      changesB = new EvidenceReapprovalRepository(b.db, async () => {});
    const changes = await changesA.preview(f.owner, f.matter.id);
    assert.equal(changes.items.length, 1);
    const reapproval = {
      approved: true,
      commandId: randomUUID(),
      reviewToken: changes.reviewToken,
      items: changes.items.map(({ deliveryId, itemId }) => ({ deliveryId, itemId })),
    };
    const approvedAgain = await Promise.all([
      changesA.approve(f.owner, f.matter.id, reapproval),
      changesB.approve(f.owner, f.matter.id, reapproval),
    ]);
    assert.equal(approvedAgain.filter((r) => r.isReplay).length, 1);
    assert.equal((await f.client.execute('SELECT id FROM facts')).rows.length, 1);
    assert.deepEqual(
      await new ApprovedCaseContextRepository(b.db).load(f.owner, f.matter.id, approvedItems, true),
      approvedSources,
    );
    const nextRefs = await new ApprovedCaseContextRepository(b.db).capture(f.owner, f.matter.id);
    assert.notDeepEqual(nextRefs, approvedItems);
    checks.push('reapproval_concurrent_same_command_one_revision_and_historical_context');
    const recoveredApproval = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--replay-reapproval'], {
      env: {
        ...process.env,
        FORGELEX_REVIEW_TEST_URL: url,
        FORGELEX_REVIEW_TEST_COMMAND: JSON.stringify({
          owner: f.owner,
          matterId: f.matter.id,
          input: reapproval,
          frozen: approvedItems,
        }),
      },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(recoveredApproval.status, 0, recoveredApproval.stderr);
    assert.ok(recoveredApproval.stdout.includes('REAPPROVAL_REPLAY_PASSED'));
    checks.push('reapproval_recovery_separate_process');
    await f.client.execute("UPDATE facts SET statement='Relato alterado outra vez.'");
    const changes2 = await changesB.preview(f.owner, f.matter.id);
    const conflicting = { ...reapproval, commandId: randomUUID(), reviewToken: changes2.reviewToken };
    const reapprovalRace = await Promise.allSettled([
      changesA.approve(f.owner, f.matter.id, conflicting),
      changesB.approve(f.owner, f.matter.id, { ...conflicting, commandId: randomUUID() }),
    ]);
    assert.equal(reapprovalRace.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(reapprovalRace.find((r) => r.status === 'rejected').reason.message, /EVIDENCE_REVIEW_CONFLICT/);
    checks.push('reapproval_distinct_commands_conflict');
    const current = await other.preview(f.owner, f.saved.id),
      issue = current.items.find((i) => i.kind === 'ISSUE');
    const racing = await Promise.allSettled([
      f.reviews.decide(f.owner, f.saved.id, command(current, [{ itemId: issue.id, action: 'ADOPT' }])),
      other.decide(f.owner, f.saved.id, command(current, [{ itemId: issue.id, action: 'DISCARD' }])),
    ]);
    assert.equal(racing.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(racing.find((r) => r.status === 'rejected').reason.message, /EVIDENCE_REVIEW_CONFLICT/);
    checks.push('concurrent_distinct_commands_conflict');
    const stale = await other.preview(f.owner, f.saved.id),
      event = stale.items.find((i) => i.kind === 'TIMELINE');
    const actor = { userId: f.owner.userId, authType: 'web_session', role: 'member', scopes: ['matter:write'] };
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
    const guard = new MatterWriteGuard(f.db);
    let acquired, release;
    const locked = new Promise((resolve) => {
      acquired = resolve;
    });
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const lifecycle = guard.run(target, await guard.captureRevision(target), async (tx) => {
      acquired();
      await hold;
      await new MatterLifecycleRepository(tx).transition(
        { ...target, documentId: f.doc.document.id },
        actor,
        'archive',
        { expectedLifecycleRevision: 0 },
      );
    });
    await locked;
    const competing = assert.rejects(
      other.decide(f.owner, f.saved.id, command(stale, [{ itemId: event.id, action: 'ADOPT' }])),
      /EVIDENCE_REVIEW_CONFLICT/,
    );
    const competingUse = assert.rejects(
      new NativeCaseTaskRepository(b.db, async () => {}).assert(binding),
      /ACCESS_REVOKED/,
    );
    release();
    await lifecycle;
    await competing;
    await competingUse;
    checks.push('concurrent_archive_blocks_approved_context_use');
    checks.push('concurrent_archive_blocks_stale_approval_without_deadlock');
    assert.deepEqual(
      (
        await f.client.execute({
          sql: 'SELECT payload_json,content_hash FROM agentic_task_deliveries WHERE id=?',
          args: [f.saved.id],
        })
      ).rows,
      before,
    );
    checks.push('original_delivery_immutable');
    await new MatterLifecycleRepository(f.db).transition(target, actor, 'trash', { expectedLifecycleRevision: 0 });
    await new MatterPurgeRepository(f.client).purge(
      target,
      actor,
      { expectedLifecycleRevision: 1, confirmation: f.matter.title },
      {
        operationId: 'a'.repeat(64),
        target,
        expectedLifecycleRevision: 1,
        fingerprint: 'b'.repeat(64),
        preparedAt: new Date().toISOString(),
      },
    );
    assert.equal((await f.client.execute('SELECT evidence_review_json FROM agentic_task_deliveries')).rows.length, 0);
    assert.equal((await f.client.execute('SELECT id FROM facts')).rows.length, 0);
    checks.push('case_purge_removes_review_and_adoptions');
    console.log(JSON.stringify({ status: 'passed', checks }));
  } finally {
    f?.client.close();
    b?.client.close();
    if (started) execFileSync('docker', ['rm', '--force', name], { stdio: 'pipe' });
  }
}
