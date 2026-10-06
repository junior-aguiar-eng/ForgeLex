import { it, expect } from 'vitest';
import { caseAccessFixture } from '../../../../packages/persistence/src/repositories/matter-lifecycle-fixture.js';
import { MatterPurgeRepository, MatterLifecycleRepository } from '@forgelex/persistence';
import { journalFixture } from './matter-purge-journal.test.js';
import { MatterPurgeService } from './matter-purge-service.js';
it('finalizes the same committed operation after a terminal outage without repeating deletion', async () => {
  const f = await caseAccessFixture();
  const j = journalFixture();
  try {
    await j.journal.provisionAnchor();
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id, documentId: f.doc.document.id };
    const actor = { userId: f.owner.userId, authType: 'web_session' as const, role: 'member' as const, scopes: ['matter:write'] };
    await new MatterLifecycleRepository(f.db).transition(target, actor, 'trash', { expectedLifecycleRevision: 0 });
    const repo = new MatterPurgeRepository(f.client);
    const complete = j.journal.complete.bind(j.journal);
    j.journal.complete = async () => { throw new Error('MATTER_PURGE_JOURNAL_UNAVAILABLE'); };
    const service = new MatterPurgeService(repo, j.journal, 's'.repeat(32));
    const command = { expectedLifecycleRevision: 1, confirmation: target.documentId };
    await expect(service.execute(target, actor, command)).rejects.toThrow('PURGE_CONFIRMATION_PENDING');
    expect(await f.matters.getDocumentVersion(target.tenantId, target.documentId, 'web_retained')).toBeUndefined();
    j.journal.complete = complete;
    expect(await service.execute(target, actor, command)).toMatchObject({ lifecycleState: 'PURGED', lifecycleRevision: 2 });
    expect((await f.client.execute('SELECT * FROM matter_lifecycle_purge_operations')).rows).toHaveLength(1);
    expect(await j.journal.list()).toHaveLength(2);
    await expect(service.execute(target, actor, command)).rejects.toThrow('LIFECYCLE_CONFLICT');
  } finally { f.client.close(); }
});
