import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  CaseAiAccessRepository,
  CaseAnalysisRepository,
  FactsEvidenceRepository,
  LegalIssueRepository,
} from '../packages/persistence/dist/index.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';
import { runLedgerMigrations } from '../packages/billing-ledger/dist/index.js';

const url = process.env.FORGELEX_LOCAL_POSTGRES_URL;
let allowed = false;
try {
  const parsed = new URL(url);
  allowed =
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
    !parsed.searchParams.has('host');
} catch {}
if (!allowed) {
  console.error('BLOCKED_TEST_DATABASE: use FORGELEX_LOCAL_POSTGRES_URL em PostgreSQL local isolado.');
  process.exit(2);
}
const { db, client } = await createDatabase({ url });
const owner = { tenantId: `analysis_smoke_${randomUUID()}`, userId: randomUUID() };
const checks = [];
function pass(name) {
  checks.push(name);
  console.log('PASS ' + name);
}
try {
  await runPersistenceMigrations(client);
  await runLedgerMigrations(client);
  pass('migration 0030 PostgreSQL');
  const matters = new MatterRepository(db);
  const access = new CaseAiAccessRepository(db);
  const analyses = new CaseAnalysisRepository(db);
  const matter = await matters.createMatter({
    ...owner,
    createdBy: owner.userId,
    title: 'Análise sintética PostgreSQL',
  });
  const doc = await matters.ingestTextDocument({
    ...owner,
    createdBy: owner.userId,
    matterId: matter.id,
    title: 'Contrato sintético',
    originalFilename: 'synthetic.txt',
    mimeType: 'text/plain',
    content: 'Pagamento apenas alegado. Não há recibo.',
  });
  const grantInput = {
    oauthClientId: 'synthetic-host',
    oauthGrantedAt: new Date().toISOString(),
    expectedRevision: 0,
    selection: {
      documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
      factIds: [],
      evidenceIds: [],
      thesisIds: [],
      authorityIds: [],
    },
    analysisPermission: { enabled: true, objective: 'Confrontar alegação' },
  };
  const grant = await access.replace(owner, matter.id, grantInput);
  const reader = {
    ...owner,
    oauthConnection: { clientId: grantInput.oauthClientId, grantedAt: grantInput.oauthGrantedAt },
  };
  const source = {
    documentId: doc.document.id,
    versionId: doc.version.id,
    anchorId: doc.anchors[0].id,
    quote: doc.anchors[0].text,
    relation: 'CONTEXT',
  };
  const input = {
    matterId: matter.id,
    expectedGrantRevision: grant.revision,
    idempotencyKey: randomUUID(),
    objective: 'Confrontar alegação',
    items: [
      { id: 'f1', kind: 'FACT', text: 'A parte alega pagamento', classification: 'ALLEGATION', sources: [source] },
      {
        id: 'q1',
        kind: 'ISSUE',
        text: 'Há comprovação documental de pagamento?',
        classification: 'LEGAL_QUESTION',
        sources: [source],
      },
    ],
  };
  const replies = await Promise.all([analyses.receive(reader, input), analyses.receive(reader, input)]);
  assert.equal(replies[0].id, replies[1].id);
  assert.equal(replies.filter((r) => r.isReplay).length, 1);
  pass('recebimento concorrente produz um recibo');
  assert.deepEqual(
    await analyses.list({ ...owner, tenantId: 'foreign' }, matter.id).catch((e) => e.message),
    'MATTER_NOT_FOUND',
  );
  assert.deepEqual(await analyses.list({ ...owner, userId: 'foreign' }, matter.id), []);
  pass('isolamento tenant e usuário');
  await assert.rejects(
    analyses.receive(reader, {
      ...input,
      items: [{ ...input.items[0], sources: [{ ...source, quote: 'Fonte fabricada' }] }],
    }),
    /ANALYSIS_REFERENCE_INVALID/,
  );
  pass('referência inválida bloqueada');
  await assert.rejects(
    analyses.decide(owner, matter.id, replies[0].id, {
      expectedRevision: 1,
      decisions: [
        { itemId: 'f1', action: 'ADOPT' },
        { itemId: 'absent', action: 'ADOPT' },
      ],
    }),
    /ANALYSIS_ITEM_INVALID/,
  );
  assert.equal((await new FactsEvidenceRepository(db).listFacts(owner.tenantId, matter.id)).length, 0);
  pass('rollback da incorporação parcial');
  const decisions = {
    expectedRevision: 1,
    decisions: [
      { itemId: 'f1', action: 'ADOPT', text: 'Alegação conferida pelo usuário' },
      { itemId: 'q1', action: 'ADOPT' },
    ],
  };
  const attempts = await Promise.allSettled([
    analyses.decide(owner, matter.id, replies[0].id, decisions),
    analyses.decide(owner, matter.id, replies[0].id, decisions),
  ]);
  assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 1);
  assert.match(attempts.find((r) => r.status === 'rejected').reason.message, /ANALYSIS_REVIEW_CONFLICT/);
  const facts = await new FactsEvidenceRepository(db).listFacts(owner.tenantId, matter.id);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].status, 'ASSERTED');
  assert.equal((await new LegalIssueRepository(db).listIssues(owner.tenantId, matter.id)).length, 1);
  pass('decisões concorrentes não duplicam entidades');
  const controller = new AbortController();
  await assert.rejects(
    analyses.receive(
      reader,
      { ...input, idempotencyKey: randomUUID() },
      { signal: controller.signal, revalidate: async () => controller.abort() },
    ),
  );
  assert.equal((await analyses.list(owner, matter.id)).length, 1);
  pass('cancelamento antes do commit não persiste');
  await access.revoke(owner, matter.id, grant.id, grant.revision);
  await assert.rejects(analyses.receive(reader, input), /CASE_CONTEXT_NOT_AUTHORIZED/);
  pass('revogação bloqueia replay');
  await new AccountClosurePurgeService(client).purgePrivateContent({
    tenantId: owner.tenantId,
    closureId: 'synthetic-analysis',
    now: new Date().toISOString(),
  });
  const remaining = await client.execute({
    sql: 'SELECT COUNT(*) AS count FROM case_analysis_receipts WHERE tenant_id=?',
    args: [owner.tenantId],
  });
  assert.equal(Number(remaining.rows[0].count), 0);
  pass('encerramento de conta elimina análises');
  console.log(
    JSON.stringify({
      status: 'passed',
      checks: checks.length,
      scope: 'PostgreSQL local sintético, sem dados reais ou cloud',
    }),
  );
} catch (error) {
  console.error(error?.message ?? 'CASE_ANALYSIS_SMOKE_FAILED');
  process.exitCode = 1;
} finally {
  await new AccountClosurePurgeService(client)
    .purgePrivateContent({
      tenantId: owner.tenantId,
      closureId: 'synthetic-analysis-cleanup',
      now: new Date().toISOString(),
    })
    .catch(() => undefined);
  await client.execute({ sql: 'DELETE FROM matters WHERE tenant_id=?', args: [owner.tenantId] }).catch(() => undefined);
  client.close();
}
