import { describe, expect, it, vi } from 'vitest';
import type { AccountClosureRecord, AccountClosureRepository } from '@forgelex/persistence';
import { digestClosureValue } from './account-closure-crypto.js';
import { sealJournalIds, type AccountClosureJournal, type JournalEvent } from './account-closure-journal.js';
import { AccountClosureRestoreGate } from './account-closure-restore.js';

const secret = 'h'.repeat(64);
const encryptionKey = Buffer.alloc(32, 7);
const ids = { subjectId: 'synthetic', userId: 'user_1', tenantId: 'tenant_1' };
const prepared: JournalEvent = {
  schemaVersion: 1,
  kind: 'PREPARED',
  key: 'a'.repeat(64),
  closureId: 'closure_1',
  subjectHash: digestClosureValue(secret, ids.subjectId),
  userHash: digestClosureValue(secret, ids.userId),
  tenantHash: digestClosureValue(secret, ids.tenantId),
  statusTokenHash: 'b'.repeat(64),
  idempotencyKeyHash: 'c'.repeat(64),
  requestFingerprint: 'd'.repeat(64),
  policyVersion: 'v1',
  requestedAt: '2026-09-24T12:00:00.000Z',
  sealedIds: sealJournalIds('v1', encryptionKey, 'closure_1', ids),
};
const accepted: JournalEvent = {
  schemaVersion: 1,
  kind: 'ACCEPTED',
  key: prepared.key,
  closureId: prepared.closureId,
  recordedAt: '2026-09-24T12:00:01.000Z',
};

describe('AccountClosureRestoreGate', () => {
  it('fecha PREPARED pendente com ACCEPTED a partir de tombstone comprovado, sem depender do login', async () => {
    const events: JournalEvent[] = [prepared];
    const journal: AccountClosureJournal = {
      assertAnchor: async () => {},
      list: async () => [...events],
      read: async (key, kind) => events.find((event) => event.key === key && event.kind === kind),
      append: async (event) => {
        events.push(event);
        return 'created';
      },
    };
    const local = {
      id: prepared.closureId,
      subjectHash: prepared.subjectHash,
      userHash: prepared.userHash,
      tenantHash: prepared.tenantHash,
      statusTokenHash: prepared.statusTokenHash,
      idempotencyKeyHash: prepared.idempotencyKeyHash,
      requestFingerprint: prepared.requestFingerprint,
      policyVersion: prepared.policyVersion,
      status: 'ACCESS_BLOCKED',
      requestedAt: prepared.requestedAt,
      updatedAt: prepared.requestedAt,
      accessBlockedAt: prepared.requestedAt,
      attemptCount: 0,
    } as AccountClosureRecord;
    const repository = {
      findBySubjectHash: async () => local,
      assertPendingAccessBlocked: vi.fn(async () => {}),
    } as unknown as AccountClosureRepository;
    const gate = new AccountClosureRestoreGate({
      journal,
      repository,
      residualVerifier: {
        verifyResiduals: vi.fn(async () => ({
          privateRows: 0,
          activeCredentials: 0,
          unredactedSnapshots: 0,
          retainedFinancialRows: 0,
          heldCategories: [],
        })),
      },
      subjectHashSecret: secret,
      journalEncryptionKeys: { v1: encryptionKey },
      journalAnchorId: 'synthetic_anchor_1234567890',
    });
    expect(await gate.check()).toBe(true);
    expect(events.map((event) => event.kind)).toEqual(['PREPARED', 'ACCEPTED']);
  });

  it('fecha em intenção ambígua e backup sem tombstone; reabre apenas após saga completa', async () => {
    let events: JournalEvent[] = [prepared];
    let current: AccountClosureRecord | undefined;
    let residualViolation = false;
    const journal = {
      list: vi.fn(async () => events),
      assertAnchor: vi.fn(async () => {}),
    } as unknown as AccountClosureJournal;
    const repository = {
      findBySubjectHash: vi.fn(async () => current),
      findById: vi.fn(async () => current),
      assertPendingAccessBlocked: vi.fn(async () => {}),
      assertCompletedIdentityRemoved: vi.fn(async () => {
        if (residualViolation) throw new Error('ACCOUNT_CLOSURE_RESIDUAL_IDENTITY');
      }),
      restoreAccepted: vi.fn(async (input: { id: string }) => {
        current = {
          id: input.id,
          subjectHash: prepared.subjectHash,
          userHash: prepared.userHash,
          tenantHash: prepared.tenantHash,
          statusTokenHash: prepared.statusTokenHash,
          idempotencyKeyHash: prepared.idempotencyKeyHash,
          requestFingerprint: prepared.requestFingerprint,
          policyVersion: 'v1',
          status: 'ACCESS_BLOCKED',
          requestedAt: prepared.requestedAt,
          updatedAt: prepared.requestedAt,
          accessBlockedAt: prepared.requestedAt,
          attemptCount: -1,
        };
        return current;
      }),
      listSteps: vi.fn(async () =>
        Array.from({ length: 5 }, () => ({
          status: current?.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
        })),
      ),
    } as unknown as AccountClosureRepository;
    const runOneForClosure = vi.fn(async () => {
      if (current) current = { ...current, status: 'COMPLETED', attemptCount: 0 };
      return 'completed' as const;
    });
    const gate = new AccountClosureRestoreGate({
      journal,
      repository,
      residualVerifier: {
        verifyResiduals: vi.fn(async () => ({
          privateRows: 0,
          activeCredentials: 0,
          unredactedSnapshots: 0,
          retainedFinancialRows: 0,
          heldCategories: [],
        })),
      },
      reconciler: { runOneForClosure },
      subjectHashSecret: secret,
      journalEncryptionKeys: { v1: encryptionKey },
      journalAnchorId: 'synthetic_anchor_1234567890',
    });
    expect(await gate.check()).toBe(false);
    events = [prepared, accepted];
    expect(await gate.check()).toBe(false);
    expect(gate.isVerified()).toBe(false);
    current = {
      id: prepared.closureId,
      subjectHash: prepared.subjectHash,
      userHash: prepared.userHash,
      tenantHash: prepared.tenantHash,
      statusTokenHash: prepared.statusTokenHash,
      idempotencyKeyHash: prepared.idempotencyKeyHash,
      requestFingerprint: prepared.requestFingerprint,
      policyVersion: prepared.policyVersion,
      status: 'ACCESS_BLOCKED',
      requestedAt: prepared.requestedAt,
      updatedAt: prepared.requestedAt,
      accessBlockedAt: prepared.requestedAt,
      attemptCount: 0,
    };
    expect(await gate.check()).toBe(true); // Fluxo normal aceito ainda está sendo reconciliado.
    current = undefined;
    expect(await gate.check()).toBe(false);
    expect(await gate.replay()).toEqual({ reapplied: 1, completed: 1 });
    expect(await gate.check()).toBe(true);
    expect(gate.isVerified()).toBe(true);
    residualViolation = true;
    expect(await gate.check()).toBe(false);
    residualViolation = false;
    expect(await gate.check()).toBe(true);
    expect((await gate.replay()).reapplied).toBe(0);
    events = [{ ...prepared, sealedIds: { ...prepared.sealedIds, tag: 'AAAAAAAAAAAAAAAAAAAAAA==' } }, accepted];
    expect(await gate.check()).toBe(false);
    events = [prepared, accepted];
    expect(await gate.check()).toBe(true);
    journal.list = vi.fn(async () => {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE');
    });
    expect(await gate.check()).toBe(true);
    expect(gate.isVerified()).toBe(true);
    journal.list = vi.fn(async () => {
      throw new Error('unavailable');
    });
    expect(await gate.check()).toBe(false);
    expect(gate.isVerified()).toBe(false);
  });
});
