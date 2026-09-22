import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import type { AccountClosureRecord, AccountClosureRepository } from '@forgelex/persistence';
import {
  deriveClosureStatusToken,
  digestClosureValue,
  fingerprintClosureRequest,
  verifyClosureStatusToken,
} from './account-closure-crypto.js';
import { ACCOUNT_CLOSURE_POLICY } from './account-closure-policy.js';
import { AccountClosureService } from './account-closure-service.js';

const now = new Date('2026-09-22T12:00:00.000Z');
const nowSeconds = Math.floor(now.getTime() / 1_000);
const secret = 's'.repeat(64);

const principal: AuthenticatedPrincipal = {
  subjectId: 'supabase_1',
  tenantId: 'tenant_1',
  userId: 'user_1',
  roles: ['owner'],
  scopes: ['account:write'],
  authMethod: 'session',
};

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}

function closure(overrides: Partial<AccountClosureRecord> = {}): AccountClosureRecord {
  return {
    id: 'acl_1',
    subjectId: principal.subjectId,
    userId: principal.userId,
    tenantId: principal.tenantId,
    subjectHash: 'a'.repeat(64),
    userHash: 'b'.repeat(64),
    tenantHash: 'c'.repeat(64),
    statusTokenHash: 'd'.repeat(64),
    idempotencyKeyHash: 'e'.repeat(64),
    requestFingerprint: 'f'.repeat(64),
    policyVersion: ACCOUNT_CLOSURE_POLICY.version,
    status: 'ACCESS_BLOCKED',
    requestedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    accessBlockedAt: now.toISOString(),
    nextAttemptAt: now.toISOString(),
    attemptCount: 0,
    ...overrides,
  };
}

describe('account closure crypto', () => {
  it('deriva hashes e token determinísticos sem expor os valores de origem', () => {
    const token = deriveClosureStatusToken(secret, 'subject_1', 'idem_1');
    expect(token).toBe(deriveClosureStatusToken(secret, 'subject_1', 'idem_1'));
    expect(token).toMatch(/^flx_close_[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain('subject_1');
    expect(digestClosureValue(secret, 'subject_1')).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyClosureStatusToken(secret, 'subject_1', 'idem_1', token)).toBe(true);
    expect(verifyClosureStatusToken(secret, 'subject_1', 'idem_1', `${token}x`)).toBe(false);
    expect(fingerprintClosureRequest({ confirmation: 'A', policyVersion: 'B' }))
      .not.toBe(fingerprintClosureRequest({ confirmation: 'A', policyVersion: 'C' }));
  });
});

describe('AccountClosureService', () => {
  it('valida senha recente e produz os hashes necessários para iniciar o bloqueio', async () => {
    const begin = vi.fn(async () => ({ closure: closure(), replay: false }));
    const repository = { begin } as unknown as AccountClosureRepository;
    const service = new AccountClosureService(repository, {
      statusTokenSecret: secret,
      subjectHashSecret: 'h'.repeat(64),
    });
    const accessToken = jwt({
      iat: nowSeconds,
      amr: [{ method: 'password', timestamp: nowSeconds - 120 }],
    });

    const result = await service.request({
      principal,
      confirmation: ACCOUNT_CLOSURE_POLICY.confirmation,
      policyVersion: ACCOUNT_CLOSURE_POLICY.version,
      idempotencyKey: 'idem_1',
      accessToken,
      now,
    });

    expect(result).toMatchObject({ closure: { id: 'acl_1', status: 'ACCESS_BLOCKED' }, replay: false });
    expect(result.statusToken).toBe(deriveClosureStatusToken(secret, principal.subjectId, 'idem_1'));
    expect(begin).toHaveBeenCalledWith(expect.objectContaining({
      subjectId: principal.subjectId,
      userId: principal.userId,
      tenantId: principal.tenantId,
      policyVersion: ACCOUNT_CLOSURE_POLICY.version,
      now: now.toISOString(),
      subjectHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      statusTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      idempotencyKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
  });

  it('recusa refresh, senha expirada, credencial não sessão e política divergente antes da persistência', async () => {
    const begin = vi.fn();
    const service = new AccountClosureService({ begin } as unknown as AccountClosureRepository, {
      statusTokenSecret: secret,
      subjectHashSecret: 'h'.repeat(64),
    });
    const base = {
      principal,
      confirmation: ACCOUNT_CLOSURE_POLICY.confirmation,
      policyVersion: ACCOUNT_CLOSURE_POLICY.version,
      idempotencyKey: 'idem_1',
      now,
    };

    await expect(service.request({ ...base, accessToken: jwt({ iat: nowSeconds, amr: [{ method: 'token_refresh', timestamp: nowSeconds }] }) }))
      .rejects.toThrow('ACCOUNT_CLOSURE_REAUTHENTICATION_REQUIRED');
    await expect(service.request({ ...base, accessToken: jwt({ amr: [{ method: 'password', timestamp: nowSeconds - 301 }] }) }))
      .rejects.toThrow('ACCOUNT_CLOSURE_REAUTHENTICATION_REQUIRED');
    await expect(service.request({ ...base, principal: { ...principal, authMethod: 'api_key' }, accessToken: jwt({ amr: [{ method: 'password', timestamp: nowSeconds }] }) }))
      .rejects.toThrow('ACCOUNT_CLOSURE_SESSION_REQUIRED');
    await expect(service.request({ ...base, policyVersion: 'different', accessToken: jwt({ amr: [{ method: 'password', timestamp: nowSeconds }] }) }))
      .rejects.toThrow('ACCOUNT_CLOSURE_POLICY_VERSION_MISMATCH');
    expect(begin).not.toHaveBeenCalled();
  });
});
