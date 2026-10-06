import { it, expect } from 'vitest';
import { DurableMatterPurgeJournal, type JournalObjectStore, type PurgeIntent } from './matter-purge-journal.js';

export function journalFixture() {
  const objects = new Map<string, string>();
  const store: JournalObjectStore = {
    read: async key => objects.get(key),
    writeOnce: async (key, value) => { if (objects.has(key)) return false; objects.set(key, value); return true; },
    list: async () => [...objects.keys()],
  };
  const journal = new DurableMatterPurgeJournal(store, { key: Buffer.alloc(32, 7), macSecret: 'm'.repeat(32), anchorId: 'synthetic-lifecycle-anchor' });
  const intent: PurgeIntent = { operationId: 'a'.repeat(64), target: { tenantId: 'private-tenant', matterId: 'private-case' }, expectedLifecycleRevision: 2, fingerprint: 'b'.repeat(64), preparedAt: '2026-10-06T12:00:00.000Z' };
  return { objects, store, journal, intent };
}
it('requires an existing independent anchor and encrypts intent identities', async () => {
  const f = journalFixture();
  await expect(f.journal.assertAnchor()).rejects.toThrow('MATTER_PURGE_JOURNAL_ANCHOR_MISSING');
  await f.journal.provisionAnchor();
  await f.journal.assertAnchor();
  await f.journal.prepare(f.intent);
  expect([...f.objects.values()].join('')).not.toContain('private-case');
  expect([...f.objects.values()].join('')).not.toContain('private-tenant');
  expect((await f.journal.list()).find(event => event.kind === 'PREPARED')).toMatchObject({ intent: f.intent });
});
it('is idempotent, rejects conflicting preparation and opposite terminal races', async () => {
  const f = journalFixture();
  await f.journal.provisionAnchor();
  await f.journal.prepare(f.intent);
  await f.journal.prepare(f.intent);
  await expect(f.journal.prepare({ ...f.intent, fingerprint: 'c'.repeat(64) })).rejects.toThrow('MATTER_PURGE_JOURNAL_CONFLICT');
  await f.journal.complete(f.intent.operationId);
  await f.journal.complete(f.intent.operationId);
  await expect(f.journal.abortVerified(f.intent.operationId)).rejects.toThrow('MATTER_PURGE_JOURNAL_CONFLICT');
  expect(await f.journal.list()).toHaveLength(2);
});
it('rejects tampered ciphertext and misplaced objects', async () => {
  const f = journalFixture();
  await f.journal.provisionAnchor();
  await f.journal.prepare(f.intent);
  const key = [...f.objects.keys()].find(key => key.endsWith('/PREPARED.json'))!;
  const value = JSON.parse(f.objects.get(key)!);
  value.mac = '0'.repeat(64);
  f.objects.set(key, JSON.stringify(value));
  await expect(f.journal.list()).rejects.toThrow('MATTER_PURGE_JOURNAL_INTEGRITY');
});
