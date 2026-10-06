import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { caseAccessFixture } from '../../../../packages/persistence/src/repositories/matter-lifecycle-fixture.js';
import { createDatabase, MatterRepository, MatterPurgeRepository, MatterLifecycleRepository } from '@forgelex/persistence';
import { journalFixture } from './matter-purge-journal.test.js';
import { MatterPurgeService } from './matter-purge-service.js';
import { MatterPurgeRestoreGate } from './matter-purge-restore.js';

it.each(['document', 'case'])('reapplies %s purge on an actual SQLite snapshot before allowing reads', async kind => {
  const f = await caseAccessFixture(); const j = journalFixture();
  const backupPath = join(tmpdir(), `forgelex-lifecycle-backup-${randomUUID()}.db`);
  let restored: Awaited<ReturnType<typeof createDatabase>> | undefined;
  try {
    await j.journal.provisionAnchor();
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id, ...(kind === 'document' ? { documentId: f.doc.document.id } : {}) };
    const actor = { userId: f.owner.userId, authType: 'web_session' as const, role: 'member' as const, scopes: ['matter:write'] };
    await new MatterLifecycleRepository(f.db).transition(target, actor, 'trash', { expectedLifecycleRevision: 0 });
    await f.client.execute({ sql: 'VACUUM INTO ?', args: [backupPath] });
    await new MatterPurgeService(new MatterPurgeRepository(f.client), j.journal, 's'.repeat(32)).execute(target, actor, { expectedLifecycleRevision: 1, confirmation: target.documentId ?? f.matter.title });
    restored = await createDatabase({ url: pathToFileURL(backupPath).toString() });
    const matters = new MatterRepository(restored.db);
    expect((await matters.getDocumentVersion(target.tenantId, f.doc.document.id, 'web_retained'))?.version.content).toBe(f.doc.version.content);
    const gate = new MatterPurgeRestoreGate(j.journal, new MatterPurgeRepository(restored.client));
    expect(gate.isVerified()).toBe(false);
    expect(await gate.check()).toBe(true);
    expect(await matters.getDocumentVersion(target.tenantId, f.doc.document.id, 'web_retained')).toBeUndefined();
    if (kind === 'case') expect(await matters.getMatter(target.tenantId, target.matterId)).toBeUndefined();
  } finally { restored?.client.close(); f.client.close(); try { rmSync(backupPath, { force: true }); } catch { /* Windows SQLite handles. */ } }
});
