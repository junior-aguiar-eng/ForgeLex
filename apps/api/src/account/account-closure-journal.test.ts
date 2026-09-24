import { describe, expect, it } from 'vitest';
import {
  appendAccepted,
  journalKey,
  openJournalIds,
  prepareJournalClosure,
  sealJournalIds,
  type AccountClosureJournal,
  type JournalEvent,
} from './account-closure-journal.js';

const encryptionKey = Buffer.alloc(32, 7);
const secret = 'j'.repeat(48);

function memoryJournal(): AccountClosureJournal {
  const events = new Map<string, JournalEvent>();
  const id = (event: JournalEvent) => `${event.key}/${event.kind}`;
  return {
    async assertAnchor() {},
    async append(event) {
      if (events.has(id(event))) return 'exists';
      events.set(id(event), event);
      return 'created';
    },
    async read(key, kind) {
      return events.get(`${key}/${kind}`);
    },
    async list() {
      return [...events.values()];
    },
  };
}

describe('account closure journal', () => {
  it('cifra IDs com AAD vinculado à closure e rejeita alteração ou versão desconhecida', () => {
    const ids = { subjectId: 'synthetic', userId: 'user_1', tenantId: 'tenant_1' };
    const sealed = sealJournalIds('v1', encryptionKey, 'closure_1', ids);
    expect(openJournalIds({ v1: encryptionKey }, 'closure_1', sealed)).toEqual(ids);
    expect(JSON.stringify(sealed)).not.toContain('synthetic');
    expect(() => openJournalIds({ v1: encryptionKey }, 'closure_2', sealed)).toThrow(
      'ACCOUNT_CLOSURE_JOURNAL_INTEGRITY',
    );
    expect(() => openJournalIds({}, 'closure_1', sealed)).toThrow('ACCOUNT_CLOSURE_JOURNAL_KEY_UNAVAILABLE');
    expect(() =>
      openJournalIds({ v1: encryptionKey }, 'closure_1', { ...sealed, tag: 'AAAAAAAAAAAAAAAAAAAAAA==' }),
    ).toThrow('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
  });

  it('reusa intenção lógica apesar de nonce novo e recusa conflito de fingerprint', async () => {
    const journal = memoryJournal();
    const key = journalKey(secret, 'synthetic', 'idem_1');
    const base = {
      key,
      closureId: 'closure_1',
      requestFingerprint: 'f'.repeat(64),
      subjectHash: 's'.repeat(64),
      userHash: 'u'.repeat(64),
      tenantHash: 't'.repeat(64),
      statusTokenHash: 'k'.repeat(64),
      idempotencyKeyHash: 'i'.repeat(64),
      policyVersion: 'v1',
      requestedAt: '2026-09-24T12:00:00.000Z',
      sealedIds: sealJournalIds('v1', encryptionKey, 'closure_1', {
        subjectId: 'synthetic',
        userId: 'user_1',
        tenantId: 'tenant_1',
      }),
    };
    const first = await prepareJournalClosure(journal, base, { v1: encryptionKey });
    const replay = await prepareJournalClosure(
      journal,
      {
        ...base,
        closureId: 'closure_2',
        sealedIds: sealJournalIds('v1', encryptionKey, 'closure_2', {
          subjectId: 'synthetic',
          userId: 'user_1',
          tenantId: 'tenant_1',
        }),
      },
      { v1: encryptionKey },
    );
    expect(replay).toEqual(first);
    await expect(
      prepareJournalClosure(journal, { ...base, requestFingerprint: 'x'.repeat(64) }, { v1: encryptionKey }),
    ).rejects.toThrow('ACCOUNT_CLOSURE_JOURNAL_CONFLICT');
    await appendAccepted(journal, first);
    expect((await journal.list()).map((event) => event.kind)).toEqual(['PREPARED', 'ACCEPTED']);
  });
});
