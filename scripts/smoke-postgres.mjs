import { CaseContextService, DraftReviewService, FactsEvidenceService, createFixtureResearchService } from '../packages/legal-tools/dist/index.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createDatabase, CaseAiAccessRepository, DraftRepository, DraftReviewRunRepository, FactsEvidenceRepository, MatterAuthorityRepository, MatterRepository, ResearchHistoryRepository,
  WebhookRepository, runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { buildApp } from '../apps/api/dist/app.js';

const checks = [
  'migrations_idempotent', 'corpus_global', 'tenant_isolation',
  'billing_reservation_concurrency', 'refund_concurrency',
  'matter_workflow', 'research_history', 'review_runs', 'review_queue',
  'outbox_two_workers', 'worker_restart', 'readiness', 'metrics',
  'case_ai_access_concurrency_read_revoke',
];
const databaseUrl = process.env.FORGELEX_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error('BLOCKED_DATABASE_URL: defina DATABASE_URL ou FORGELEX_DATABASE_URL com uma URL PostgreSQL.');
  process.exit(2);
}

const prefix = `phase7_${randomUUID()}`;
const tenantId = `${prefix}_tenant`;
const otherTenantId = `${prefix}_other`;
const userId = `${prefix}_user`;
const connection = await createDatabase({ url: databaseUrl });
const { db, client } = connection;
const ledger = new LedgerService(db, client);
const passed = new Set();

try {
  await runPersistenceMigrations(client);
  await runPersistenceMigrations(client);
  await ledger.runMigrations();
  await ledger.runMigrations();
  passed.add('migrations_idempotent');

  const corpusColumns = await client.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'jurisprudence_documents'");
  assert.ok(corpusColumns.rows.length > 0);
  assert.equal(corpusColumns.rows.some((row) => String(row.column_name) === 'tenant_id'), false);
  passed.add('corpus_global');

  const matters = new MatterRepository(db);
  const matter = await matters.createMatter({ tenantId, createdBy: userId, title: 'Fluxo PostgreSQL Fase 7' });
  const shared=await matters.ingestTextDocument({tenantId,matterId:matter.id,createdBy:userId,title:'Documento compartilhado PG',originalFilename:'contexto.txt',mimeType:'text/plain',content:'Conteúdo autorizado PG.'});
  const access=new CaseAiAccessRepository(db);const owner={tenantId,userId};const stamp='2026-10-05T10:00:00.000Z';
  const permission={oauthClientId:'postgres-fixture',oauthGrantedAt:stamp,expectedRevision:0,selection:{documents:[{documentId:shared.document.id,versionId:shared.version.id}],factIds:[],evidenceIds:[],thesisIds:[],authorityIds:[]}};
  const permissionResults=await Promise.allSettled([access.replace(owner,matter.id,permission),access.replace(owner,matter.id,permission)]);
  assert.equal(permissionResults.filter(r=>r.status==='fulfilled').length,1);assert.match(String(permissionResults.find(r=>r.status==='rejected').reason),/CASE_ACCESS_CONFLICT/);
  const reader={...owner,oauthConnection:{clientId:permission.oauthClientId,grantedAt:stamp}};const caseContext=new CaseContextService(access);
  const allowed=await caseContext.readItem(reader,{matterId:matter.id,kind:'DOCUMENT',itemId:shared.document.id});assert.ok(allowed.parts.some(p=>p.text==='Conteúdo autorizado PG.'));
  const active=(await access.listForOwner(owner,matter.id))[0];await access.revoke(owner,matter.id,active.id,active.revision);
  await assert.rejects(()=>caseContext.readItem(reader,{matterId:matter.id,kind:'DOCUMENT',itemId:shared.document.id}),/CASE_CONTEXT_NOT_AUTHORIZED/);
  passed.add('case_ai_access_concurrency_read_revoke');
  const document = await matters.ingestTextDocument({ tenantId, matterId: matter.id, createdBy: userId, title: 'Prova', originalFilename: 'prova.txt', mimeType: 'text/plain', content: 'Conteúdo controlado do smoke PostgreSQL.' });
  const draftRepository = new DraftRepository(db);
  const draft = await draftRepository.createDraft({ tenantId, matterId: matter.id, createdBy: userId, title: 'Minuta controlada' });
  assert.equal((await matters.listMatters(otherTenantId)).length, 0);
  assert.equal(await matters.getMatter(otherTenantId, matter.id), undefined);
  passed.add('tenant_isolation');
  assert.equal(document.document.matterId, matter.id);
  assert.equal(draft.matterId, matter.id);
  passed.add('matter_workflow');

  await ledger.provisionAccount(tenantId, { paidBalanceCents: 100, promotionalBalanceCents: 0 });
  const operationKey = `${prefix}_bill`;
  const executions = await Promise.all([
    ledger.executeBillableOperation({ tenantId, userId, idempotencyKey: operationKey, costCents: 20, usage: { capability: 'phase7.smoke', units: 1 }, operation: async () => ({ run: 1 }) }),
    ledger.executeBillableOperation({ tenantId, userId, idempotencyKey: operationKey, costCents: 20, usage: { capability: 'phase7.smoke', units: 1 }, operation: async () => ({ run: 2 }) }),
  ]);
  assert.equal(executions.filter((item) => item.isReplay).length, 1);
  assert.equal(await ledger.getAvailableBalanceCents(tenantId), 80);
  passed.add('billing_reservation_concurrency');

  const now = new Date().toISOString();
  const purchaseId = `${prefix}_purchase`;
  await client.execute({ sql: `INSERT INTO billing_purchases (id, tenant_id, user_id, package_id, idempotency_key, amount_cents, currency, status, created_at, updated_at) VALUES (?, ?, ?, 'smoke', ?, 100, 'brl', 'PAID', ?, ?)`, args: [purchaseId, tenantId, userId, `${prefix}_purchase_key`, now, now] });
  const refundInsert = (id) => client.execute({ sql: `INSERT INTO billing_refund_requests (id, tenant_id, purchase_id, requested_by, status, open_key, eligible_amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, 'PENDING', ?, 100, ?, ?)`, args: [id, tenantId, purchaseId, userId, purchaseId, now, now] });
  const refundResults = await Promise.allSettled([refundInsert(`${prefix}_refund_1`), refundInsert(`${prefix}_refund_2`)]);
  assert.equal(refundResults.filter((result) => result.status === 'fulfilled').length, 1);
  passed.add('refund_concurrency');

  const history = new ResearchHistoryRepository(db);
  await history.record({ tenantId, userId, operationId: operationKey, query: 'responsabilidade civil', court: 'stj', resultCount: 1, billingMode: 'METERED', chargedCents: 20 });
  await history.record({ tenantId, userId, operationId: operationKey, query: 'responsabilidade civil', court: 'stj', resultCount: 1, billingMode: 'METERED', chargedCents: 20 });
  assert.equal((await history.list(tenantId, userId)).length, 1);
  passed.add('research_history');

  const version = await draftRepository.createVersion({ tenantId, matterId: matter.id, draftId: draft.id, title: draft.title, createdBy: userId, source: 'HUMAN', contentHash: 'a'.repeat(64), sections: [{ ordinal: 1, title: 'Fundamentos', content: 'Texto controlado.' }] });
  const runs = new DraftReviewRunRepository(db);
  const evidence = new FactsEvidenceRepository(db);
  const review = new DraftReviewService({ drafts: draftRepository, runs, facts: new FactsEvidenceService(evidence), authorities: new MatterAuthorityRepository(db), research: createFixtureResearchService(), evidence, matters, sourceMethod: 'PROVIDER' });
  const context = { tenantId, matterId: matter.id, userId };
  const firstRun = await review.runAll(context, draft.id);
  const secondRun = await review.runAll(context, draft.id);
  assert.equal(firstRun.run.state, 'COMPLETE');
  assert.equal(secondRun.run.runNumber, firstRun.run.runNumber + 1);
  assert.equal((await runs.getLatest(context, draft.id, version.version.id)).id, secondRun.run.id);
  assert.equal((await runs.list(context, draft.id, version.version.id)).length, 2);
  passed.add('review_runs');
  const approval = await draftRepository.createApprovalRequest({ tenantId, matterId: matter.id, draftId: draft.id, draftVersionId: version.version.id, requestedBy: userId, proposedAction: 'Aprovar a minuta controlada.' });
  const queueRows = await client.execute({ sql: "SELECT id FROM draft_approval_requests WHERE tenant_id = ? AND status = 'PENDING'", args: [tenantId] });
  assert.equal(String(queueRows.rows[0]?.id), approval.request.id);
  passed.add('review_queue');
  const decisions = await Promise.allSettled(['APPROVED', 'REJECTED'].map(decision => draftRepository.resolveApproval({ tenantId, token: approval.token, decision, decidedBy: userId })));
  assert.equal(decisions.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(decisions.filter(result => result.status === 'rejected').length, 1);
  assert.match(String(decisions.find(result => result.status === 'rejected').reason), /APPROVAL_NOT_PENDING|APPROVAL_TOKEN_USED/);

  const outbox = new WebhookRepository(client);
  const endpoint = await outbox.createEndpoint({ id: `${prefix}_endpoint`, tenantId, url: 'https://example.test/phase7', secretCiphertext: 'fixture', eventTypes: ['matter.created'] });
  await Promise.all([1, 2].map((number) => outbox.enqueueEvent({ id: `${prefix}_event_${number}`, tenantId, eventType: 'matter.created', payloadJson: JSON.stringify({ number }), endpointIds: [endpoint.id] })));
  const claimTime = new Date(Date.now() + 1000).toISOString();
  const secondWorker = new WebhookRepository(client);
  const claims = [await outbox.claimDueDelivery(claimTime), await secondWorker.claimDueDelivery(claimTime)];
  assert.ok(claims[0] && claims[1]);
  assert.notEqual(claims[0].id, claims[1].id);
  passed.add('outbox_two_workers');
  await client.execute({ sql: "UPDATE webhook_deliveries SET next_attempt_at = ?, status = 'DELIVERING' WHERE id = ?", args: [new Date(Date.now() - 1000).toISOString(), claims[0].id] });
  const reclaimed = await outbox.claimDueDelivery(new Date().toISOString());
  assert.equal(reclaimed?.id, claims[0].id);
  passed.add('worker_restart');

  const app = await buildApp({ database: db, databaseClient: client, ledgerService: ledger, environment: { NODE_ENV: 'test', DATABASE_URL: databaseUrl, FORGELEX_WEBHOOK_MASTER_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', FORGELEX_METRICS_TOKEN: 'phase7-postgres-smoke-metrics' } });
  const ready = await app.inject({ method: 'GET', url: '/readyz' });
  assert.equal(ready.statusCode, 200);
  assert.equal(ready.json().status, 'ready');
  assert.equal(ready.json().checks.persistence, true);
  passed.add('readiness');
  const metrics = await app.inject({ method: 'GET', url: '/metrics', headers: { authorization: 'Bearer phase7-postgres-smoke-metrics' } });
  assert.equal(metrics.statusCode, 200);
  assert.ok(metrics.json().metrics.requests >= 1);
  passed.add('metrics');
  await app.close();

  const failedChecks = checks.filter((check) => !passed.has(check));
  assert.deepEqual(failedChecks, []);
  console.log(JSON.stringify({ status: 'passed', driver: 'postgres', checks }));
} catch (error) {
  console.error(`POSTGRES_SMOKE_FAILED: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  const cleanup = [
    'DELETE FROM case_ai_access_grants WHERE tenant_id = ?',
    'DELETE FROM webhook_deliveries WHERE tenant_id = ?', 'DELETE FROM webhook_events WHERE tenant_id = ?', 'DELETE FROM webhook_endpoints WHERE tenant_id = ?',
    'DELETE FROM billing_refund_requests WHERE tenant_id = ?', 'DELETE FROM billing_payments WHERE tenant_id = ?', 'DELETE FROM billing_invoices WHERE tenant_id = ?', 'DELETE FROM billing_credit_lots WHERE tenant_id = ?', 'DELETE FROM billing_purchases WHERE tenant_id = ?', 'DELETE FROM billing_accounts WHERE tenant_id = ?',
    'DELETE FROM draft_approval_decisions WHERE tenant_id = ?', 'DELETE FROM draft_approval_tokens WHERE tenant_id = ?', 'DELETE FROM draft_approval_requests WHERE tenant_id = ?', 'DELETE FROM draft_review_findings WHERE tenant_id = ?', 'DELETE FROM draft_review_runs WHERE tenant_id = ?', 'DELETE FROM citation_anchors WHERE tenant_id = ?', 'DELETE FROM draft_sections WHERE tenant_id = ?', 'DELETE FROM draft_versions WHERE tenant_id = ?', 'DELETE FROM drafts WHERE tenant_id = ?',
    'DELETE FROM research_search_history WHERE tenant_id = ?', 'DELETE FROM research_memos WHERE tenant_id = ?', 'DELETE FROM legal_theses WHERE tenant_id = ?', 'DELETE FROM legal_issues WHERE tenant_id = ?', 'DELETE FROM matter_authorities WHERE tenant_id = ?', 'DELETE FROM fact_source_links WHERE tenant_id = ?', 'DELETE FROM evidence_source_links WHERE tenant_id = ?', 'DELETE FROM evidence_links WHERE tenant_id = ?', 'DELETE FROM timeline_events WHERE tenant_id = ?', 'DELETE FROM facts WHERE tenant_id = ?', 'DELETE FROM evidence_items WHERE tenant_id = ?',
    'DELETE FROM document_anchors WHERE document_version_id IN (SELECT dv.id FROM document_versions dv JOIN legal_documents ld ON ld.id = dv.document_id WHERE ld.tenant_id = ?)', 'DELETE FROM document_versions WHERE document_id IN (SELECT id FROM legal_documents WHERE tenant_id = ?)', 'DELETE FROM legal_documents WHERE tenant_id = ?', 'DELETE FROM matters WHERE tenant_id = ?',
    'DELETE FROM ledger_entries WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id = ?)', 'DELETE FROM usage_events WHERE tenant_id = ?', 'DELETE FROM billing_operations WHERE tenant_id = ?', 'DELETE FROM ledger_accounts WHERE tenant_id = ?', 'DELETE FROM audit_logs WHERE tenant_id = ?',
  ];
  for (const sql of cleanup) { try { await client.execute({ sql, args: [tenantId] }); } catch {} }
  client.close();
}
