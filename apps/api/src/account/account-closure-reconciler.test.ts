import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountClosureRepository,
  createDatabase,
  runPersistenceMigrations,
  type Client,
} from '@forgelex/persistence';
import {
  AccountClosureReconciler,
  createAccountClosureStepHandlers,
  type AccountClosureStepHandler,
} from './account-closure-reconciler.js';
import type { AccountIdentityAdmin } from './supabase-account-admin.js';

describe('AccountClosureReconciler', () => {
  let client: Client;
  let databasePath: string;
  let repository: AccountClosureRepository;
  let identityAdmin: AccountIdentityAdmin;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-closure-reconciler-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    client = connection.client;
    await runPersistenceMigrations(client);
    repository = new AccountClosureRepository(client);
    await repository.create({
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
    await client.execute({
      sql: "UPDATE account_closures SET status = 'ACCESS_BLOCKED', access_blocked_at = requested_at WHERE id = ?",
      args: ['acl_1'],
    });
    identityAdmin = { deleteUser: vi.fn().mockResolvedValue({ alreadyMissing: false }) };
  });

  afterEach(() => {
    client.close();
    try { rmSync(databasePath, { force: true }); } catch { /* SQLite pode liberar depois do worker. */ }
  });

  function reconciler(overrides: Partial<Record<string, AccountClosureStepHandler>> = {}) {
    return new AccountClosureReconciler({
      repository,
      handlers: {
        ...createAccountClosureStepHandlers({ identityAdmin }),
        ...overrides,
      },
      leaseOwner: 'worker_1',
    });
  }

  it('conclui a exclusão da identidade e avança a saga', async () => {
    await expect(reconciler().runOne(new Date('2026-09-22T12:00:00.000Z')))
      .resolves.toBe('completed');

    expect(identityAdmin.deleteUser).toHaveBeenCalledWith('supabase_1');
    expect(await repository.findById('acl_1')).toMatchObject({
      status: 'IDENTITY_REMOVED',
      identityRemovedAt: '2026-09-22T12:00:00.000Z',
    });
    expect((await repository.listSteps('acl_1'))[0]).toMatchObject({
      status: 'COMPLETED',
      attemptCount: 1,
    });
  });

  it('mantém bloqueio e agenda retry quando o efeito externo falha', async () => {
    vi.mocked(identityAdmin.deleteUser).mockRejectedValueOnce(new Error('SUPABASE_ACCOUNT_DELETE_FAILED'));

    await expect(reconciler().runOne(new Date('2026-09-22T12:00:00.000Z')))
      .resolves.toBe('retrying');

    expect((await repository.findById('acl_1'))?.status).toBe('ACCESS_BLOCKED');
    expect((await repository.listSteps('acl_1'))[0]).toMatchObject({
      status: 'RETRYABLE',
      attemptCount: 1,
      nextAttemptAt: '2026-09-22T12:01:00.000Z',
      lastErrorCode: 'SUPABASE_ACCOUNT_DELETE_FAILED',
    });
  });

  it('conclui o retry quando a exclusão externa ocorreu antes da falha local', async () => {
    vi.mocked(identityAdmin.deleteUser)
      .mockResolvedValueOnce({ alreadyMissing: false })
      .mockResolvedValueOnce({ alreadyMissing: true });
    const completeStep = repository.completeStep.bind(repository);
    repository.completeStep = vi.fn()
      .mockRejectedValueOnce(new Error('LOCAL_COMMIT_FAILED'))
      .mockImplementation(completeStep);
    const worker = reconciler();

    await expect(worker.runOne(new Date('2026-09-22T12:00:00.000Z')))
      .rejects.toThrow('LOCAL_COMMIT_FAILED');
    await expect(worker.runOne(new Date('2026-09-22T12:01:01.000Z')))
      .resolves.toBe('completed');

    expect(identityAdmin.deleteUser).toHaveBeenCalledTimes(2);
    expect((await repository.findById('acl_1'))?.status).toBe('IDENTITY_REMOVED');
  });

  it('encerra a etapa na décima segunda falha sem remover o bloqueio', async () => {
    await client.execute({
      sql: "UPDATE account_closure_steps SET attempt_count = 11 WHERE closure_id = ? AND step_type = 'DELETE_SUPABASE_IDENTITY'",
      args: ['acl_1'],
    });
    vi.mocked(identityAdmin.deleteUser).mockRejectedValueOnce(new Error('qualquer detalhe sensível'));

    await expect(reconciler().runOne(new Date('2026-09-22T12:00:00.000Z')))
      .resolves.toBe('failed');

    expect(await repository.findById('acl_1')).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      lastErrorCode: 'ACCOUNT_CLOSURE_STEP_FAILED',
    });
    expect((await repository.listSteps('acl_1'))[0]).toMatchObject({
      status: 'FAILED',
      attemptCount: 12,
      lastErrorCode: 'ACCOUNT_CLOSURE_STEP_FAILED',
    });
  });

  it('fica ocioso quando não há etapa elegível', async () => {
    await client.execute({
      sql: "UPDATE account_closure_steps SET next_attempt_at = '2026-09-22T13:00:00.000Z'",
      args: [],
    });

    await expect(reconciler().runOne(new Date('2026-09-22T12:00:00.000Z')))
      .resolves.toBe('idle');
  });

  it('liga os quatro efeitos locais e conclui a sequência canônica', async () => {
    const purgeService = {
      purgePrivateContent: vi.fn().mockResolvedValue({
        deletedRows: 0,
        remainingPrivateRows: 0,
        heldCategories: [],
      }),
      removeLocalIdentity: vi.fn().mockResolvedValue(undefined),
      verifyResiduals: vi.fn().mockResolvedValue({
        privateRows: 0,
        activeCredentials: 0,
        unredactedSnapshots: 0,
        retainedFinancialRows: 1,
        heldCategories: [],
      }),
    };
    const billingRetention = { minimize: vi.fn().mockResolvedValue(undefined) };
    const worker = new AccountClosureReconciler({
      repository,
      handlers: createAccountClosureStepHandlers({
        identityAdmin,
        purgeService,
        billingRetention,
      }),
      leaseOwner: 'worker_local',
    });

    for (let step = 0; step < 5; step += 1) {
      await expect(worker.runOne(new Date(`2026-09-22T12:0${step}:00.000Z`)))
        .resolves.toBe('completed');
    }

    expect(purgeService.purgePrivateContent).toHaveBeenCalledOnce();
    expect(billingRetention.minimize).toHaveBeenCalledOnce();
    expect(purgeService.removeLocalIdentity).toHaveBeenCalledOnce();
    expect(purgeService.verifyResiduals).toHaveBeenCalledOnce();
    expect((await repository.findById('acl_1'))?.status).toBe('COMPLETED');
  });

  it('retoma remoção local quando os identificadores já foram limpos', async () => {
    await client.execute({
      sql: `UPDATE account_closure_steps SET status = 'COMPLETED'
        WHERE closure_id = ? AND step_type IN (
          'DELETE_SUPABASE_IDENTITY', 'PURGE_PRIVATE_CONTENT',
          'MINIMIZE_RETAINED_RECORDS'
        )`,
      args: ['acl_1'],
    });
    await client.execute({
      sql: "UPDATE account_closures SET status = 'CONTENT_PURGING' WHERE id = ?",
      args: ['acl_1'],
    });
    const purgeService = {
      purgePrivateContent: vi.fn(),
      verifyResiduals: vi.fn().mockResolvedValue({
        privateRows: 0,
        activeCredentials: 0,
        unredactedSnapshots: 0,
        retainedFinancialRows: 1,
        heldCategories: [],
      }),
      removeLocalIdentity: vi.fn().mockImplementation(async () => {
        await client.execute({
          sql: `UPDATE account_closures
            SET subject_id = NULL, user_id = NULL, tenant_id = NULL WHERE id = ?`,
          args: ['acl_1'],
        });
      }),
    };
    const completeStep = repository.completeStep.bind(repository);
    repository.completeStep = vi.fn()
      .mockRejectedValueOnce(new Error('LOCAL_COMMIT_FAILED'))
      .mockImplementation(completeStep);
    const worker = new AccountClosureReconciler({
      repository,
      handlers: createAccountClosureStepHandlers({
        identityAdmin,
        purgeService,
        billingRetention: { minimize: vi.fn() },
      }),
      leaseOwner: 'worker_resume',
    });

    await expect(worker.runOne(new Date('2026-09-22T12:00:00.000Z')))
      .rejects.toThrow('LOCAL_COMMIT_FAILED');
    await expect(worker.runOne(new Date('2026-09-22T12:01:01.000Z')))
      .resolves.toBe('completed');

    expect(purgeService.removeLocalIdentity).toHaveBeenCalledTimes(2);
    expect((await repository.findById('acl_1'))?.status).toBe('RETAINED_ONLY');
  });
});
