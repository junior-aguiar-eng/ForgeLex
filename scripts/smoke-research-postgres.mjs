import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDatabase, runPersistenceMigrations, ResearchHistoryRepository, JurisprudenceRepository, IngestionRunRepository } from '../packages/persistence/dist/index.js';
import { JurisprudenceSearchService, generateDedupeKey, generateContentHash } from '../packages/legal-data/dist/index.js';
import { ResearchService } from '../packages/legal-tools/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { CanonicalFixtureProvider, SourceRouter } from '../packages/source-providers/dist/index.js';

const databaseUrl = process.env.FORGELEX_LOCAL_POSTGRES_URL;
if (!databaseUrl || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(databaseUrl).hostname)) throw new Error('LOCAL_TEST_POSTGRES_REQUIRED');
const { db, client } = await createDatabase({ url: databaseUrl });
const prefix = `research${randomUUID().replaceAll('-', '')}`;
const history = new ResearchHistoryRepository(db);
const repository = new JurisprudenceRepository(db);
let runId;
const ids = [];
try {
  await runPersistenceMigrations(client);
  await runPersistenceMigrations(client);
  const ledger = new LedgerService(db, client);
  await ledger.provisionAccount(prefix, { paidBalanceCents: 100, promotionalBalanceCents: 0 });
  const operation = { tenantId: prefix, userId: 'solo', idempotencyKey: `${prefix}-billing`, costCents: 20, operation: async () => ({ results: [] }) };
  await ledger.executeBillableOperation(operation);
  const replay = await ledger.executeBillableOperation(operation);
  assert.equal(replay.isReplay, true);
  assert.equal(replay.chargedCents, 0);
  assert.equal(await ledger.getSettledChargeCents(prefix, operation.idempotencyKey), 20);
  assert.equal(await ledger.getAvailableBalanceCents(prefix), 80);
  await assert.rejects(ledger.getSettledChargeCents(`${prefix}other`, operation.idempotencyKey));
  const base = { tenantId: prefix, userId: 'solo', query: 'vazamento', court: 'STJ', resultCount: 1, billingMode: 'METERED', chargedCents: 20 };
  for (let index = 0; index < 25; index++) await history.record({ ...base, judgmentYear: 2023, operationId: `${prefix}-${index}`, createdAt: `2026-10-02T12:00:${String(index).padStart(2, '0')}.000Z` });
  await history.record({ ...base, judgmentYear: 2023, operationId: `${prefix}-24` });
  await history.record({ ...base, operationId: `${prefix}-legacy`, createdAt: '2026-10-02T10:00:00.000Z' });
  await history.record({ ...base, judgmentYear: 2022, operationId: `${prefix}-year`, createdAt: '2026-10-02T09:00:00.000Z' });
  await history.record({ ...base, userId: 'other', operationId: `${prefix}-other-user` });
  await history.record({ ...base, tenantId: `${prefix}other`, operationId: `${prefix}-other-tenant` });
  assert.equal((await history.list(prefix, 'solo', 50)).length, 27);
  const grouped = await history.listGrouped(prefix, 'solo', 1);
  assert.equal(grouped[0].repeatCount, 25);
  assert.equal(grouped[0].operationId, `${prefix}-24`);
  assert.equal(grouped[0].judgmentYear, 2023);
  assert.equal((await history.listGrouped(prefix, 'solo', 50))[1].judgmentYear, null);

  const provider = new CanonicalFixtureProvider();
  const router = new SourceRouter(); router.registerProvider(provider);
  const template = (await provider.search('vazamento', { court: 'STJ' }))[0];
  runId = (await new IngestionRunRepository(db).start({ court: 'STJ', providerId: provider.id })).id;
  const dates = ['2022-12-31', '2023-01-01', '2023-12-31', '2024-01-01'];
  const documents = dates.map((judgmentDate, index) => {
    const id = randomUUID(); ids.push(id);
    const processNumber = `REsp ${prefix}${index}/SP`;
    const syllabus = `${prefix}. ${template.syllabus}`;
    const dedupeKey = generateDedupeKey('STJ', processNumber, judgmentDate);
    const contentHash = generateContentHash(syllabus + template.fullText);
    return { ...template, id, processNumber, judgmentDate, publicationDate: '2024-01-05', syllabus, dedupeKey,
      snapshot: { ...template.snapshot, contentHash }, provenance: { ...template.provenance, id: randomUUID(), source: { ...template.provenance.source, documentId: processNumber, dedupeKey, contentHash }, snippet: syllabus } };
  });
  await repository.upsertDocuments({ documents, ingestionRunId: runId });
  await new IngestionRunRepository(db).complete(runId, { documentsSeen: documents.length, documentsPublished: documents.length });
  const service = new ResearchService(router, new JurisprudenceSearchService(repository));
  const filtered = await service.searchCaseLaw({ query: prefix, court: 'STJ', judgmentYear: 2023, limit: 2 });
  assert.deepEqual(filtered.items.map((item) => item.judgmentDate).sort(), ['2023-01-01', '2023-12-31']);
  assert.equal((await service.searchCaseLaw({ query: prefix, court: 'STJ', limit: 10 })).items.length, 4);
  console.log(JSON.stringify({ status: 'passed', checks: ['migrations_idempotent', 'grouping_before_limit', 'replay_unique_history', 'year_and_identity_isolation', 'nullable_legacy_year', 'judgment_boundaries_before_limit', 'publication_date_independent', 'no_year_compatible', 'replay_original_charge_and_tenant_isolation'] }));
} finally {
  for (const tenantId of [prefix, `${prefix}other`]) await client.execute({ sql: 'DELETE FROM research_search_history WHERE tenant_id = ?', args: [tenantId] });
  for (const sql of ['DELETE FROM ledger_entries WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id = ?)', 'DELETE FROM usage_events WHERE tenant_id = ?', 'DELETE FROM billing_operations WHERE tenant_id = ?', 'DELETE FROM ledger_accounts WHERE tenant_id = ?']) await client.execute({ sql, args: [prefix] });
  for (const id of ids) {
    await client.execute({ sql: 'UPDATE jurisprudence_documents SET current_version_id = NULL WHERE id = ?', args: [id] });
    await client.execute({ sql: 'DELETE FROM jurisprudence_document_versions WHERE document_id = ?', args: [id] });
    await client.execute({ sql: 'DELETE FROM jurisprudence_documents WHERE id = ?', args: [id] });
  }
  if (runId) await client.execute({ sql: 'DELETE FROM jurisprudence_ingestion_runs WHERE id = ?', args: [runId] });
  client.close();
}
