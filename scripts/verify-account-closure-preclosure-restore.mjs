import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
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
import { AccountClosureRestoreGate } from '../apps/api/dist/account/account-closure-restore.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import {
  AccountClosureRepository,
  AccountRepository,
  ApiKeyRepository,
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
import { FileAccountClosureJournal } from './account-closure-journal-file.mjs';

const run = promisify(execFile);
const adminUrl = adminConnectionUrl();
const sourceName = disposableName('forgelex_closure_restore_');
const targetName = disposableName('forgelex_closure_restore_');
const sourceUrl = databaseUrl(adminUrl, sourceName);
const targetUrl = databaseUrl(adminUrl, targetName);
const directory = await mkdtemp(join(tmpdir(), 'forgelex-closure-preclosure-'));
const dumpPath = join(directory, 'preclosure.dump');
const journalDirectory = join(directory, 'journal');
const pgEnvironment = {
  ...process.env,
  PGHOST: adminUrl.hostname,
  PGPORT: adminUrl.port || '5432',
  PGUSER: decodeURIComponent(adminUrl.username),
  PGPASSWORD: decodeURIComponent(adminUrl.password),
};
const pgDump = process.env.FORGELEX_PG_DUMP_BIN || 'pg_dump';
const pgRestore = process.env.FORGELEX_PG_RESTORE_BIN || 'pg_restore';
const hashSecret = 'h'.repeat(64);
const statusSecret = 's'.repeat(64);
const journalKeySecret = 'j'.repeat(64);
const macSecret = 'm'.repeat(64);
const encryptionKey = Buffer.alloc(32, 7);
const journalKeys = { v1: encryptionKey };
const journal = new FileAccountClosureJournal(journalDirectory, macSecret);
const journalAnchorId = `synthetic_anchor_${randomUUID().replaceAll('-', '')}`;
let sourceCreated = false;
let targetCreated = false;
let sourceClient;
let targetClient;
let app;

function worker(repository, client, identityAdmin) {
  return new AccountClosureReconciler({
    repository,
    leaseOwner: 'preclosure_disposable',
    handlers: createAccountClosureStepHandlers({
      identityAdmin,
      purgeService: new AccountClosurePurgeService(client),
      billingRetention: new AccountClosureBillingRetention(client),
    }),
  });
}

try {
  await journal.initializeAnchor(journalAnchorId);
  await createDisposableDatabase(adminUrl, sourceName);
  sourceCreated = true;
  const source = await createDatabase({ url: sourceUrl });
  sourceClient = source.client;
  await runPersistenceMigrations(sourceClient);
  const sourceLedger = new LedgerService(source.db, sourceClient);
  await sourceLedger.runMigrations();
  const suffix = randomUUID();
  const subjectId = `preclosure_${suffix}`;
  const account = await new AccountRepository(source.db).bootstrap({
    supabaseUserId: subjectId,
    email: `${suffix}@example.invalid`,
    displayName: 'Conta sintética descartável',
  });
  await new MatterRepository(source.db).createMatter({
    tenantId: account.tenant.id,
    createdBy: account.user.id,
    title: 'Conteúdo sintético descartável',
  });
  const keyHash = createHash('sha256').update(`synthetic_${suffix}`).digest('hex');
  await new ApiKeyRepository(source.db).create({
    tenantId: account.tenant.id,
    userId: account.user.id,
    subjectId,
    name: 'Chave sintética',
    keyPrefix: 'flx_test',
    tokenHash: keyHash,
    roles: ['owner'],
    scopes: ['mcp'],
  });
  const purchaseId = randomUUID();
  const now = new Date().toISOString();
  await sourceClient.execute({
    sql: `INSERT INTO billing_purchases (id, tenant_id, user_id, package_id, idempotency_key,
      amount_cents, currency, status, checkout_url, created_at, updated_at)
      VALUES (?, ?, ?, 'credits_25', ?, 2500, 'brl', 'PAID', 'https://example.invalid/private', ?, ?)`,
    args: [purchaseId, account.tenant.id, account.user.id, `synthetic_${purchaseId}`, now, now],
  });
  sourceClient.close();
  sourceClient = undefined;

  // The critical condition: backup predates the accepted closure.
  await run(pgDump, ['--format=custom', '--file', dumpPath, sourceName], { env: pgEnvironment });
  const reopened = await createDatabase({ url: sourceUrl });
  sourceClient = reopened.client;
  const sourceRepository = new AccountClosureRepository(sourceClient);
  const service = new AccountClosureService(sourceRepository, {
    statusTokenSecret: statusSecret,
    subjectHashSecret: hashSecret,
    journal,
    journalKeySecret,
    journalEncryptionKeys: journalKeys,
    journalEncryptionKeyVersion: 'v1',
  });
  const seconds = Math.floor(Date.now() / 1_000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const accessToken = `${encode({ alg: 'none' })}.${encode({ amr: [{ method: 'password', timestamp: seconds }] })}.fixture`;
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
    idempotencyKey: `synthetic_${suffix}`,
    accessToken,
  });
  const originWorker = worker(sourceRepository, sourceClient, {
    async deleteUser(id) {
      assert.equal(id, subjectId);
      return { alreadyMissing: false };
    },
  });
  for (let step = 0; step < 5; step += 1) assert.equal(await originWorker.runOne(), 'completed');
  assert.equal((await sourceRepository.findById(accepted.closure.id))?.status, 'COMPLETED');

  await createDisposableDatabase(adminUrl, targetName);
  targetCreated = true;
  await run(pgRestore, ['--no-owner', '--dbname', targetName, dumpPath], { env: pgEnvironment });
  const target = await createDatabase({ url: targetUrl });
  targetClient = target.client;
  const targetRepository = new AccountClosureRepository(targetClient);
  assert.equal(Number((await targetClient.execute('SELECT COUNT(*) AS n FROM account_closures')).rows[0].n), 0);
  assert.equal(
    Number(
      (
        await targetClient.execute({
          sql: 'SELECT COUNT(*) AS n FROM matters WHERE tenant_id = ?',
          args: [account.tenant.id],
        })
      ).rows[0].n,
    ),
    1,
  );
  assert.ok(await new ApiKeyRepository(target.db).findActiveByTokenHash(keyHash));

  let identityDeletes = 0;
  const identityAdmin = {
    async deleteUser(id) {
      assert.equal(id, subjectId);
      identityDeletes += 1;
      return { alreadyMissing: false };
    },
  };
  const targetWorker = worker(targetRepository, targetClient, identityAdmin);
  let interruptedOnce = false;
  let directedCalls = 0;
  const interruptibleWorker = {
    async runOneForClosure(closureId) {
      directedCalls += 1;
      if (directedCalls === 2 && !interruptedOnce) {
        interruptedOnce = true;
        throw new Error('ACCOUNT_CLOSURE_RESTORE_INTERRUPTED_SYNTHETIC');
      }
      return targetWorker.runOneForClosure(closureId);
    },
  };
  const gate = new AccountClosureRestoreGate({
    journal,
    repository: targetRepository,
    residualVerifier: new AccountClosurePurgeService(targetClient),
    reconciler: interruptibleWorker,
    subjectHashSecret: hashSecret,
    journalEncryptionKeys: journalKeys,
    journalAnchorId,
  });
  assert.equal(await gate.check(), false);
  app = await buildApp({
    database: target.db,
    databaseClient: targetClient,
    ledgerService: new LedgerService(target.db, targetClient),
    accountIdentityAdmin: identityAdmin,
    accountClosureReconciler: targetWorker,
    accountClosureJournal: journal,
    accountClosureRestoreGate: gate,
    supabaseIdentityVerifier: {
      async verify() {
        return {
          id: subjectId,
          email: `${suffix}@example.invalid`,
          emailConfirmed: true,
          displayName: 'Conta sintética descartável',
        };
      },
    },
    environment: {
      NODE_ENV: 'test',
      FORGELEX_ACCOUNT_CLOSURE_ENABLED: 'false',
      FORGELEX_ACCOUNT_CLOSURE_SUBJECT_HASH_SECRET: hashSecret,
      FORGELEX_ACCOUNT_CLOSURE_JOURNAL_REQUIRED: 'true',
      FORGELEX_ACCOUNT_CLOSURE_JOURNAL_KEY_SECRET: journalKeySecret,
      FORGELEX_ACCOUNT_CLOSURE_JOURNAL_ANCHOR_ID: journalAnchorId,
      FORGELEX_ACCOUNT_CLOSURE_JOURNAL_ACTIVE_KEY_VERSION: 'v1',
      FORGELEX_ACCOUNT_CLOSURE_JOURNAL_ENCRYPTION_KEYS_JSON: JSON.stringify({ v1: encryptionKey.toString('base64') }),
      FORGELEX_WEBHOOK_MASTER_KEY: 'synthetic-master-key',
    },
  });
  assert.equal((await app.inject({ method: 'GET', url: '/api/v2/tribunals' })).statusCode, 503);
  await assert.rejects(gate.replay(), /ACCOUNT_CLOSURE_RESTORE_INTERRUPTED_SYNTHETIC/);
  assert.equal(await gate.check(), false);
  assert.equal(
    (await targetRepository.listSteps(accepted.closure.id)).filter((step) => step.status === 'COMPLETED').length,
    1,
  );
  assert.deepEqual(await gate.replay(), { reapplied: 0, completed: 1 });
  assert.equal(await gate.check(), true);
  assert.deepEqual(await gate.replay(), { reapplied: 0, completed: 0 });
  assert.ok(identityDeletes >= 1);
  assert.equal((await targetRepository.findById(accepted.closure.id))?.status, 'COMPLETED');
  assert.equal(
    (await targetRepository.listSteps(accepted.closure.id)).filter((step) => step.status === 'COMPLETED').length,
    5,
  );
  assert.equal(await new ApiKeyRepository(target.db).findActiveByTokenHash(keyHash), undefined);
  assert.equal(
    Number(
      (
        await targetClient.execute({
          sql: 'SELECT COUNT(*) AS n FROM matters WHERE tenant_id = ?',
          args: [account.tenant.id],
        })
      ).rows[0].n,
    ),
    0,
  );
  const purchase = await targetClient.execute({
    sql: 'SELECT tenant_id, user_id, checkout_url FROM billing_purchases WHERE id = ?',
    args: [purchaseId],
  });
  assert.equal(purchase.rows[0].checkout_url, null);
  assert.notEqual(purchase.rows[0].tenant_id, account.tenant.id);
  assert.notEqual(purchase.rows[0].user_id, account.user.id);
  const login = await app.inject({
    method: 'POST',
    url: '/api/v2/auth/bootstrap',
    headers: { authorization: 'Bearer synthetic-jwt' },
    payload: { displayName: 'Sintética' },
  });
  assert.equal(login.statusCode, 403);
  assert.equal(login.json().error, 'ACCOUNT_CLOSED');
  const receipt = await app.inject({
    method: 'GET',
    url: `/api/v2/account/closure/${accepted.closure.id}`,
    headers: { 'x-closure-token': accepted.statusToken },
  });
  assert.equal(receipt.statusCode, 200);
  console.log(
    JSON.stringify({
      status: 'passed',
      sourceDatabase: sourceName,
      restoredDatabase: targetName,
      checks: [
        'preclosure_dump',
        'restored_private_data_present_before_replay',
        'traffic_blocked',
        'tombstone_reapplied',
        'five_steps_completed',
        'api_key_revoked',
        'private_data_purged',
        'financial_data_minimized',
        'login_denied',
        'receipt_available',
        'idempotent_replay',
        'interrupted_replay_resumed',
      ],
    }),
  );
} catch (error) {
  console.error(
    `ACCOUNT_CLOSURE_PRECLOSURE_RESTORE_FAILED: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  await app?.close().catch(() => undefined);
  sourceClient?.close();
  targetClient?.close();
  if (targetCreated) {
    try {
      await dropDisposableDatabase(adminUrl, targetName);
    } catch (error) {
      console.error(`PRECLOSURE_TARGET_CLEANUP_FAILED: ${String(error)}`);
      process.exitCode = 1;
    }
  }
  if (sourceCreated) {
    try {
      await dropDisposableDatabase(adminUrl, sourceName);
    } catch (error) {
      console.error(`PRECLOSURE_SOURCE_CLEANUP_FAILED: ${String(error)}`);
      process.exitCode = 1;
    }
  }
  if (
    resolve(dirname(directory)) !== resolve(tmpdir()) ||
    !/^forgelex-closure-preclosure-[A-Za-z0-9_-]+$/.test(basename(directory))
  ) {
    throw new Error('PRECLOSURE_TEMP_DIRECTORY_NOT_DISPOSABLE');
  }
  await rm(directory, { recursive: true, force: true });
}
