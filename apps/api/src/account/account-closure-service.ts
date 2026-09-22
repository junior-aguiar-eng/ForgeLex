import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import type { AccountClosureRecord, AccountClosureRepository } from '@forgelex/persistence';
import { isRecentPasswordAuthentication } from '../auth/fastify-auth.js';
import {
  deriveClosureStatusToken,
  digestClosureValue,
  fingerprintClosureRequest,
} from './account-closure-crypto.js';
import { ACCOUNT_CLOSURE_POLICY } from './account-closure-policy.js';

export interface AccountClosureServiceOptions {
  statusTokenSecret: string;
  subjectHashSecret: string;
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
    const result = await this.repository.begin({
      id: randomUUID(),
      subjectId: input.principal.subjectId,
      userId: input.principal.userId,
      tenantId: input.principal.tenantId,
      subjectHash: digestClosureValue(this.options.subjectHashSecret, input.principal.subjectId),
      userHash: digestClosureValue(this.options.subjectHashSecret, input.principal.userId),
      tenantHash: digestClosureValue(this.options.subjectHashSecret, input.principal.tenantId),
      statusTokenHash: sha256(statusToken),
      idempotencyKeyHash: digestClosureValue(this.options.statusTokenSecret, input.idempotencyKey),
      requestFingerprint: fingerprintClosureRequest({
        confirmation: input.confirmation,
        policyVersion: input.policyVersion,
      }),
      policyVersion: input.policyVersion,
      now: now.toISOString(),
    });
    return { ...result, statusToken };
  }
}
