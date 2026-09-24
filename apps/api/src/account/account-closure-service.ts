import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import type { AccountClosureRecord, AccountClosureRepository } from '@forgelex/persistence';
import { isRecentPasswordAuthentication } from '../auth/fastify-auth.js';
import { structuredLog } from '../observability.js';
import {
  deriveClosureStatusToken,
  digestClosureValue,
  fingerprintClosureRequest,
} from './account-closure-crypto.js';
import { ACCOUNT_CLOSURE_POLICY } from './account-closure-policy.js';
import {
  appendAborted,
  appendAccepted,
  journalKey,
  prepareJournalClosure,
  sealJournalIds,
  type AccountClosureJournal,
} from './account-closure-journal.js';

export interface AccountClosureServiceOptions {
  statusTokenSecret: string;
  subjectHashSecret: string;
  journal?: AccountClosureJournal;
  journalKeySecret?: string;
  journalEncryptionKeys?: Record<string, Buffer>;
  journalEncryptionKeyVersion?: string;
}

export interface RequestAccountClosureInput {
  principal: AuthenticatedPrincipal;
  confirmation: string;
  policyVersion: string;
  idempotencyKey: string;
  accessToken: string;
  now?: Date;
}

export interface RequestAccountClosureResult {
  closure: AccountClosureRecord;
  statusToken: string;
  replay: boolean;
}

function assertSecret(name: string, secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error(`ACCOUNT_CLOSURE_${name}_SECRET_INVALID`);
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export class AccountClosureService {
  public constructor(
    private readonly repository: AccountClosureRepository,
    private readonly options: AccountClosureServiceOptions,
  ) {}

  public async request(input: RequestAccountClosureInput): Promise<RequestAccountClosureResult> {
    assertSecret('STATUS_TOKEN', this.options.statusTokenSecret);
    assertSecret('SUBJECT_HASH', this.options.subjectHashSecret);
    if (input.principal.authMethod !== 'session') throw new Error('ACCOUNT_CLOSURE_SESSION_REQUIRED');
    if (input.confirmation !== ACCOUNT_CLOSURE_POLICY.confirmation) {
      throw new Error('ACCOUNT_CLOSURE_CONFIRMATION_MISMATCH');
    }
    if (input.policyVersion !== ACCOUNT_CLOSURE_POLICY.version) {
      throw new Error('ACCOUNT_CLOSURE_POLICY_VERSION_MISMATCH');
    }
    if (!input.idempotencyKey.trim()) throw new Error('ACCOUNT_CLOSURE_IDEMPOTENCY_KEY_REQUIRED');

    const now = input.now ?? new Date();
    if (!isRecentPasswordAuthentication(
      input.accessToken,
      now,
      ACCOUNT_CLOSURE_POLICY.reauthenticationMaxAgeSeconds,
    )) {
      throw new Error('ACCOUNT_CLOSURE_REAUTHENTICATION_REQUIRED');
    }

    const statusToken = deriveClosureStatusToken(
      this.options.statusTokenSecret,
      input.principal.subjectId,
      input.idempotencyKey,
    );
    const closureId = randomUUID();
    const statusTokenHash = sha256(statusToken);
    const subjectHash = digestClosureValue(this.options.subjectHashSecret, input.principal.subjectId);
    const userHash = digestClosureValue(this.options.subjectHashSecret, input.principal.userId);
    const tenantHash = digestClosureValue(this.options.subjectHashSecret, input.principal.tenantId);
    const idempotencyKeyHash = digestClosureValue(this.options.statusTokenSecret, input.idempotencyKey);
    const requestFingerprint = fingerprintClosureRequest({
      confirmation: input.confirmation,
      policyVersion: input.policyVersion,
    });
    if (!this.options.journal) {
      const result = await this.repository.begin({
        id: closureId,
        subjectId: input.principal.subjectId,
        userId: input.principal.userId,
        tenantId: input.principal.tenantId,
        subjectHash, userHash, tenantHash, statusTokenHash, idempotencyKeyHash,
        requestFingerprint, policyVersion: input.policyVersion, now: now.toISOString(),
      });
      return { ...result, statusToken };
    }
    if (!this.options.journalEncryptionKeys || !this.options.journalEncryptionKeyVersion || !this.options.journalKeySecret) {
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFIG_INVALID');
    }
    const currentKey = this.options.journalEncryptionKeys[this.options.journalEncryptionKeyVersion];
    if (!currentKey) throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFIG_INVALID');
    const key = journalKey(this.options.journalKeySecret, input.principal.subjectId, input.idempotencyKey);
    let prepared;
    try {
      prepared = await prepareJournalClosure(this.options.journal, {
        key,
        closureId,
        requestFingerprint,
        sealedIds: sealJournalIds(this.options.journalEncryptionKeyVersion, currentKey, closureId, {
          subjectId: input.principal.subjectId,
          userId: input.principal.userId,
          tenantId: input.principal.tenantId,
        }),
        subjectHash,
        userHash,
        tenantHash,
        statusTokenHash,
        idempotencyKeyHash,
        policyVersion: input.policyVersion,
        requestedAt: now.toISOString(),
      }, this.options.journalEncryptionKeys);
      if (await this.options.journal.read(key, 'ABORTED')) {
        throw new Error('ACCOUNT_CLOSURE_JOURNAL_CONFLICT');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'ACCOUNT_CLOSURE_JOURNAL_CONFLICT') throw error;
      throw new Error('ACCOUNT_CLOSURE_JOURNAL_UNAVAILABLE', { cause: error });
    }
    const beginInput = {
      id: prepared.closureId,
      subjectId: input.principal.subjectId,
      userId: input.principal.userId,
      tenantId: input.principal.tenantId,
      subjectHash,
      userHash,
      tenantHash,
      statusTokenHash,
      idempotencyKeyHash,
      requestFingerprint,
      policyVersion: input.policyVersion,
      now: prepared.requestedAt,
    };
    let result;
    try {
      result = await this.repository.begin(beginInput);
      if (result.closure.id !== prepared.closureId) {
        result = undefined;
        throw new Error('ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT');
      }
    } catch (error) {
      // An ambiguous commit must never be classified as aborted. Resolve by reading the tombstone.
      let found;
      try {
        found = await this.repository.findBySubjectHash(subjectHash);
        if (found?.id === prepared.closureId && found.statusTokenHash === statusTokenHash &&
          found.userHash === userHash && found.tenantHash === tenantHash &&
          found.idempotencyKeyHash === idempotencyKeyHash &&
          found.requestFingerprint === requestFingerprint && found.policyVersion === input.policyVersion &&
          found.accessBlockedAt) {
          result = { closure: found, replay: true };
        } else if (!found && error instanceof Error && [
          'ACCOUNT_CLOSURE_ACCOUNT_NOT_ACTIVE',
          'ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER',
        ].includes(error.message)) {
          // These checks reject before the first write in begin(). A generic database/commit
          // error is ambiguous even when an immediate follow-up read finds no tombstone.
          await appendAborted(this.options.journal, prepared);
        } else {
          structuredLog('error', 'account_closure.journal.unresolved', { closureId: prepared.closureId });
        }
      } catch {
        structuredLog('error', 'account_closure.journal.unresolved', { closureId: prepared.closureId });
      }
      if (!result) throw error;
    }
    try {
      await appendAccepted(this.options.journal, prepared);
    } catch {
      structuredLog('error', 'account_closure.journal.pending', { closureId: prepared.closureId });
    }
    return { ...result, statusToken };
  }
}
