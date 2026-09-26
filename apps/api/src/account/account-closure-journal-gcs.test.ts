import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { Storage } from '@google-cloud/storage';
import { GcsAccountClosureJournal } from './account-closure-journal-gcs.js';
import type { JournalEvent } from './account-closure-journal.js';

const prepared: JournalEvent = {
  schemaVersion: 1,
  kind: 'PREPARED',
  key: 'a'.repeat(64),
  closureId: 'closure_1',
  subjectHash: 'b'.repeat(64),
  userHash: 'c'.repeat(64),
  tenantHash: 'd'.repeat(64),
  statusTokenHash: 'e'.repeat(64),
  idempotencyKeyHash: 'f'.repeat(64),
  requestFingerprint: '1'.repeat(64),
  policyVersion: 'v1',
  requestedAt: '2026-09-24T12:00:00.000Z',
  sealedIds: { keyVersion: 'v1', nonce: 'AA==', ciphertext: 'AA==', tag: 'AA==' },
};

describe('GcsAccountClosureJournal', () => {
  it('cria objeto somente se ausente e valida MAC ao reler', async () => {
    const objects = new Map<string, Buffer>();
    const anchorId = 'synthetic_anchor_1234567890';
    const anchorMac = createHmac('sha256', 'm'.repeat(64))
      .update('forgelex-account-closure-anchor\0')
      .update(anchorId)
      .digest('hex');
    objects.set('closures/anchor.json', Buffer.from(JSON.stringify({ anchorId, mac: anchorMac })));
    const save = vi.fn(async (name: string, body: Buffer, options: unknown) => {
      expect(options).toMatchObject({ resumable: false, preconditionOpts: { ifGenerationMatch: 0 } });
      if (objects.has(name)) throw Object.assign(new Error('exists'), { code: 412 });
      objects.set(name, body);
    });
    const storage = {
      bucket: () => ({
        file: (name: string) => ({
          name,
          save: (body: Buffer, options: unknown) => save(name, body, options),
          download: async () => {
            const body = objects.get(name);
            if (!body) throw Object.assign(new Error('missing'), { code: 404 });
            return [body];
          },
        }),
        getFiles: async () => [[...objects.keys()].map((name) => ({ name }))],
      }),
    } as unknown as Storage;
    const journal = new GcsAccountClosureJournal('synthetic-bucket', 'm'.repeat(64), storage);
    await expect(journal.assertAnchor(anchorId)).resolves.toBeUndefined();
    await expect(journal.assertAnchor('other_anchor_1234567890')).rejects.toThrow('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
    expect(await journal.append(prepared)).toBe('created');
    expect(await journal.append(prepared)).toBe('exists');
    expect(save).toHaveBeenCalledTimes(2);
    expect(await journal.read(prepared.key, 'PREPARED')).toEqual(prepared);
    expect(await journal.list()).toEqual([prepared]);
    const path = `closures/${prepared.key}/PREPARED.json`;
    objects.set(path, Buffer.from(objects.get(path)!.toString().replace('closure_1', 'closure_2')));
    await expect(journal.list()).rejects.toThrow('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
  });
});
