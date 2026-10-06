import { it, expect, vi } from 'vitest';
import { journalFixture } from './matter-purge-journal.test.js';
import { MatterPurgeRestoreGate, type PurgeRecoveryPort } from './matter-purge-restore.js';
it('blocks an aborted journal that contradicts a committed database proof', async () => {
  const f = journalFixture(); await f.journal.provisionAnchor(); await f.journal.prepare(f.intent); await f.journal.abortVerified(f.intent.operationId);
  expect(await new MatterPurgeRestoreGate(f.journal, { localOutcome: async () => 'committed', reapply: vi.fn(), verifyResiduals: vi.fn() }).check()).toBe(false);
});

it('blocks unresolved intents in an older snapshot without inferring rollback', async () => {
  const f = journalFixture();
  const recovery: PurgeRecoveryPort = { localOutcome: async () => 'unknown', reapply: vi.fn(), verifyResiduals: vi.fn() };
  await f.journal.provisionAnchor(); await f.journal.prepare(f.intent);
  expect(await new MatterPurgeRestoreGate(f.journal, recovery).check()).toBe(false);
  expect(recovery.reapply).not.toHaveBeenCalled();
});
it('reapplies completed purge before allowing restored traffic', async () => {
  const f = journalFixture();
  const calls: string[] = [];
  const recovery: PurgeRecoveryPort = { localOutcome: async () => 'unknown', reapply: async () => { calls.push('purge'); }, verifyResiduals: async () => { calls.push('verify'); } };
  await f.journal.provisionAnchor(); await f.journal.prepare(f.intent); await f.journal.complete(f.intent.operationId);
  expect(await new MatterPurgeRestoreGate(f.journal, recovery).check()).toBe(true);
  expect(calls).toEqual(['purge', 'verify']);
});
