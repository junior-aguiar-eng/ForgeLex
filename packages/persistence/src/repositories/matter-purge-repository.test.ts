import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { caseAccessFixture } from './matter-lifecycle-fixture.js';
import { MatterPurgeRepository } from './matter-purge-repository.js';
import { MatterLifecycleRepository } from './matter-lifecycle-repository.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { DraftRepository } from './draft-repository.js';
import type { MatterPurgeIntent } from '@forgelex/domain';
import { runLedgerMigrations } from '@forgelex/billing-ledger';

it('redacts all document versions without deleting source links or copied draft text', async () => {
  const f = await caseAccessFixture();
  try {
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id, documentId: f.doc.document.id };
    const actor = { userId: f.owner.userId, authType: 'web_session' as const, role: 'member' as const, scopes: ['matter:write'] };
    const facts = new FactsEvidenceRepository(f.db);
    const fact = await facts.createFact({ ...target, createdBy: actor.userId, statement: 'Existing copied text', category: 'OTHER' });
    await facts.linkFactToAnchor({ ...target, factId: fact.id, documentAnchorId: f.doc.anchors[0].id, relation: 'SUPPORTS' });
    const drafts = new DraftRepository(f.db);
    const draft = await drafts.createDraft({ ...target, createdBy: actor.userId, title: 'Draft original' });
    const bundle = await drafts.createVersion({ ...target, draftId: draft.id, createdBy: actor.userId, title: draft.title, source: 'HUMAN', contentHash: 'a'.repeat(64), sections: [{ ordinal: 0, title: 'Facts', content: 'Existing copied text' }] });
    await f.client.execute({ sql: 'INSERT INTO document_versions(id,document_id,version_number,content_hash,content,created_at) VALUES(?,?,?,?,?,?)', args: [randomUUID(), target.documentId, 2, 'b'.repeat(64), 'Second original version', new Date().toISOString()] });
    await new MatterLifecycleRepository(f.db).transition(target, actor, 'trash', { expectedLifecycleRevision: 0 });
    const intent: MatterPurgeIntent = { operationId: 'a'.repeat(64), target, expectedLifecycleRevision: 1, fingerprint: 'b'.repeat(64), preparedAt: new Date().toISOString() };
    const repo = new MatterPurgeRepository(f.client);
    expect(await repo.purge(target, actor, { expectedLifecycleRevision: 1, confirmation: target.documentId }, intent)).toMatchObject({ lifecycleState: 'PURGED', lifecycleRevision: 2 });
    expect((await f.client.execute({ sql: 'SELECT content FROM document_versions WHERE document_id=?', args: [target.documentId] })).rows.every(row => row.content === '')).toBe(true);
    expect((await f.client.execute({ sql: 'SELECT text FROM document_anchors WHERE document_version_id=?', args: [f.doc.version.id] })).rows.every(row => row.text === '')).toBe(true);
    expect((await facts.listFactSourceLinks(target.tenantId, target.matterId)).length).toBe(1);
    expect((await drafts.getVersion(target.tenantId, target.matterId, draft.id, bundle.version.id))?.sections[0].content).toBe('Existing copied text');
    expect(await f.matters.getDocumentVersion(target.tenantId, target.documentId)).toBeUndefined();
    await repo.verifyResiduals(target);
  } finally { f.client.close(); }
});

it('purges only one case with real foreign keys enabled', async () => {
  const f = await caseAccessFixture();
  try {
    await f.client.execute('PRAGMA foreign_keys=ON');
    await runLedgerMigrations(f.client);
    await f.client.execute({ sql: 'INSERT INTO ledger_accounts(id,tenant_id,paid_balance_cents,promotional_balance_cents,created_at,updated_at) VALUES(?,?,?,?,?,?)', args: ['ledger-purge-isolation', f.owner.tenantId, 12500, 500, '2026-10-06', '2026-10-06'] });
    const ledgerBefore = (await f.client.execute('SELECT * FROM ledger_accounts')).rows;
    const other = await f.matters.createMatter({ tenantId: f.owner.tenantId, createdBy: f.owner.userId, title: 'Other preserved case' });
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
    const actor = { userId: f.owner.userId, authType: 'web_session' as const, role: 'member' as const, scopes: ['matter:write'] };
    await f.repo.replace(f.owner, target.matterId, f.input);
    await new MatterLifecycleRepository(f.db).transition(target, actor, 'trash', { expectedLifecycleRevision: 0 });
    const intent = { operationId: 'c'.repeat(64), target, expectedLifecycleRevision: 1, fingerprint: 'd'.repeat(64), preparedAt: new Date().toISOString() };
    const repo = new MatterPurgeRepository(f.client);
    await repo.purge(target, actor, { expectedLifecycleRevision: 1, confirmation: f.matter.title }, intent);
    expect(await f.matters.getMatter(target.tenantId, target.matterId)).toBeUndefined();
    expect((await f.matters.getMatter(target.tenantId, other.id))?.title).toBe(other.title);
    await repo.verifyResiduals(target);
    expect((await f.client.execute('SELECT * FROM ledger_accounts')).rows).toEqual(ledgerBefore);
    expect((await f.client.execute('PRAGMA foreign_key_check')).rows).toEqual([]);
  } finally { f.client.close(); }
});

it('rejects purge outside trash and rolls back all children on database failure', async () => {
  const f = await caseAccessFixture();
  try {
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
    const actor = { userId: f.owner.userId, authType: 'web_session' as const, role: 'member' as const, scopes: ['matter:write'] };
    const repo = new MatterPurgeRepository(f.client);
    const intent = { operationId: 'e'.repeat(64), target, expectedLifecycleRevision: 0, fingerprint: 'f'.repeat(64), preparedAt: new Date().toISOString() };
    await expect(repo.purge(target, actor, { expectedLifecycleRevision: 0, confirmation: f.matter.title }, intent)).rejects.toThrow('LIFECYCLE_CONFLICT');
    await new MatterLifecycleRepository(f.db).transition(target, actor, 'trash', { expectedLifecycleRevision: 0 });
    await f.client.execute("CREATE TRIGGER purge_rollback BEFORE UPDATE ON matters WHEN NEW.lifecycle_state='PURGED' BEGIN SELECT RAISE(ABORT,'synthetic purge failure'); END");
    const failedIntent = { ...intent, operationId: '9'.repeat(64), expectedLifecycleRevision: 1 };
    await expect(repo.purge(target, actor, { expectedLifecycleRevision: 1, confirmation: f.matter.title }, failedIntent)).rejects.toMatchObject({ rollbackVerified: true });
    expect((await f.matters.getMatter(target.tenantId, target.matterId))?.lifecycleState).toBe('TRASHED');
    expect((await f.matters.getDocumentVersion(target.tenantId, f.doc.document.id, 'web_retained'))?.version.content).toBe(f.doc.version.content);
    expect(await repo.localOutcome(failedIntent.operationId)).toBe('rolled_back');
  } finally { f.client.close(); }
});
