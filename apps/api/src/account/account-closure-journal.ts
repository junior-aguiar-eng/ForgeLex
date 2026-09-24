import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export type JournalKind = 'PREPARED' | 'ACCEPTED' | 'ABORTED';

export interface JournalIds {
  subjectId: string;
  userId: string;
  tenantId: string;
}

export interface SealedJournalIds {
  keyVersion: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

export interface PreparedJournalInput {
  key: string;
  closureId: string;
  requestFingerprint: string;
  sealedIds: SealedJournalIds;
  subjectHash: string;
  userHash: string;
  tenantHash: string;
  statusTokenHash: string;
  idempotencyKeyHash: string;
  policyVersion: string;
  requestedAt: string;
}

export interface PreparedJournalEvent extends PreparedJournalInput {
  schemaVersion: 1;
  kind: 'PREPARED';
}

export interface TerminalJournalEvent {
  schemaVersion: 1;
  key: string;
  closureId: string;
  kind: 'ACCEPTED' | 'ABORTED';
  recordedAt: string;
}

export type JournalEvent = PreparedJournalEvent | TerminalJournalEvent;

export interface AccountClosureJournal {
  append(event: JournalEvent): Promise<'created' | 'exists'>;
  read(key: string, kind: JournalKind): Promise<JournalEvent | undefined>;
  list(): Promise<JournalEvent[]>;
  /** Verify an operator-provisioned, MAC-protected identity for this independent store. */
  assertAnchor(expectedId: string): Promise<void>;
}

function assertKey(key: Buffer): void {
  if (key.length !== 32) throw new Error('ACCOUNT_CLOSURE_JOURNAL_KEY_INVALID');
}

export function journalKey(secret: string, subjectId: string, idempotencyKey: string): string {
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('ACCOUNT_CLOSURE_JOURNAL_SECRET_INVALID');
  return createHmac('sha256', secret)
    .update('forgelex-account-closure-journal\0', 'utf8')
    .update(subjectId, 'utf8')
    .update('\0', 'utf8')
    .update(idempotencyKey, 'utf8')
    .digest('hex');
}

export function sealJournalIds(keyVersion: string, key: Buffer, closureId: string, ids: JournalIds): SealedJournalIds {
  assertKey(key);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(`${keyVersion}\0${closureId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(ids), 'utf8'), cipher.final()]);
  return {
    keyVersion,
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function openJournalIds(keys: Record<string, Buffer>, closureId: string, sealed: SealedJournalIds): JournalIds {
  const key = keys[sealed.keyVersion];
  if (!key) throw new Error('ACCOUNT_CLOSURE_JOURNAL_KEY_UNAVAILABLE');
  assertKey(key);
  try {
    const nonce = Buffer.from(sealed.nonce, 'base64');
    const tag = Buffer.from(sealed.tag, 'base64');
    if (nonce.length !== 12 || tag.length !== 16) throw new Error('invalid envelope');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(`${sealed.keyVersion}\0${closureId}`, 'utf8'));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]);
    const ids: unknown = JSON.parse(plain.toString('utf8'));
    if (
      !ids ||
      typeof ids !== 'object' ||
      !['subjectId', 'userId', 'tenantId'].every((name) => typeof (ids as Record<string, unknown>)[name] === 'string')
    ) {
      throw new Error('invalid ids');
    }
    return ids as JournalIds;
  } catch {
    throw new Error('ACCOUNT_CLOSURE_JOURNAL_INTEGRITY');
  }
}

export async function prepareJournalClosure(
  journal: AccountClosureJournal,
  input: PreparedJournalInput,
  keys: Record<string, Buffer>,
): Promise<PreparedJournalEvent> {
  // Read first: a retry must reuse the original closure ID and does not write a second ciphertext.
  const existing = await journal.read(input.key, 'PREPARED');
  if (existing) {
    if (
      existing.kind !== 'PREPARED' ||
      existing.schemaVersion !== 1 ||
      existing.key !== input.key ||
      [
        'requestFingerprint',
        'subjectHash',
        'userHash',
        'tenantHash',
        'statusTokenHash',
        'idempotencyKeyHash',
        'policyVersion',
      ].some((name) => existing[name as keyof PreparedJournalEvent] !== input[name as keyof PreparedJournalInput])
    ) {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFLICT');
    }
    const previousIds = openJournalIds(keys, existing.closureId, existing.sealedIds);
    const currentIds = openJournalIds(keys, input.closureId, input.sealedIds);
    if (JSON.stringify(previousIds) !== JSON.stringify(currentIds)) {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFLICT');
    }
    return existing;
  }
  const prepared: PreparedJournalEvent = { schemaVersion: 1, kind: 'PREPARED', ...input };
  const outcome = await journal.append(prepared);
  if (outcome === 'created') return prepared;
  // Another writer won the conditional creation. Compare its logical content.
  return prepareJournalClosure(journal, input, keys);
}

async function appendTerminal(
  journal: AccountClosureJournal,
  prepared: PreparedJournalEvent,
  kind: 'ACCEPTED' | 'ABORTED',
): Promise<void> {
  const opposite = await journal.read(prepared.key, kind === 'ACCEPTED' ? 'ABORTED' : 'ACCEPTED');
  if (opposite) throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFLICT');
  const existing = await journal.read(prepared.key, kind);
  if (existing) {
    if (existing.closureId !== prepared.closureId) throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFLICT');
    return;
  }
  const event: TerminalJournalEvent = {
    schemaVersion: 1,
    key: prepared.key,
    closureId: prepared.closureId,
    kind,
    recordedAt: new Date().toISOString(),
  };
  const outcome = await journal.append(event);
  if (outcome === 'exists') {
    const winner = await journal.read(prepared.key, kind);
    if (winner?.closureId !== prepared.closureId) throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFLICT');
  }
}

export function appendAccepted(journal: AccountClosureJournal, prepared: PreparedJournalEvent): Promise<void> {
  return appendTerminal(journal, prepared, 'ACCEPTED');
}

export function appendAborted(journal: AccountClosureJournal, prepared: PreparedJournalEvent): Promise<void> {
  return appendTerminal(journal, prepared, 'ABORTED');
}
