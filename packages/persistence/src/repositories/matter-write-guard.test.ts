import { it, expect } from 'vitest';
import { caseAccessFixture } from './case-ai-access-repository.test.js';
import { MatterWriteGuard } from './matter-write-guard.js';
import { MatterLifecycleRepository } from './matter-lifecycle-repository.js';
it('does not execute writes after case revision or state changed', async () => {
  const f = await caseAccessFixture();
  try {
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
    const guard = new MatterWriteGuard(f.db);
    const revision = await guard.captureRevision(target);
    await new MatterLifecycleRepository(f.db).transition(target, { userId: f.owner.userId, role: 'member', authType: 'web_session', scopes: ['matter:write'] }, 'archive', { expectedLifecycleRevision: revision });
    let called = false;
    await expect(guard.run(target, revision, async () => { called = true; })).rejects.toThrow('MATTER_NOT_ACTIVE');
    expect(called).toBe(false);
    await new MatterLifecycleRepository(f.db).transition(target, { userId: f.owner.userId, role: 'member', authType: 'web_session', scopes: ['matter:write'] }, 'restore', { expectedLifecycleRevision: 1 });
    await expect(guard.run(target, revision, async () => { called = true; })).rejects.toThrow('LIFECYCLE_CONFLICT');
    expect(called).toBe(false);
  } finally { f.client.close(); }
});
