import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { buildApp } from '../apps/api/dist/app.js';
import {
  AccountClosureReconciler,
  createAccountClosureStepHandlers,
} from '../apps/api/dist/account/account-closure-reconciler.js';
import { AccountClosureBillingRetention } from '../apps/api/dist/account/account-closure-billing-retention.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';
import { AccountClosureService } from '../apps/api/dist/account/account-closure-service.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import {
  AccountClosureRepository,
  AccountRepository,
  createDatabase,
  MatterRepository,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import {
  adminConnectionUrl,
  createDisposableDatabase,
  databaseUrl,
  disposableName,
  dropDisposableDatabase,
} from './account-closure-test-db.mjs';

const run = promisify(execFile);
const adminUrl = adminConnectionUrl();
const sourceName = disposableName('forgelex_closure_restore_');
const targetName = disposableName('forgelex_closure_restore_');
// Validate both names and connection before creating or dropping any database.
const sourceUrl = databaseUrl(adminUrl, sourceName);
const targetUrl = databaseUrl(adminUrl, targetName);
const dumpDirectory = await mkdtemp(join(tmpdir(), 'forgelex-closure-restore-'));
const dumpPath = join(dumpDirectory, 'closure.dump');
const pgEnvironment = {
  ...process.env,
  PGHOST: adminUrl.hostname,
  PGPORT: adminUrl.port || '5432',
  PGUSER: decodeURIComponent(adminUrl.username),
  PGPASSWORD: decodeURIComponent(adminUrl.password),
};
const pgDump = process.env.FORGELEX_PG_DUMP_BIN || 'pg_dump';
const pgRestore = process.env.FORGELEX_PG_RESTORE_BIN || 'pg_restore';
let sourceCreated = false;
let targetCreated = false;
let sourceClient;
let targetClient;
let app;

try {
  await createDisposableDatabase(adminUrl, sourceName);
  sourceCreated = true;
  const source = await createDatabase({ url: sourceUrl });
  sourceClient = source.client;
  await runPersistenceMigrations(sourceClient);
  await runPersistenceMigrations(sourceClient);
  const ledger = new LedgerService(source.db, sourceClient);
  await ledger.runMigrations();
  const subjectId = `restore_${randomUUID()}`;
  const account = await new AccountRepository(source.db).bootstrap({
    supabaseUserId: subjectId,
    email: `${subjectId}@example.invalid`,
    displayName: 'Restauração descartável',
  });
  await new MatterRepository(source.db).createMatter({
    tenantId: account.tenant.id,
    createdBy: account.user.id,
    title: 'Conteúdo descartável',
  });
  const now = new Date().toISOString();
  const purchaseId = randomUUID();
  await sourceClient.execute({
    sql: `INSERT INTO billing_purchases (id, tenant_id, user_id, package_id, idempotency_key,
      amount_cents, currency, status, checkout_url, created_at, updated_at)
      VALUES (?, ?, ?, 'credits_25', ?, 2500, 'brl', 'PAID', 'https://example.invalid/private', ?, ?)`,
    args: [purchaseId, account.tenant.id, account.user.id, `restore_${purchaseId}`, now, now],
  });
  const repository = new AccountClosureRepository(sourceClient);
  const service = new AccountClosureService(repository, {
    statusTokenSecret: 's'.repeat(64),
    subjectHashSecret: 'h'.repeat(64),
  });
  const timestamp = Math.floor(Date.now() / 1_000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ amr: [{ method: 'password', timestamp }] })}.fixture`;
  const accepted = await service.request({
    principal: {
      subjectId,
      userId: account.user.id,
      tenantId: account.tenant.id,
      roles: ['owner'],
      scopes: ['matter:read'],
      authMethod: 'session',
    },
    confirmation: 'ENCERRAR MINHA CONTA',
    policyVersion: '2026-09-22.v1',
    idempotencyKey: `restore_${purchaseId}`,
    accessToken: token,
  });
  const worker = new AccountClosureReconciler({
    repository,
    leaseOwner: 'restore_disposable',
    handlers: createAccountClosureStepHandlers({
      identityAdmin: {
        async deleteUser(id) {
          assert.equal(id, subjectId);
          return { alreadyMissing: false };
        },
      },
      purgeService: new AccountClosurePurgeService(sourceClient),
      billingRetention: new AccountClosureBillingRetention(sourceClient),
    }),
  });
  for (let step = 0; step < 5; step += 1) assert.equal(await worker.runOne(), 'completed');
  assert.equal((await repository.findById(accepted.closure.id))?.status, 'COMPLETED');
  sourceClient.close();
  sourceClient = undefined;

  await run(pgDump, ['--format=custom', '--file', dumpPath, sourceName], { env: pgEnvironment });
  await createDisposableDatabase(adminUrl, targetName);
  targetCreated = true;
  await run(pgRestore, ['--no-owner', '--dbname', targetName, dumpPath], { env: pgEnvironment });
  const restored = await createDatabase({ url: targetUrl });
  targetClient = restored.client;
  const restoredRepository = new AccountClosureRepository(targetClient);
  const closure = await restoredRepository.findById(accepted.closure.id);
  assert.equal(closure?.status, 'COMPLETED');
  assert.ok(closure?.accessBlockedAt);
  assert.ok(closure?.completedAt);
  assert.equal(
    (await restoredRepository.listSteps(accepted.closure.id)).filter((step) => step.status === 'COMPLETED').length,
    5,
  );
  assert.equal(
    await restoredRepository.isBlocked({
      subjectId,
      userId: account.user.id,
      tenantId: account.tenant.id,
      subjectHash: closure.subjectHash,
      userHash: closure.userHash,
      tenantHash: closure.tenantHash,
    }),
    true,
  );
  const privateRows = await targetClient.execute({
    sql: 'SELECT COUNT(*) AS count FROM matters WHERE tenant_id = ?',
    args: [account.tenant.id],
  });
  assert.equal(Number(privateRows.rows[0]?.count), 0);
  const retained = await targetClient.execute({
    sql: 'SELECT tenant_id, user_id, amount_cents, checkout_url FROM billing_purchases WHERE id = ?',
    args: [purchaseId],
  });
  assert.equal(Number(retained.rows[0]?.amount_cents), 2500);
  assert.equal(retained.rows[0]?.checkout_url, null);
  assert.notEqual(retained.rows[0]?.tenant_id, account.tenant.id);
  assert.notEqual(retained.rows[0]?.user_id, account.user.id);

  app = await buildApp({
    database: restored.db,
    databaseClient: targetClient,
    ledgerService: new LedgerService(restored.db, targetClient),
    supabaseIdentityVerifier: {
      async verify() {
        return {
          id: subjectId,
          email: `${subjectId}@example.invalid`,
          emailConfirmed: true,
          displayName: 'Restauração descartável',
        };
      },
    },
    environment: {
      NODE_ENV: 'test',
      FORGELEX_ACCOUNT_CLOSURE_ENABLED: 'false',
      FORGELEX_ACCOUNT_CLOSURE_SUBJECT_HASH_SECRET: 'h'.repeat(64),
      FORGELEX_WEBHOOK_MASTER_KEY: 'restore-disposable-master-key',
    },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/v2/auth/bootstrap',
    headers: { authorization: 'Bearer still-valid-synthetic-jwt' },
    payload: { displayName: 'Restauração descartável' },
  });
  assert.equal(login.statusCode, 403);
  assert.equal(login.json().error, 'ACCOUNT_CLOSED');
  console.log(
    JSON.stringify({
      status: 'passed',
      sourceDatabase: sourceName,
      restoredDatabase: targetName,
      checks: ['tombstone', 'steps', 'private_zero', 'financial_minimized', 'restored_login_denied'],
    }),
  );
} catch (error) {
  console.error(
    `ACCOUNT_CLOSURE_RESTORE_FAILED: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => undefined);
  sourceClient?.close();
  targetClient?.close();
  if (targetCreated)
    try {
      await dropDisposableDatabase(adminUrl, targetName);
    } catch (error) {
      console.error(`RESTORE_TARGET_CLEANUP_FAILED: ${String(error)}`);
      process.exitCode = 1;
    }
  if (sourceCreated)
    try {
      await dropDisposableDatabase(adminUrl, sourceName);
    } catch (error) {
      console.error(`RESTORE_SOURCE_CLEANUP_FAILED: ${String(error)}`);
      process.exitCode = 1;
    }
  if (
    resolve(dirname(dumpDirectory)) !== resolve(tmpdir()) ||
    !/^forgelex-closure-restore-[A-Za-z0-9_-]+$/.test(basename(dumpDirectory))
  ) {
    throw new Error('RESTORE_DUMP_DIRECTORY_NOT_DISPOSABLE');
  }
  await rm(dumpDirectory, { recursive: true, force: true });
}
