import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  DraftRepository,
  MatterWriteGuard,
} from '../packages/persistence/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { FakeAgentProvider } from '../packages/agent-core/dist/index.js';
import { NativeCaseContextService } from '../packages/legal-tools/dist/index.js';
import { ExecutionService } from '../apps/api/dist/agentic-workspace/execution-service.js';
import { ExecutionWorker } from '../apps/api/dist/agentic-workspace/execution-worker.js';
import { createCaseTaskDriver } from '../apps/api/dist/agentic-workspace/case-task-driver.js';
const owner = { tenantId: 'case-task-synthetic', userId: 'author' };
const makeProvider =
  (child = false) =>
  ({ role, registry, packet }) => {
    if (child) assert.notEqual(role, 'legal-orchestrator', 'PLANNER_MUST_NOT_REPLAY');
    const source = packet.sources[0].id;
    const output =
      role === 'legal-orchestrator'
        ? {
            action: 'create_document',
            documentType: 'Estrutura sintética',
            requiresCaseLaw: false,
            requiresNorms: false,
            requiresProcedure: true,
            issues: [{ id: 'one', statement: 'Questão sintética', sourceIds: [source] }],
            gaps: [],
          }
        : {
            coveredIssueIds: ['one'],
            claims: [],
            requirements: [],
            findings: [],
            supportChecks: [],
            ...(role === 'legal-drafter'
              ? {
                  document: {
                    title: 'Candidato sintético',
                    documentType: 'Estrutura sintética',
                    sections: [{ title: 'Contexto', content: 'Alegação sintética, não adotada.', sourceIds: [source] }],
                  },
                }
              : {}),
          };
    return new FakeAgentProvider(registry, undefined, [
      { thought: 'private-reasoning', toolCall: { name: 'task.submit', input: output } },
    ]);
  };
const options = { executorAvailable: true, now: () => 100000 };
const makeEvidenceProvider =
  (child = false) =>
  ({ role, registry, packet }) => {
    if (child) assert.equal(role, 'adversarial-reviewer', 'EVIDENCE_ANALYST_MUST_NOT_REPLAY');
    const source = packet.sources.find((s) => s.kind === 'DOCUMENT');
    const output =
      role === 'legal-orchestrator'
        ? {
            action: 'analyze_evidence',
            requiresCaseLaw: false,
            requiresNorms: false,
            requiresProcedure: false,
            issues: [{ id: 'issue', statement: 'Conferir relato documental', sourceIds: [source.id] }],
            gaps: [],
          }
        : {
            coveredIssueIds: ['issue'],
            claims:
              role === 'matter-analyst'
                ? [
                    {
                      id: 'claim',
                      classification: 'ALLEGATION',
                      statement: 'Relato documental sintético',
                      sourceIds: [source.id],
                    },
                  ]
                : [],
            requirements: [],
            findings: [],
            supportChecks: [],
            ...(role === 'matter-analyst'
              ? {
                  evidenceAnalysis: {
                    rows: [
                      {
                        id: 'row',
                        claimId: 'claim',
                        issueIds: ['issue'],
                        references: [{ sourceId: source.id, quote: source.text, start: 0, relation: 'SUPPORTS' }],
                        gaps: [],
                      },
                    ],
                    chronology: [],
                    contradictions: [],
                  },
                }
              : {}),
          };
    return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input: output } }]);
  };
const makeAdaptiveProvider =
  (child = false) =>
  ({ role, registry, packet }) => {
    if (child)
      assert.ok(['procedural-advisor', 'adversarial-reviewer'].includes(role), 'COMPLETED_GRAPH_NODE_MUST_NOT_REPLAY');
    const sourceId = packet.sources[0].id;
    const output =
      role === 'legal-orchestrator'
        ? {
            action: 'review_text',
            requiresCaseLaw: false,
            requiresNorms: false,
            requiresProcedure: false,
            issues: [{ id: 'one', statement: 'Questão sintética', sourceIds: [sourceId] }],
            gaps: [],
          }
        : {
            coveredIssueIds: ['one'],
            claims: [],
            requirements: [],
            findings: [],
            supportChecks: [],
            ...(role === 'adversarial-reviewer' && packet.routing.nodeId.endsWith(':0')
              ? {
                  capabilityRequests: [
                    {
                      capability: 'PROCEDURAL_ANALYSIS',
                      reason: 'PROCEDURAL_DEPENDENCY',
                      issueIds: ['one'],
                      sourceIds: [sourceId],
                    },
                  ],
                }
              : {}),
          };
    return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input: output } }]);
  };
if (process.argv[2] === '--recover-evidence') {
  const c = await createDatabase({ url: process.env.FORGELEX_CASE_TASK_TEST_URL });
  try {
    const service = new ExecutionService(c.db, c.client, { ...options, now: () => 100101 });
    const { driver, native } = createCaseTaskDriver(c.db, c.client, {
      authorizeNative: async () => {},
      createProvider: makeEvidenceProvider(true),
    });
    await new ExecutionWorker(service, driver).runOnce();
    const run = await service.store.workspace.getExecution(owner, process.env.FORGELEX_CASE_TASK_TEST_ID);
    assert.equal(run.status, 'COMPLETED');
    assert.equal(run.deliveryIds.length, 1);
    assert.equal(run.checkpoint.caseTask.version, 3);
    const delivery = (await native.getDelivery(owner, run.deliveryIds[0])).delivery;
    assert.equal(delivery.evidenceMatrix.rows[0].coverage, 'DOCUMENT_LINKED');
    assert.equal(delivery.evidenceMatrix.rows[0].references[0].quoteStatus, 'MATCHED');
    assert.equal(delivery.legalAssessment, 'NOT_EVALUATED');
    assert.equal((await c.client.execute('SELECT id FROM facts')).rows.length, 0);
    assert.equal((await c.client.execute('SELECT id FROM evidence_items')).rows.length, 0);
    console.log('EVIDENCE_RECOVERY_PASSED');
  } finally {
    c.client.close();
  }
} else if (process.argv[2] === '--recover-adaptive') {
  const c = await createDatabase({ url: process.env.FORGELEX_CASE_TASK_TEST_URL });
  try {
    const service = new ExecutionService(c.db, c.client, { ...options, now: () => 100101 });
    const { driver } = createCaseTaskDriver(c.db, c.client, {
      authorizeNative: async () => {},
      createProvider: makeAdaptiveProvider(true),
    });
    await new ExecutionWorker(service, driver).runOnce();
    const execution = await service.store.workspace.getExecution(owner, process.env.FORGELEX_CASE_TASK_TEST_ID);
    assert.equal(execution.status, 'COMPLETED');
    assert.equal(execution.deliveryIds.length, 1);
    const state = execution.checkpoint.caseTask;
    assert.equal(state.version, 2);
    assert.equal(state.graph.revision, 1);
    assert.ok(state.graph.archivedOutputs['adversarial-reviewer:0']);
    assert.deepEqual(
      state.profiles.map((p) => p.role),
      ['legal-orchestrator', 'matter-analyst', 'adversarial-reviewer', 'procedural-advisor', 'adversarial-reviewer'],
    );
    console.log('ADAPTIVE_RECOVERY_PASSED');
  } finally {
    c.client.close();
  }
} else if (process.argv[2] === '--recover') {
  const c = await createDatabase({ url: process.env.FORGELEX_CASE_TASK_TEST_URL });
  try {
    const id = process.env.FORGELEX_CASE_TASK_TEST_ID;
    const service = new ExecutionService(c.db, c.client, { ...options, now: () => 100101 });
    const { driver, native } = createCaseTaskDriver(c.db, c.client, {
      authorizeNative: async () => {},
      createProvider: makeProvider(true),
    });
    await new ExecutionWorker(service, driver).runOnce();
    const execution = await service.getExecution(owner, id);
    assert.equal(execution.status, 'COMPLETED');
    assert.equal(execution.deliveryIds.length, 1);
    const record = await native.getDelivery(owner, execution.deliveryIds[0]);
    assert.equal(record.delivery.humanReviewRequired, true);
    assert.ok(record.draftId);
    assert.ok(!JSON.stringify(record).includes('private-reasoning'));
    const version = await new DraftRepository(c.db).getCurrentVersion(
      owner.tenantId,
      execution.matterId,
      record.draftId,
    );
    assert.equal(version.version.source, 'WORKFLOW');
    assert.equal(version.version.status, 'DRAFT');
    assert.equal((await c.client.execute('SELECT id FROM facts')).rows.length, 0);
    assert.equal(
      (
        await c.client.execute({
          sql: "SELECT id FROM agentic_events WHERE execution_id=? AND type='DELIVERY'",
          args: [id],
        })
      ).rows.length,
      1,
    );
    console.log('RECOVERY_PASSED');
  } finally {
    c.client.close();
  }
} else {
  const name = `forgelex-case-task-test-${randomUUID().slice(0, 8)}`,
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
        'POSTGRES_DB=forgelex_case_task_test',
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
          ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'forgelex_case_task_test'],
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
    const url = `postgres://postgres:${password}@127.0.0.1:${port}/forgelex_case_task_test`;
    a = await createDatabase({ url });
    b = await createDatabase({ url });
    await runPersistenceMigrations(a.client);
    await runPersistenceMigrations(a.client);
    await new LedgerService(a.db, a.client).runMigrations();
    const matter = await new MatterRepository(a.db).createMatter({
      ...owner,
      title: 'Caso sintético',
      createdBy: owner.userId,
    });
    const service = new ExecutionService(a.db, a.client, options);
    const run = await service.startExecution(owner, 'start', {
      objective: 'Preparar candidato sintético',
      actionId: 'create_document',
      matterId: matter.id,
      context: { origin: 'USER', text: 'Contexto sintético', documents: [] },
    });
    const { driver } = createCaseTaskDriver(a.db, a.client, {
      authorizeNative: async () => {},
      createProvider: makeProvider(),
    });
    const lease = await service.claimNext('parent', 100),
      context = await service.driverContext(lease),
      step = driver.next(context);
    await service.beginStep(lease, step.callId);
    const result = await step.run({ ...context, signal: new AbortController().signal });
    await service.finishStep(lease, step.callId, result);
    assert.equal(result.kind, 'checkpoint');
    assert.equal(result.checkpoint.caseTask.profiles.length, 1);
    a.client.close();
    b.client.close();
    a = b = undefined;
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--recover'], {
      env: { ...process.env, FORGELEX_CASE_TASK_TEST_URL: url, FORGELEX_CASE_TASK_TEST_ID: run.id },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(child.status, 0, 'SEPARATE_PROCESS_RECOVERY_FAILED');
    assert.ok(child.stdout.includes('RECOVERY_PASSED'));
    a = await createDatabase({ url });
    b = await createDatabase({ url });
    const adaptiveService = new ExecutionService(a.db, a.client, options);
    const adaptiveRun = await adaptiveService.startExecution(owner, 'adaptive', {
      objective: 'Revisão sintética com dependência tardia',
      actionId: 'review_text',
      context: { origin: 'USER', text: 'Contexto sintético', documents: [] },
    });
    const adaptiveDriver = createCaseTaskDriver(a.db, a.client, {
      authorizeNative: async () => {},
      createProvider: makeAdaptiveProvider(),
    }).driver;
    const adaptiveLease = await adaptiveService.claimNext('adaptive-parent', 100);
    for (let i = 0; i < 3; i++) {
      const ctx = await adaptiveService.driverContext(adaptiveLease),
        step = adaptiveDriver.next(ctx);
      await adaptiveService.beginStep(adaptiveLease, step.callId);
      await adaptiveService.finishStep(
        adaptiveLease,
        step.callId,
        await step.run({ ...ctx, signal: new AbortController().signal }),
      );
    }
    assert.equal(
      (await adaptiveService.store.workspace.getExecution(owner, adaptiveRun.id)).checkpoint.caseTask.graph.revision,
      1,
    );
    const adaptiveChild = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--recover-adaptive'], {
      env: { ...process.env, FORGELEX_CASE_TASK_TEST_URL: url, FORGELEX_CASE_TASK_TEST_ID: adaptiveRun.id },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(adaptiveChild.status, 0, adaptiveChild.stderr || 'ADAPTIVE_RECOVERY_FAILED');
    assert.ok(adaptiveChild.stdout.includes('ADAPTIVE_RECOVERY_PASSED'));
    const evidenceDoc = await new MatterRepository(a.db).ingestTextDocument({
      tenantId: owner.tenantId,
      matterId: matter.id,
      title: 'Recibo sintético',
      content: 'Relato documental sintético.',
      mimeType: 'text/plain',
      originalFilename: 'recibo.txt',
      createdBy: owner.userId,
    });
    const evidenceService = new ExecutionService(a.db, a.client, options);
    const evidenceRun = await evidenceService.startExecution(owner, 'evidence', {
      objective: 'Conferir prova sintética',
      actionId: 'analyze_evidence',
      matterId: matter.id,
      context: {
        origin: 'DOCUMENT',
        text: '',
        documents: [{ documentId: evidenceDoc.document.id, versionId: evidenceDoc.version.id }],
      },
    });
    const evidenceDriver = createCaseTaskDriver(a.db, a.client, {
      authorizeNative: async () => {},
      createProvider: makeEvidenceProvider(),
    }).driver;
    const evidenceLease = await evidenceService.claimNext('evidence-parent', 100);
    for (let i = 0; i < 2; i++) {
      const ctx = await evidenceService.driverContext(evidenceLease),
        step = evidenceDriver.next(ctx);
      await evidenceService.beginStep(evidenceLease, step.callId);
      await evidenceService.finishStep(
        evidenceLease,
        step.callId,
        await step.run({ ...ctx, signal: new AbortController().signal }),
      );
    }
    const evidenceChild = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--recover-evidence'], {
      env: { ...process.env, FORGELEX_CASE_TASK_TEST_URL: url, FORGELEX_CASE_TASK_TEST_ID: evidenceRun.id },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(evidenceChild.status, 0, evidenceChild.stderr || 'EVIDENCE_RECOVERY_FAILED');
    assert.ok(evidenceChild.stdout.includes('EVIDENCE_RECOVERY_PASSED'));
    const concurrent = await new ExecutionService(a.db, a.client, options).startExecution(owner, 'concurrent', {
      objective: 'Concorrência sintética',
      matterId: matter.id,
      context: { origin: 'USER', text: 'Sem normas reais', documents: [] },
    });
    const executionService = new ExecutionService(a.db, a.client, options);
    await executionService.claimNext('writer', 100);
    const delivery = {
      action: 'create_document',
      contextId: concurrent.conversationId,
      contextRevision: 1,
      status: 'LIMITED',
      humanReviewRequired: true,
      issues: [],
      claims: [],
      requirements: [],
      findings: [],
      sources: [],
      document: {
        title: 'Concorrente',
        documentType: 'Sintético',
        sections: [{ title: 'Contexto', content: 'Texto sintético', sourceIds: [] }],
      },
    };
    const binding = {
      ...owner,
      executionId: concurrent.id,
      conversationId: concurrent.conversationId,
      contextRevision: 1,
      matterId: matter.id,
      objective: 'Concorrência sintética',
    };
    const n1 = new NativeCaseContextService(a.db, async () => {}),
      n2 = new NativeCaseContextService(b.db, async () => {});
    const [first, second] = await Promise.all([n1.save(binding, delivery), n2.save(binding, delivery)]);
    assert.deepEqual(first, second);
    assert.equal(
      (
        await a.client.execute({
          sql: 'SELECT id FROM agentic_task_deliveries WHERE execution_id=?',
          args: [concurrent.id],
        })
      ).rows.length,
      1,
    );
    assert.equal((await executionService.getExecution(owner, concurrent.id)).deliveryIds.length, 1);
    await assert.rejects(n2.getDelivery({ ...owner, userId: 'other' }, first.id), /NOT_FOUND/);
    const editing = await executionService.startExecution(owner, 'human-conflict', {
      objective: 'Respeitar edição humana',
      matterId: matter.id,
      context: {
        origin: 'USER',
        text: 'Contexto sintético',
        documents: [],
        draft: { draftId: first.draftId, versionId: first.versionId },
      },
    });
    await executionService.claimNext('human-conflict-worker', 100);
    let releaseHuman, caseLocked, nativeAfterLocks;
    const release = new Promise((resolve) => {
      releaseHuman = resolve;
    });
    const acquired = new Promise((resolve) => {
      caseLocked = resolve;
    });
    const nativeReached = new Promise((resolve) => {
      nativeAfterLocks = resolve;
    });
    const guard = new MatterWriteGuard(a.db),
      target = { tenantId: owner.tenantId, matterId: matter.id };
    const human = guard.run(target, await guard.captureRevision(target), async (tx) => {
      caseLocked();
      await release;
      return new DraftRepository(tx).createVersion({
        ...owner,
        matterId: matter.id,
        draftId: first.draftId,
        title: 'Edição humana',
        createdBy: owner.userId,
        source: 'HUMAN',
        contentHash: 'd'.repeat(64),
        sections: [
          {
            ordinal: 1,
            title: 'Humano',
            content: 'Nova versão humana, preservada.',
            linkedFactIds: [],
            linkedThesisIds: [],
          },
        ],
      });
    });
    await acquired;
    const competing = new NativeCaseContextService(b.db, async (_owner, _matter, tx) => {
      if (tx !== b.db) nativeAfterLocks();
    });
    const publication = competing.save(
      { ...binding, executionId: editing.id, conversationId: editing.conversationId },
      { ...delivery, contextId: editing.conversationId },
    );
    await Promise.race([nativeReached, new Promise((resolve) => setTimeout(resolve, 1000))]);
    releaseHuman();
    const [humanResult, publicationResult] = await Promise.allSettled([human, publication]);
    let pgState = null;
    if (publicationResult.status === 'rejected')
      for (let error = publicationResult.reason, i = 0; error && i < 8; error = error.cause, i++)
        if (typeof error.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)) pgState = error.code;
    console.log(
      JSON.stringify({
        lockCheck: true,
        human: humanResult.status,
        publication: publicationResult.status,
        publicationCode:
          publicationResult.status === 'rejected' && publicationResult.reason.message === 'SOURCE_VERSION_CONFLICT'
            ? 'SOURCE_VERSION_CONFLICT'
            : 'OTHER',
        pgState,
      }),
    );
    assert.equal(humanResult.status, 'fulfilled', 'HUMAN_EDIT_MUST_NOT_ABORT_FROM_LOCK_INVERSION');
    assert.ok(
      publicationResult.status === 'rejected' && publicationResult.reason.message === 'SOURCE_VERSION_CONFLICT',
      'PUBLICATION_MUST_CONFLICT_WITH_NEW_HUMAN_VERSION',
    );
    assert.equal(
      (await new DraftRepository(a.db).getCurrentVersion(owner.tenantId, matter.id, first.draftId)).version.contentHash,
      'd'.repeat(64),
    );
    console.log(
      JSON.stringify({
        status: 'passed',
        checks: [
          'migration_twice',
          'specialist_checkpoint_separate_process',
          'planner_not_replayed',
          'adaptive_checkpoint_after_invalidation_separate_process',
          'completed_graph_nodes_not_replayed',
          'evidence_matrix_recovery_separate_process',
          'evidence_analyst_not_replayed',
          'evidence_matrix_no_fact_or_evidence_adoption',
          'preliminary_workflow_draft',
          'no_fact_adoption',
          'public_projection',
          'one_delivery_event',
          'concurrent_save_one_delivery',
          'atomic_partial_delivery_id',
          'owner_isolation',
          'human_edit_lock_order_without_deadlock',
        ],
      }),
    );
  } finally {
    a?.client.close();
    b?.client.close();
    if (started) execFileSync('docker', ['rm', '--force', name], { stdio: 'pipe' });
  }
}
