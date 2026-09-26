import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, type ForgeLexDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { AccountRepository, type StoredAccount } from './account-repository.js';
import { ApiKeyRepository } from './api-key-repository.js';
import { AccountClosureRepository } from './account-closure-repository.js';

describe('AccountClosureRepository', () => {
  let client: Client;
  let db: ForgeLexDatabase;
  let repository: AccountClosureRepository;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-account-closure-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    client = connection.client;
    db = connection.db;
    await runPersistenceMigrations(client);
    repository = new AccountClosureRepository(client);
  });

  afterEach(() => {
    client.close();
    try { rmSync(databasePath, { force: true }); } catch { /* SQLite pode liberar o arquivo ao fim do worker. */ }
  });

  async function createClosure() {
    return repository.create({
      id: 'acl_1',
      subjectId: 'supabase_1',
      userId: 'user_1',
      tenantId: 'tenant_1',
      subjectHash: 's'.repeat(64),
      userHash: 'u'.repeat(64),
      tenantHash: 't'.repeat(64),
      statusTokenHash: 'k'.repeat(64),
      idempotencyKeyHash: 'i'.repeat(64),
      requestFingerprint: 'f'.repeat(64),
      policyVersion: '2026-09-22.v1',
      requestedAt: '2026-09-22T12:00:00.000Z',
    });
  }

  async function createPersonalAccount(): Promise<StoredAccount> {
    const account = await new AccountRepository(db).bootstrap({
      supabaseUserId: 'supabase_1',
      email: 'pessoa@exemplo.com',
      displayName: 'Pessoa Exemplo',
    });
    await new ApiKeyRepository(db).create({
      id: 'key_1',
      tenantId: account.tenant.id,
      subjectId: account.user.supabaseUserId,
      userId: account.user.id,
      name: 'Principal',
      keyPrefix: 'flx_test',
      tokenHash: 'a'.repeat(64),
      roles: ['owner'],
      scopes: ['mcp'],
    });
    return account;
  }

  function beginInput(account: StoredAccount) {
    return {
      id: 'acl_begin_1',
      subjectId: account.user.supabaseUserId,
      userId: account.user.id,
      tenantId: account.tenant.id,
      subjectHash: '1'.repeat(64),
      userHash: '2'.repeat(64),
      tenantHash: '3'.repeat(64),
      statusTokenHash: '4'.repeat(64),
      idempotencyKeyHash: '5'.repeat(64),
      requestFingerprint: '6'.repeat(64),
      policyVersion: '2026-09-22.v1',
      now: '2026-09-22T12:00:00.000Z',
    };
  }

  it('bloqueia conta e tenant e revoga todas as chaves na mesma transação', async () => {
    const account = await createPersonalAccount();
    const result = await repository.begin(beginInput(account));

    expect(result).toMatchObject({ replay: false, closure: { status: 'ACCESS_BLOCKED' } });
    expect((await new AccountRepository(db).findBySupabaseUserId('supabase_1'))?.user.status).toBe('DISABLED');
    expect(await new ApiKeyRepository(db).findActiveByTokenHash('a'.repeat(64))).toBeUndefined();
    expect(await repository.isBlocked({
      subjectId: account.user.supabaseUserId,
      userId: account.user.id,
      tenantId: account.tenant.id,
    })).toBe(true);
    await client.execute({
      sql: 'UPDATE account_closures SET subject_id = NULL, user_id = NULL, tenant_id = NULL WHERE id = ?',
      args: [result.closure.id],
    });
    expect(await repository.isBlocked({
      subjectId: account.user.supabaseUserId,
      userId: account.user.id,
      tenantId: account.tenant.id,
      subjectHash: '1'.repeat(64),
      userHash: '2'.repeat(64),
      tenantHash: '3'.repeat(64),
    })).toBe(true);
  });

  it('reaplica tombstone em backup anterior, sem duplicar saga e mesmo sem perfil', async () => {
    const account = await createPersonalAccount();
    const source = beginInput(account);
    const input = {
      ...source,
      requestedAt: source.now,
    };
    const restored = await repository.restoreAccepted(input);
    expect(restored).toMatchObject({ id: input.id, status: 'ACCESS_BLOCKED', accessBlockedAt: input.now,
      attemptCount: -1 });
    expect(await repository.isBlocked({
      subjectId: account.user.supabaseUserId,
      userId: account.user.id,
      tenantId: account.tenant.id,
    })).toBe(true);
    expect((await new AccountRepository(db).findBySupabaseUserId('supabase_1'))?.user.status).toBe('DISABLED');
    expect(await new ApiKeyRepository(db).findActiveByTokenHash('a'.repeat(64))).toBeUndefined();
    expect(await repository.listSteps(input.id)).toHaveLength(5);
    const claimed = await repository.claimNextStep({
      closureId: input.id, now: input.now,
      leaseOwner: 'synthetic_restore', leaseExpiresAt: '2026-09-22T12:01:00.000Z',
    });
    expect(claimed?.closure.id).toBe(input.id);
    await repository.retryStep({
      closureId: input.id, stepType: 'DELETE_SUPABASE_IDENTITY', now: input.now,
      nextAttemptAt: '2026-09-22T12:02:00.000Z', errorCode: 'SYNTHETIC_RETRY', terminal: false,
    });
    expect((await repository.findById(input.id))?.attemptCount).toBe(-1);
    expect((await repository.restoreAccepted(input)).id).toBe(input.id);
    expect(await repository.listSteps(input.id)).toHaveLength(5);
    await expect(repository.restoreAccepted({ ...input, id: 'other' }))
      .rejects.toThrow('ACCOUNT_CLOSURE_RESTORE_CONFLICT');

    await repository.restoreAccepted({
      ...input,
      id: 'missing_profile',
      subjectId: 'missing_subject',
      userId: 'missing_user',
      tenantId: 'missing_tenant',
      subjectHash: '7'.repeat(64),
      userHash: '8'.repeat(64),
      tenantHash: '9'.repeat(64),
      statusTokenHash: 'a'.repeat(64),
    });
    expect(await repository.listSteps('missing_profile')).toHaveLength(5);
  });

  it('rejeita identidade ou credencial reaparecida mesmo com tombstone completo', async () => {
    const account = await createPersonalAccount();
    const identity = { userId: account.user.id, tenantId: account.tenant.id };
    await expect(repository.assertCompletedIdentityRemoved(identity))
      .rejects.toThrow('ACCOUNT_CLOSURE_RESIDUAL_IDENTITY');
    await client.execute({ sql: 'DELETE FROM api_keys WHERE tenant_id = ?', args: [identity.tenantId] });
    await client.execute({ sql: 'DELETE FROM forgelex_tenant_memberships WHERE tenant_id = ?', args: [identity.tenantId] });
    await client.execute({ sql: 'DELETE FROM forgelex_tenants WHERE id = ?', args: [identity.tenantId] });
    await client.execute({ sql: 'DELETE FROM forgelex_user_profiles WHERE id = ?', args: [identity.userId] });
    await expect(repository.assertCompletedIdentityRemoved(identity)).resolves.toBeUndefined();
  });

  it('rejeita conta ainda ativa com tombstone aceito e permite acesso somente bloqueado', async () => {
    const account = await createPersonalAccount();
    const identity = { userId: account.user.id, tenantId: account.tenant.id };
    await expect(repository.assertPendingAccessBlocked(identity))
      .rejects.toThrow('ACCOUNT_CLOSURE_RESIDUAL_ACCESS');
    await repository.begin(beginInput(account));
    await expect(repository.assertPendingAccessBlocked(identity)).resolves.toBeUndefined();
  });

  it('rejeita tenant compartilhado sem alterar conta ou credenciais', async () => {
    const account = await createPersonalAccount();
    await client.execute({
      sql: `INSERT INTO forgelex_user_profiles
        (id, supabase_user_id, email, display_name, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
      args: ['user_2', 'supabase_2', 'segunda@exemplo.com', 'Segunda Pessoa', account.user.createdAt, account.user.createdAt],
    });
    await client.execute({
      sql: `INSERT INTO forgelex_tenant_memberships
        (id, tenant_id, user_id, role, status, created_at, updated_at)
        VALUES (?, ?, ?, 'MEMBER', 'ACTIVE', ?, ?)`,
      args: ['membership_2', account.tenant.id, 'user_2', account.user.createdAt, account.user.createdAt],
    });

    await expect(repository.begin(beginInput(account)))
      .rejects.toThrow('ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER');
    expect((await new AccountRepository(db).findBySupabaseUserId('supabase_1'))?.user.status).toBe('ACTIVE');
    expect(await new ApiKeyRepository(db).findActiveByTokenHash('a'.repeat(64))).toBeDefined();
    expect(await repository.findById('acl_begin_1')).toBeUndefined();
  });

  it('reproduz a mesma saga e recusa fingerprint divergente', async () => {
    const account = await createPersonalAccount();
    const input = beginInput(account);
    const first = await repository.begin(input);
    const replay = await repository.begin({ ...input, id: 'acl_other' });

    expect(replay).toMatchObject({ replay: true, closure: { id: first.closure.id } });
    await expect(repository.begin({ ...input, id: 'acl_rotated_secret', statusTokenHash: '8'.repeat(64) }))
      .rejects.toThrow('ACCOUNT_CLOSURE_STATUS_TOKEN_MISMATCH');
    await expect(repository.begin({ ...input, id: 'acl_conflict', requestFingerprint: '7'.repeat(64) }))
      .rejects.toThrow('ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT');
    expect(await repository.findById('acl_conflict')).toBeUndefined();
  });

  it('persiste a saga e suas cinco etapas sem dados textuais do usuário', async () => {
    const created = await createClosure();

    expect(created.status).toBe('REQUESTED');
    expect(await repository.findById(created.id)).toEqual(created);
    expect(await repository.findBySubjectHash('s'.repeat(64))).toEqual(created);
    expect(await repository.findByStatusTokenHash(created.id, 'k'.repeat(64))).toEqual(created);
    expect(await repository.findByStatusTokenHash(created.id, 'x'.repeat(64))).toBeUndefined();
    expect((await repository.listSteps(created.id)).map((step) => step.stepType)).toEqual([
      'DELETE_SUPABASE_IDENTITY',
      'PURGE_PRIVATE_CONTENT',
      'MINIMIZE_RETAINED_RECORDS',
      'REMOVE_LOCAL_IDENTITY',
      'VERIFY_RESIDUALS',
    ]);

    const persisted = await client.execute({
      sql: 'SELECT * FROM account_closures WHERE id = ?',
      args: [created.id],
    });
    expect(JSON.stringify(persisted.rows[0])).not.toContain('pessoa@exemplo.com');
    expect(JSON.stringify(persisted.rows[0])).not.toContain('ENCERRAR MINHA CONTA');
  });

  it('reivindica somente a primeira etapa pendente e avança após conclusão', async () => {
    await createClosure();

    const first = await repository.claimNextStep({
      now: '2026-09-22T12:00:00.000Z',
      leaseOwner: 'worker_1',
      leaseExpiresAt: '2026-09-22T12:01:00.000Z',
    });
    expect(first).toMatchObject({
      closure: { id: 'acl_1', status: 'REQUESTED' },
      step: { stepType: 'DELETE_SUPABASE_IDENTITY', status: 'LEASED', attemptCount: 1, leaseOwner: 'worker_1' },
    });
    expect(await repository.claimNextStep({
      now: '2026-09-22T12:00:30.000Z',
      leaseOwner: 'worker_2',
      leaseExpiresAt: '2026-09-22T12:01:30.000Z',
    })).toBeUndefined();

    await repository.completeStep({
      closureId: 'acl_1',
      stepType: 'DELETE_SUPABASE_IDENTITY',
      now: '2026-09-22T12:00:40.000Z',
      nextStatus: 'IDENTITY_REMOVED',
    });

    const second = await repository.claimNextStep({
      now: '2026-09-22T12:00:41.000Z',
      leaseOwner: 'worker_2',
      leaseExpiresAt: '2026-09-22T12:01:41.000Z',
    });
    expect(second?.step.stepType).toBe('PURGE_PRIVATE_CONTENT');
    expect((await repository.findById('acl_1'))?.status).toBe('IDENTITY_REMOVED');
  });

  it('reclama etapa dirigida sem executar closure vizinha', async () => {
    await createClosure();
    await repository.create({
      id: 'acl_2', subjectId: 'supabase_2', userId: 'user_2', tenantId: 'tenant_2',
      subjectHash: 'a'.repeat(64), userHash: 'b'.repeat(64), tenantHash: 'c'.repeat(64),
      statusTokenHash: 'd'.repeat(64), idempotencyKeyHash: 'e'.repeat(64),
      requestFingerprint: 'f'.repeat(64), policyVersion: 'v1',
      requestedAt: '2026-09-22T12:00:00.000Z',
    });
    const claimed = await repository.claimNextStep({
      closureId: 'acl_2', now: '2026-09-22T12:00:00.000Z',
      leaseOwner: 'restore', leaseExpiresAt: '2026-09-22T12:01:00.000Z',
    });
    expect(claimed?.closure.id).toBe('acl_2');
    expect((await repository.listSteps('acl_1'))[0]?.status).toBe('PENDING');
  });

  it('agenda retry sem vazar erro e preserva bloqueio em falha terminal', async () => {
    await createClosure();
    await repository.claimNextStep({
      now: '2026-09-22T12:00:00.000Z',
      leaseOwner: 'worker_1',
      leaseExpiresAt: '2026-09-22T12:01:00.000Z',
    });

    await repository.retryStep({
      closureId: 'acl_1',
      stepType: 'DELETE_SUPABASE_IDENTITY',
      now: '2026-09-22T12:00:10.000Z',
      nextAttemptAt: '2026-09-22T12:05:00.000Z',
      errorCode: 'SUPABASE_TEMPORARILY_UNAVAILABLE',
      terminal: false,
    });
    expect((await repository.listSteps('acl_1'))[0]).toMatchObject({
      status: 'RETRYABLE',
      nextAttemptAt: '2026-09-22T12:05:00.000Z',
      lastErrorCode: 'SUPABASE_TEMPORARILY_UNAVAILABLE',
      leaseOwner: undefined,
    });
    expect(await repository.claimNextStep({
      now: '2026-09-22T12:04:59.000Z',
      leaseOwner: 'worker_2',
      leaseExpiresAt: '2026-09-22T12:06:00.000Z',
    })).toBeUndefined();

    await repository.claimNextStep({
      now: '2026-09-22T12:05:00.000Z',
      leaseOwner: 'worker_2',
      leaseExpiresAt: '2026-09-22T12:06:00.000Z',
    });
    await repository.retryStep({
      closureId: 'acl_1',
      stepType: 'DELETE_SUPABASE_IDENTITY',
      now: '2026-09-22T12:05:10.000Z',
      nextAttemptAt: '2026-09-22T12:10:00.000Z',
      errorCode: 'SUPABASE_DELETE_FAILED',
      terminal: true,
    });
    expect((await repository.listSteps('acl_1'))[0]?.status).toBe('FAILED');
    expect(await repository.findById('acl_1')).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      lastErrorCode: 'SUPABASE_DELETE_FAILED',
    });
  });

  it('retoma somente etapa terminal falha, sem reabrir acesso nem repetir etapa concluída', async () => {
    const account = await createPersonalAccount();
    const { closure } = await repository.begin(beginInput(account));
    const first = await repository.claimNextStep({
      now: '2026-09-22T12:00:01.000Z', leaseOwner: 'worker_1', leaseExpiresAt: '2026-09-22T12:01:01.000Z',
    });
    expect(first?.step.stepType).toBe('DELETE_SUPABASE_IDENTITY');
    await repository.completeStep({
      closureId: closure.id, stepType: 'DELETE_SUPABASE_IDENTITY',
      now: '2026-09-22T12:00:02.000Z', nextStatus: 'IDENTITY_REMOVED',
    });
    const second = await repository.claimNextStep({
      now: '2026-09-22T12:00:03.000Z', leaseOwner: 'worker_1', leaseExpiresAt: '2026-09-22T12:01:03.000Z',
    });
    expect(second?.step.stepType).toBe('PURGE_PRIVATE_CONTENT');
    await repository.retryStep({
      closureId: closure.id, stepType: 'PURGE_PRIVATE_CONTENT', now: '2026-09-22T12:00:04.000Z',
      nextAttemptAt: '2026-09-22T12:01:04.000Z', errorCode: 'ACCOUNT_CLOSURE_STEP_FAILED', terminal: true,
    });

    expect(await repository.resumeFailedStep({ closureId: closure.id, now: '2026-09-22T12:00:05.000Z' }))
      .toBe(true);
    expect(await repository.resumeFailedStep({ closureId: closure.id, now: '2026-09-22T12:00:06.000Z' }))
      .toBe(false);
    expect(await repository.findById(closure.id)).toMatchObject({ status: 'IDENTITY_REMOVED' });
    expect((await repository.listSteps(closure.id)).map((step) => step.status).slice(0, 2))
      .toEqual(['COMPLETED', 'RETRYABLE']);
    expect(await repository.isBlocked({ subjectId: account.user.supabaseUserId, userId: account.user.id, tenantId: account.tenant.id }))
      .toBe(true);
  });

  it('não permite concluir a saga antes da etapa de verificação residual', async () => {
    await createClosure();
    await repository.claimNextStep({
      now: '2026-09-22T12:00:00.000Z',
      leaseOwner: 'worker_1',
      leaseExpiresAt: '2026-09-22T12:01:00.000Z',
    });

    await expect(repository.completeStep({
      closureId: 'acl_1',
      stepType: 'DELETE_SUPABASE_IDENTITY',
      now: '2026-09-22T12:00:10.000Z',
      nextStatus: 'COMPLETED',
    })).rejects.toThrow('ACCOUNT_CLOSURE_INVALID_TRANSITION');

    expect(await repository.findById('acl_1')).toMatchObject({ status: 'REQUESTED', completedAt: undefined });
    expect((await repository.listSteps('acl_1'))[0]?.status).toBe('LEASED');
  });

  it('recusa mensagem livre no campo reservado a código de erro', async () => {
    await createClosure();
    await repository.claimNextStep({
      now: '2026-09-22T12:00:00.000Z',
      leaseOwner: 'worker_1',
      leaseExpiresAt: '2026-09-22T12:01:00.000Z',
    });

    await expect(repository.retryStep({
      closureId: 'acl_1',
      stepType: 'DELETE_SUPABASE_IDENTITY',
      now: '2026-09-22T12:00:10.000Z',
      nextAttemptAt: '2026-09-22T12:05:00.000Z',
      errorCode: 'provider returned pessoa@exemplo.com',
      terminal: false,
    })).rejects.toThrow('ACCOUNT_CLOSURE_ERROR_CODE_INVALID');

    expect((await repository.listSteps('acl_1'))[0]).toMatchObject({ status: 'LEASED', lastErrorCode: undefined });
  });
});
