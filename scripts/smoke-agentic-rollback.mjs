import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  CaseAiAccessRepository,
} from '../packages/persistence/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { FakeAgentProvider } from '../packages/agent-core/dist/index.js';
import { buildApp } from '../apps/api/dist/app.js';
import { AuthAdapter } from '../apps/api/dist/auth/fastify-auth.js';
import { ExecutionService } from '../apps/api/dist/agentic-workspace/execution-service.js';
import { ExecutionWorker } from '../apps/api/dist/agentic-workspace/execution-worker.js';
import { createCaseTaskDriver } from '../apps/api/dist/agentic-workspace/case-task-driver.js';

// A disposable, fake-only operational drill. No key, pilot database or remote URL is accepted.
const digest = (value) => createHash('sha256').update(value).digest('hex');
const fixtureBytes = readFileSync(
  new URL('../docs/architecture/fixtures/agentic-task6-synthetic-cases.json', import.meta.url),
);
const approved = JSON.parse(fixtureBytes);
assert.equal(approved.syntheticOnly, true);
assert.equal(approved.status, 'APPROVED_BY_BONI');
assert.equal(approved.financialCeiling.currency, 'USD');
assert.equal(approved.financialCeiling.total, 5);
const example = approved.cases.find((entry) => entry.id === 'T6-GAP');
assert.equal(example.selectedSources.length, 1);
const source = example.selectedSources[0];
const owner = { tenantId: 'boni-task7-disposable-synthetic', userId: 'boni' };
const principal = {
  ...owner,
  subjectId: 'synthetic-local-subject',
  roles: ['owner'],
  scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read'],
  authMethod: 'session',
};
const oauthClientId = 'synthetic-rollback-client';
const oauthGrantedAt = '2026-10-28T00:00:00.000Z';
const auth = new AuthAdapter({
  verify: async (token) =>
    token === 'local-session'
      ? principal
      : token === 'local-oauth'
        ? { ...principal, authMethod: 'oauth_access_token', oauthClientId, oauthGrantedAt }
        : token === 'other-owner'
          ? { ...principal, userId: 'other-synthetic-owner' }
          : null,
});
const headers = { authorization: 'Bearer local-session' };
const watchedTables = [
  'matters',
  'legal_documents',
  'document_versions',
  'drafts',
  'draft_versions',
  'draft_sections',
  'agentic_conversations',
  'agentic_contexts',
  'agentic_executions',
  'agentic_messages',
  'agentic_events',
  'agentic_commands',
  'agentic_command_owners',
  'agentic_execution_jobs',
  'agentic_execution_calls',
  'agentic_task_deliveries',
  'inference_budgets',
  'inference_calls',
];
let providerSteps = 0;
const taskOptions = {
  authorizeNative: async (binding) => {
    assert.equal(binding.tenantId, owner.tenantId);
    assert.equal(binding.userId, owner.userId);
  },
  createProvider: ({ role, registry, packet }) => {
    providerSteps++;
    const selected = packet.sources.find((entry) => entry.kind === 'DOCUMENT');
    assert.ok(selected, 'SELECTED_SYNTHETIC_SOURCE_REQUIRED');
    const result =
      role === 'legal-orchestrator'
        ? {
            action: 'create_document',
            documentType: 'Registro factual sintético',
            requiresCaseLaw: false,
            requiresNorms: false,
            requiresProcedure: true,
            issues: [{ id: 'synthetic-gap', statement: example.objective, sourceIds: [selected.id] }],
            gaps: [],
          }
        : {
            coveredIssueIds: ['synthetic-gap'],
            claims: [],
            requirements: [],
            findings: [],
            supportChecks: [],
            ...(role === 'legal-drafter'
              ? {
                  document: {
                    title: 'Registro sintético preliminar',
                    documentType: 'Registro factual sintético',
                    sections: [{ title: 'Relato e lacunas', content: source.text, sourceIds: [selected.id] }],
                  },
                }
              : {}),
          };
    return new FakeAgentProvider(registry, undefined, [
      {
        thought: 'synthetic operational fixture only',
        toolCall: { name: 'task.submit', input: result },
      },
    ]);
  },
};
const fetchBefore = globalThis.fetch;
let externalAttempts = 0;
globalThis.fetch = async () => {
  externalAttempts++;
  throw new Error('EXTERNAL_EGRESS_FORBIDDEN_IN_ROLLBACK_DRILL');
};
let connection, app;
try {
  connection = await createDatabase({ url: 'file::memory:' });
  const { db, client } = connection;
  await runPersistenceMigrations(client);
  const ledger = new LedgerService(db, client);
  await ledger.runMigrations();
  const matters = new MatterRepository(db);
  const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Piloto local ' + example.id });
  const document = await matters.ingestTextDocument({
    ...owner,
    matterId: matter.id,
    createdBy: owner.userId,
    title: source.id,
    originalFilename: source.id + '.txt',
    mimeType: 'text/plain',
    content: source.text,
  });
  await new CaseAiAccessRepository(db).replace(owner, matter.id, {
    oauthClientId,
    oauthGrantedAt,
    expectedRevision: 0,
    selection: {
      documents: [{ documentId: document.document.id, versionId: document.version.id }],
      factIds: [],
      evidenceIds: [],
      thesisIds: [],
      authorityIds: [],
    },
  });
  const payload = {
    objective: example.objective,
    matterId: matter.id,
    context: {
      text: '',
      origin: 'DOCUMENT',
      documents: [{ documentId: document.document.id, versionId: document.version.id }],
    },
  };
  const openPhase = async (enabled) => {
    app = await buildApp({
      database: db,
      databaseClient: client,
      ledgerService: ledger,
      authAdapter: auth,
      environment: {
        NODE_ENV: 'test',
        FORGELEX_AGENTIC_WORKSPACE_ENABLED: String(enabled),
        FORGELEX_MCP_DECISION_UI_ENABLED: 'true',
      },
      agenticWorkspace: { scheduler: false, caseTask: taskOptions },
    });
    await app.ready();
  };
  const closePhase = async () => {
    await app.close();
    app = undefined;
  };
  const request = async (method, url, body, extra = {}) => {
    const response = await app.inject({
      method,
      url,
      headers: { ...headers, ...extra },
      ...(body ? { payload: body } : {}),
    });
    return response;
  };
  const mcp = async (method, params) => {
    const response = await request(
      'POST',
      '/mcp',
      { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) },
      { authorization: 'Bearer local-oauth' },
    );
    assert.equal(response.statusCode, 200, response.body);
    const reply = response.json();
    assert.ok(!reply.error && !reply.result.isError, JSON.stringify(reply));
    return reply.result;
  };
  const legacyProbe = async () => {
    assert.equal((await request('GET', '/health')).statusCode, 200);
    const record = await request('GET', `/api/v2/matters/${matter.id}`);
    assert.equal(record.statusCode, 200);
    const tools = (await mcp('tools/list')).tools.map((tool) => tool.name).sort();
    assert.equal(tools.length, 9);
    const context = await mcp('tools/call', { name: 'case.get_context', arguments: { matterId: matter.id } });
    assert.ok(JSON.stringify(context.structuredContent).includes(document.document.id));
    assert.equal(context.billing.chargedCents, 0);
    return tools;
  };
  const snapshot = async () => {
    const data = {};
    for (const table of watchedTables) data[table] = (await client.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows;
    return digest(JSON.stringify(data));
  };
  const completeOne = async () => {
    const service = new ExecutionService(db, client, { executorAvailable: true });
    const { driver } = createCaseTaskDriver(db, client, taskOptions);
    const worker = new ExecutionWorker(service, driver);
    try {
      assert.equal(await worker.runOnce(), true);
      assert.equal(await worker.runOnce(), false);
    } finally {
      await worker.stop();
    }
  };
  await openPhase(true);
  const start = await request('POST', '/api/agentic/executions', payload, { 'idempotency-key': 'rollback-first' });
  assert.equal(start.statusCode, 202, start.body);
  const first = start.json();
  await completeOne();
  const completed = (await request('GET', `/api/agentic/executions/${first.id}`)).json();
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.deliveryIds.length, 1);
  const deliveryPath = `/api/agentic/deliveries/${completed.deliveryIds[0]}`;
  const delivery = (await request('GET', deliveryPath)).json();
  assert.equal(delivery.delivery.humanReviewRequired, true);
  assert.ok(delivery.draftId);
  const draftPath = `/api/v2/matters/${matter.id}/drafts/${delivery.draftId}`;
  const draft = (await request('GET', draftPath)).json();
  const humanContent = source.text + '\n[Conferência sintética pendente.]';
  const saved = await request('POST', draftPath + '/versions', {
    title: draft.draft.title,
    baseVersionId: draft.currentVersion.version.id,
    expectedCurrentVersionId: draft.currentVersion.version.id,
    sections: [{ ordinal: 0, title: 'Relato e lacunas', content: humanContent }],
  });
  assert.equal(saved.statusCode, 200, saved.body);
  const humanVersionId = saved.json().version.id;
  const queued = await request('POST', '/api/agentic/executions', payload, { 'idempotency-key': 'rollback-queued' });
  assert.equal(queued.statusCode, 202, queued.body);
  const queuedId = queued.json().id;
  const toolsBefore = await legacyProbe();
  const before = await snapshot();
  await closePhase();
  await openPhase(false);
  assert.equal(await snapshot(), before, 'STARTUP_WITH_FLAG_OFF_MUST_PRESERVE_DATA');
  assert.deepEqual(await legacyProbe(), toolsBefore);
  assert.equal((await request('GET', deliveryPath)).statusCode, 404);
  assert.equal(
    (await request('POST', '/api/agentic/executions', payload, { 'idempotency-key': 'blocked-while-off' })).statusCode,
    404,
  );
  const duringOff = (await request('GET', draftPath)).json();
  assert.equal(duringOff.currentVersion.version.id, humanVersionId);
  assert.equal(duringOff.currentVersion.sections[0].content, humanContent);
  assert.equal(await snapshot(), before, 'ROLLBACK_PROBES_MUST_NOT_DELETE_OR_REPLAY');
  await closePhase();
  await openPhase(true);
  assert.equal(await snapshot(), before, 'REENABLING_MUST_NOT_REPLAY_BEFORE_WORKER');
  assert.deepEqual((await request('GET', deliveryPath)).json(), delivery);
  assert.equal((await request('GET', `/api/agentic/executions/${queuedId}`)).json().status, 'QUEUED');
  await completeOne();
  assert.equal((await request('GET', `/api/agentic/executions/${queuedId}`)).json().status, 'COMPLETED');
  assert.deepEqual(await legacyProbe(), toolsBefore);
  const preserved = (await request('GET', draftPath)).json();
  assert.equal(preserved.currentVersion.version.id, humanVersionId);
  assert.equal(preserved.currentVersion.sections[0].content, humanContent);
  assert.equal(
    (await request('GET', deliveryPath, undefined, { authorization: 'Bearer other-owner' })).statusCode,
    404,
  );
  const count = async (table) => Number((await client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  assert.equal(await count('agentic_task_deliveries'), 2);
  assert.equal(await count('inference_budgets'), 0);
  assert.equal(await count('inference_calls'), 0);
  assert.equal(await count('facts'), 0);
  assert.equal(await count('draft_approval_requests'), 0);
  assert.equal(externalAttempts, 0);
  assert.ok(providerSteps > 0);
  console.log(
    JSON.stringify({
      status: 'passed',
      kind: 'LOCAL_FAKE_ROLLBACK_DRILL',
      fixtureId: example.id,
      fixtureSha256: digest(fixtureBytes),
      scriptSha256: digest(readFileSync(new URL(import.meta.url))),
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      flags: [true, false, true],
      watchedTableCount: watchedTables.length,
      persistedSnapshotUnchangedWhileOff: before,
      savedHumanVersionPreserved: true,
      legacyTools: toolsBefore,
      deliveries: 2,
      resumedQueuedExecutions: 1,
      provider: 'fake',
      providerSteps,
      externalAttempts,
      paidCalls: 0,
      originalPilotDatabaseTouched: false,
      newBudgetOrTopup: false,
      humanLegalApproval: 'NOT_EVALUATED',
      checks: [
        'flag_on_off_on',
        'same_disposable_database',
        'case_and_delivery_preserved',
        'human_version_preserved',
        'rest_and_nine_mcp_tools_preserved',
        'authorized_mcp_context_read',
        'queued_work_recovers_once',
        'foreign_owner_denied',
        'no_adopted_facts',
        'no_legal_approval',
        'no_egress_or_billing',
      ],
      limits: [
        'Same-process application restart with persisted SQLite; no remote deployment or PostgreSQL rollback rehearsal.',
        'Queued work only; not proof of financial settlement for an in-flight real provider call.',
        'Server flag only; frontend flag remains a build-time operation.',
        'Fake outputs do not establish legal quality.',
      ],
    }),
  );
} finally {
  if (app) await app.close();
  connection?.client.close();
  globalThis.fetch = fetchBefore;
}
