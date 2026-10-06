import { describe, it, expect } from 'vitest';
import { caseAccessFixture } from './matter-lifecycle-fixture.js';
import { MatterLifecycleRepository } from './matter-lifecycle-repository.js';
import type { LifecycleActor } from '@forgelex/domain';
const actor: LifecycleActor = { userId: 'author', role: 'member', authType: 'web_session', scopes: ['matter:write'] };

describe('case and document lifecycle', () => {
  it('restores the previous state and keeps children independent', async () => {
    const f = await caseAccessFixture();
    try {
      const repo = new MatterLifecycleRepository(f.db);
      const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
      const doc = { ...target, documentId: f.doc.document.id };
      await repo.transition(doc, actor, 'trash', { expectedLifecycleRevision: 0 });
      await repo.transition(target, actor, 'archive', { expectedLifecycleRevision: 0 });
      await repo.transition(target, actor, 'trash', { expectedLifecycleRevision: 1 });
      expect(await repo.transition(target, actor, 'restore', { expectedLifecycleRevision: 2 })).toMatchObject({ lifecycleState: 'ARCHIVED', lifecycleRevision: 3 });
      await expect(repo.transition(doc, actor, 'restore', { expectedLifecycleRevision: 1 })).rejects.toThrow('MATTER_NOT_ACTIVE');
      await repo.transition(target, actor, 'restore', { expectedLifecycleRevision: 3 });
      expect((await f.client.execute({ sql: 'SELECT lifecycle_state FROM legal_documents WHERE id=?', args: [doc.documentId] })).rows[0].lifecycle_state).toBe('TRASHED');
      expect((await f.matters.getMatter(target.tenantId, target.matterId))?.status).toBe('OPEN');
    } finally { f.client.close(); }
  });
  it('rejects stale revisions, foreign IDs and users without management', async () => {
    const f = await caseAccessFixture();
    try {
      const repo = new MatterLifecycleRepository(f.db);
      const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
      await expect(repo.transition(target, { ...actor, userId: 'other' }, 'archive', { expectedLifecycleRevision: 0 })).rejects.toThrow('LIFECYCLE_FORBIDDEN');
      await expect(repo.transition({ ...target, tenantId: 'foreign' }, actor, 'archive', { expectedLifecycleRevision: 0 })).rejects.toThrow('MATTER_NOT_FOUND');
      await repo.transition(target, actor, 'archive', { expectedLifecycleRevision: 0 });
      await expect(repo.transition(target, actor, 'archive', { expectedLifecycleRevision: 0 })).rejects.toThrow('LIFECYCLE_CONFLICT');
    } finally { f.client.close(); }
  });
  it('revokes only document grants affected, and case grants for all clients', async () => {
    const f = await caseAccessFixture();
    try {
      await f.repo.replace(f.owner, f.matter.id, f.input);
      const otherDoc = await f.matters.ingestTextDocument({ tenantId: f.owner.tenantId, matterId: f.matter.id, createdBy: actor.userId, title: 'Other', originalFilename: 'other.txt', mimeType: 'text/plain', content: 'Other source' });
      await f.repo.replace(f.owner, f.matter.id, { ...f.input, oauthClientId: 'unaffected', selection: { ...f.selection, documents: [{ documentId: otherDoc.document.id, versionId: otherDoc.version.id }] } });
      const repo = new MatterLifecycleRepository(f.db);
      const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
      await repo.transition({ ...target, documentId: f.doc.document.id }, actor, 'archive', { expectedLifecycleRevision: 0 });
      const grants = await f.repo.listForOwner(f.owner, f.matter.id);
      expect(grants.find(g => g.oauthClientId === 'app-one')).toMatchObject({ status: 'REVOKED', revision: 2 });
      expect(grants.find(g => g.oauthClientId === 'unaffected')?.status).toBe('ACTIVE');
      await repo.transition(target, actor, 'archive', { expectedLifecycleRevision: 0 });
      expect((await f.repo.listForOwner(f.owner, f.matter.id)).every(g => g.status === 'REVOKED')).toBe(true);
      await repo.transition(target, actor, 'restore', { expectedLifecycleRevision: 1 });
      expect((await f.repo.listForOwner(f.owner, f.matter.id)).every(g => g.status === 'REVOKED')).toBe(true);
    } finally { f.client.close(); }
  });
});
