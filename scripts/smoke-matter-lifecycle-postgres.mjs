import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDatabase, runPersistenceMigrations, MatterRepository, MatterLifecycleRepository, MatterPurgeRepository, MatterWriteGuard, FactsEvidenceRepository, CaseAiAccessRepository, DraftRepository, DraftAiReceiptRepository, DraftReviewRunRepository, reviewContextHash } from '../packages/persistence/dist/index.js';
import { matters as matterTable } from '../packages/persistence/dist/schema/schema.js';
import { CaseContextService } from '../packages/legal-tools/dist/index.js';
import { DurableMatterPurgeJournal } from '../apps/api/dist/matters/matter-purge-journal.js';
import { MatterPurgeService } from '../apps/api/dist/matters/matter-purge-service.js';
import { MatterPurgeRestoreGate } from '../apps/api/dist/matters/matter-purge-restore.js';

const rawUrl = process.env.FORGELEX_LOCAL_POSTGRES_URL;
let base;
try { base = new URL(rawUrl); } catch { throw new Error('BLOCKED_TEST_DATABASE'); }
if (!['postgres:', 'postgresql:'].includes(base.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.searchParams.has('host')) throw new Error('BLOCKED_TEST_DATABASE');
const name = `forgelex_lifecycle_${randomUUID().replaceAll('-', '')}`;
assert.match(name, /^forgelex_lifecycle_[a-f0-9]{32}$/);
const admin = await createDatabase({ url: rawUrl });
const isolated = new URL(base); isolated.pathname = '/' + name;
let connection;
const directory = mkdtempSync(join(tmpdir(), 'forgelex-lifecycle-pg-'));
const backup = join(directory, 'before-purge.dump');
const objects = new Map();
const journal = new DurableMatterPurgeJournal({ read: async key => objects.get(key), list: async () => [...objects.keys()], writeOnce: async (key, value) => { if (objects.has(key)) return false; objects.set(key, value); return true; } }, { key: Buffer.alloc(32, 17), macSecret: 'synthetic-postgres-secret-32-bytes', anchorId: 'synthetic-postgres-anchor' });
const actor = { userId: 'author', role: 'member', authType: 'web_session', scopes: ['matter:write'] };
const owner = { tenantId: 'tenant-lifecycle-test', userId: actor.userId };
const checks = [];
const passed = name => { checks.push(name); console.log(`PASS ${name}`); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function bounded(promise) { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('BARRIER_TIMEOUT')), 15000); })]); } finally { clearTimeout(timer); } }

// Observe the actual parent UPDATE attempt and acquisition; no timing-based sleeps.
function lockGate(db, hold = false) {
  const attempted = deferred(), locked = deferred(), release = deferred(); let used = false;
  const proxy = new Proxy(db, { get(target, key) {
    if (key !== 'transaction') { const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; }
    return body => target.transaction(tx => body(new Proxy(tx, { get(transaction, method) {
      if (method !== 'update') { const value = Reflect.get(transaction, method); return typeof value === 'function' ? value.bind(transaction) : value; }
      return table => {
        const builder = transaction.update(table);
        if (table !== matterTable || used) return builder;
        used = true;
        const wrap = query => ({ returning: () => wrap(query.returning()), then: (resolve, reject) => { attempted.resolve(); return query.then(async result => { locked.resolve(); if (hold) await bounded(release.promise); return result; }).then(resolve, reject); } });
        return { set: values => ({ where: predicate => wrap(builder.set(values).where(predicate)) }) };
      };
    } }))); } });
  return { db: proxy, attempted: attempted.promise, locked: locked.promise, release: release.resolve };
}

try {
  await admin.client.execute(`CREATE DATABASE ${name}`);
  connection = await createDatabase({ url: isolated.toString() });
  await runPersistenceMigrations(connection.client); await journal.provisionAnchor();
  let { db, client } = connection;
  let matters = new MatterRepository(db);
  const make = title => matters.createMatter({ ...owner, createdBy: actor.userId, title });
  const matter = await make('Case with real row barriers');
  const target = { tenantId: owner.tenantId, matterId: matter.id };

  // Write obtains lock first: it commits, then archiving revokes all further writes.
  const entered = deferred(), release = deferred();
  const writer = new MatterWriteGuard(db).run(target, 0, async tx => {
    const fact = await new FactsEvidenceRepository(tx).createFact({ ...target, createdBy: actor.userId, statement: 'Write before archive', category: 'OTHER' });
    entered.resolve(); await bounded(release.promise); return fact;
  });
  await bounded(entered.promise);
  const archiveGate = lockGate(db);
  const archive = new MatterLifecycleRepository(archiveGate.db).transition(target, actor, 'archive', { expectedLifecycleRevision: 0 });
  await bounded(archiveGate.attempted); release.resolve();
  await bounded(writer); await bounded(archive);
  assert.equal(Number((await client.execute({ sql: 'SELECT COUNT(*) AS count FROM facts WHERE matter_id=?', args: [matter.id] })).rows[0].count), 1);
  await assert.rejects(() => new FactsEvidenceRepository(db).createFact({ ...target, createdBy: actor.userId, statement: 'Late write', category: 'OTHER' }), /MATTER_NOT_ACTIVE/);
  passed('write-before-archive is serialized');

  await new MatterLifecycleRepository(db).transition(target, actor, 'restore', { expectedLifecycleRevision: 1 });
  // Archive obtains lock first: a writer awaiting that row must see the committed state.
  const first = lockGate(db, true), second = lockGate(db);
  const archiveFirst = new MatterLifecycleRepository(first.db).transition(target, actor, 'archive', { expectedLifecycleRevision: 2 });
  await bounded(first.locked);
  const lateWrite = new MatterWriteGuard(second.db).run(target, 2, async tx => new FactsEvidenceRepository(tx).createFact({ ...target, createdBy: actor.userId, statement: 'Blocked after lock', category: 'OTHER' }));
  const rejection = assert.rejects(lateWrite, /MATTER_NOT_ACTIVE|LIFECYCLE_CONFLICT/);
  await bounded(second.attempted); first.release(); await bounded(archiveFirst); await bounded(rejection);
  await new MatterLifecycleRepository(db).transition(target, actor, 'restore', { expectedLifecycleRevision: 3 });
  await assert.rejects(() => new MatterWriteGuard(db).run(target, 2, async () => undefined), /LIFECYCLE_CONFLICT/);
  passed('archive-before-write and archive-restore revision conflict');

  const race = await Promise.allSettled(['archive', 'trash'].map(action => new MatterLifecycleRepository(db).transition(target, actor, action, { expectedLifecycleRevision: 4 })));
  assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(race.filter(r => r.status === 'rejected').length, 1);
  passed('concurrent lifecycle compare-and-swap has one winner');

  async function receiptFixture() {
    const matter = await make('Receipt race');
    const target = { tenantId: owner.tenantId, matterId: matter.id };
    const doc = await matters.ingestTextDocument({ ...target, createdBy: actor.userId, title: 'Source', originalFilename: 'source.txt', mimeType: 'text/plain', content: 'Selected source' });
    const permission = { oauthClientId: randomUUID(), oauthGrantedAt: '2026-10-06T12:00:00.000Z', expectedRevision: 0, selection: { documents: [{ documentId: doc.document.id, versionId: doc.version.id }], factIds: [], evidenceIds: [], thesisIds: [], authorityIds: [] }, receivePermission: { enabled: true, destination: { mode: 'NEW' } } };
    await new CaseAiAccessRepository(db).replace(owner, matter.id, permission);
    return { matter, target, reader: { ...owner, oauthConnection: { clientId: permission.oauthClientId, grantedAt: permission.oauthGrantedAt } }, input: { matterId: matter.id, expectedGrantRevision: 1, idempotencyKey: randomUUID(), title: 'External draft', sections: [{ ordinal: 0, title: 'Facts', content: 'External pending review' }], references: [] } };
  }
  for (const archiveWins of [true, false]) {
    const f = await receiptFixture(), holder = lockGate(db, true), waiter = lockGate(db);
    const first = archiveWins ? new MatterLifecycleRepository(holder.db).transition(f.target, actor, 'archive', { expectedLifecycleRevision: 0 }) : new DraftAiReceiptRepository(holder.db).receive(f.reader, f.input);
    await bounded(holder.locked);
    const second = archiveWins ? new DraftAiReceiptRepository(waiter.db).receive(f.reader, f.input) : new MatterLifecycleRepository(waiter.db).transition(f.target, actor, 'archive', { expectedLifecycleRevision: 0 });
    const result = archiveWins ? assert.rejects(second, /MATTER_NOT_ACTIVE|CASE_CONTEXT_NOT_AUTHORIZED/) : second;
    await bounded(waiter.attempted); holder.release();
    const committed = await bounded(first); await bounded(result);
    const receipts = new DraftAiReceiptRepository(db);
    await assert.rejects(() => receipts.receive(f.reader, f.input), /MATTER_NOT_ACTIVE|CASE_CONTEXT_NOT_AUTHORIZED/);
    if (!archiveWins) await assert.rejects(() => receipts.adopt(owner, f.matter.id, committed.draftId, committed.versionId, committed.versionId), /MATTER_NOT_ACTIVE/);
    assert.equal(Number((await client.execute({ sql: 'SELECT COUNT(*) AS count FROM draft_ai_receipts WHERE matter_id=?', args: [f.matter.id] })).rows[0].count), archiveWins ? 0 : 1);
  }
  passed('receipt-before-archive and archive-before-receipt; replay and adoption denied');

  async function approvalFixture() {
    const matter = await make('Approval race'), target = { tenantId: owner.tenantId, matterId: matter.id }, context = { ...target, userId: actor.userId };
    const drafts = new DraftRepository(db);
    const draft = await drafts.createDraft({ ...target, createdBy: actor.userId, title: 'Draft for approval' });
    const bundle = await drafts.createVersion({ ...target, draftId: draft.id, createdBy: actor.userId, title: draft.title, source: 'HUMAN', contentHash: 'a'.repeat(64), sections: [{ ordinal: 0, title: 'Facts', content: 'Reviewed text' }] });
    const runs = new DraftReviewRunRepository(db), run = await runs.start(context, bundle.version, 'ALL', reviewContextHash(await drafts.reviewContext(context, bundle)));
    await runs.finish(context, run.id, { state: 'COMPLETE', status: 'PASSED', checks: [], findings: [] });
    const approval = await drafts.createApprovalRequest({ ...target, draftId: draft.id, draftVersionId: bundle.version.id, requestedBy: actor.userId, proposedAction: 'Approve synthetic draft' });
    return { target, approval, resolve: { tenantId: owner.tenantId, token: approval.token, decision: 'APPROVED', decidedBy: actor.userId } };
  }
  for (const archiveWins of [true, false]) {
    const f = await approvalFixture(), holder = lockGate(db, true), waiter = lockGate(db);
    const first = archiveWins ? new MatterLifecycleRepository(holder.db).transition(f.target, actor, 'archive', { expectedLifecycleRevision: 0 }) : new DraftRepository(holder.db).resolveApproval(f.resolve);
    await bounded(holder.locked);
    const second = archiveWins ? new DraftRepository(waiter.db).resolveApproval(f.resolve) : new MatterLifecycleRepository(waiter.db).transition(f.target, actor, 'archive', { expectedLifecycleRevision: 0 });
    const result = archiveWins ? assert.rejects(second, /MATTER_NOT_ACTIVE/) : second;
    await bounded(waiter.attempted); holder.release(); await bounded(first); await bounded(result);
    assert.equal((await client.execute({ sql: 'SELECT status FROM draft_approval_requests WHERE id=?', args: [f.approval.request.id] })).rows[0].status, archiveWins ? 'PENDING' : 'APPROVED');
  }
  passed('approval-before-archive and archive-before-approval are serialized');

  const sourceCase = await make('Selected documents');
  const sourceTarget = { tenantId: owner.tenantId, matterId: sourceCase.id };
  const doc = await matters.ingestTextDocument({ ...sourceTarget, createdBy: actor.userId, title: 'Source', originalFilename: 'source.txt', mimeType: 'text/plain', content: 'Private source content before purge' });
  const access = new CaseAiAccessRepository(db);
  const input = { oauthClientId: 'app-one', oauthGrantedAt: '2026-10-06T12:00:00.000Z', expectedRevision: 0, selection: { documents: [{ documentId: doc.document.id, versionId: doc.version.id }], factIds: [], evidenceIds: [], thesisIds: [], authorityIds: [] } };
  await access.replace(owner, sourceCase.id, input);
  const reader = { ...owner, oauthConnection: { clientId: input.oauthClientId, grantedAt: input.oauthGrantedAt } };
  const service = new CaseContextService(access);
  const response = await service.getContext(reader, { matterId: sourceCase.id });
  const selected = deferred(), releaseRead = deferred();
  const inflight = new CaseContextService(new Proxy(access, { get(repository, key) { if (key === 'loadSelection') return async (...args) => { const data = await repository.loadSelection(...args); selected.resolve(); await bounded(releaseRead.promise); return data; }; const value = Reflect.get(repository, key); return typeof value === 'function' ? value.bind(repository) : value; } })).getContext(reader, { matterId: sourceCase.id });
  const deniedRead = assert.rejects(inflight, /CASE_CONTEXT_NOT_AUTHORIZED/);
  await bounded(selected.promise);
  await new MatterLifecycleRepository(db).transition({ ...sourceTarget, documentId: doc.document.id }, actor, 'archive', { expectedLifecycleRevision: 0 });
  releaseRead.resolve(); await bounded(deniedRead);
  await assert.rejects(() => service.revalidateResponse(reader, response), /CASE_CONTEXT_NOT_AUTHORIZED/);
  await new MatterLifecycleRepository(db).transition({ ...sourceTarget, documentId: doc.document.id }, actor, 'restore', { expectedLifecycleRevision: 1 });
  await assert.rejects(() => service.getContext(reader, { matterId: sourceCase.id }), /CASE_CONTEXT_NOT_AUTHORIZED/);
  passed('document archive revokes OAuth page and does not reactivate after restore');

  const wholeCase = await make('Case for backup purge');
  const wholeTarget = { tenantId: owner.tenantId, matterId: wholeCase.id };
  await matters.ingestTextDocument({ ...wholeTarget, createdBy: actor.userId, title: 'Private file', originalFilename: 'private.txt', mimeType: 'text/plain', content: 'Case private content before purge' });
  // Real PostgreSQL dump before deletion; the journal stays outside the database.
  execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-acl', '--file', backup, isolated.toString()], { stdio: 'pipe' });
  const purge = new MatterPurgeService(new MatterPurgeRepository(client), journal, 'synthetic-purge-operation-secret-32-bytes');
  await new MatterLifecycleRepository(db).transition({ ...sourceTarget, documentId: doc.document.id }, actor, 'trash', { expectedLifecycleRevision: 2 });
  await purge.execute({ ...sourceTarget, documentId: doc.document.id }, actor, { expectedLifecycleRevision: 3, confirmation: doc.document.id });
  await new MatterLifecycleRepository(db).transition(wholeTarget, actor, 'trash', { expectedLifecycleRevision: 0 });
  await purge.execute(wholeTarget, actor, { expectedLifecycleRevision: 1, confirmation: wholeCase.title });
  passed('document and case definitive purge');

  await client.close(); connection = undefined;
  await admin.client.execute(`DROP DATABASE ${name}`);
  await admin.client.execute(`CREATE DATABASE ${name}`);
  execFileSync('pg_restore', ['--no-owner', '--no-acl', '--dbname', isolated.toString(), backup], { stdio: 'pipe' });
  connection = await createDatabase({ url: isolated.toString() }); ({ db, client } = connection);
  matters = new MatterRepository(db);
  assert.ok(await matters.getDocumentVersion(owner.tenantId, doc.document.id, 'web_retained'));
  assert.ok(await matters.getMatter(owner.tenantId, wholeCase.id));
  const gate = new MatterPurgeRestoreGate(journal, new MatterPurgeRepository(client));
  assert.equal(gate.isVerified(), false);
  assert.equal(await gate.check(), true);
  assert.equal(await matters.getDocumentVersion(owner.tenantId, doc.document.id, 'web_retained'), undefined);
  assert.equal(await matters.getMatter(owner.tenantId, wholeCase.id), undefined);
  assert.ok(await matters.getMatter(owner.tenantId, sourceCase.id));
  assert.equal(await gate.check(), true);
  passed('actual pg_dump/pg_restore reapplies both deletions before gate opens');
  console.log(JSON.stringify({ status: 'passed', driver: 'postgres', checks }));
} catch (error) {
  console.error(`MATTER_LIFECYCLE_POSTGRES_FAILED: ${error instanceof Error ? error.name : 'Error'}`);
  process.exitCode = 1;
} finally {
  await connection?.client.close();
  await admin.client.execute(`DROP DATABASE IF EXISTS ${name}`).catch(() => { process.exitCode = 1; });
  await admin.client.close();
  const checked = resolve(directory);
  assert.ok(checked.startsWith(resolve(tmpdir()) + '/') || checked.startsWith(resolve(tmpdir()) + '\\'));
  assert.ok(checked.includes('forgelex-lifecycle-pg-'));
  rmSync(checked, { recursive: true, force: true });
}
