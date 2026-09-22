import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { AccountClosureRepository } from './account-closure-repository.js';

describe('AccountClosureRepository', () => {
  let client: Client;
  let repository: AccountClosureRepository;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-account-closure-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    client = connection.client;
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
