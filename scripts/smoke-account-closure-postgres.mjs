import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  AuthAdapter,
  ClosureAwareTokenVerifier,
  CompositeTokenVerifier,
  DatabaseApiKeyVerifier,
  EnvironmentTokenVerifier,
} from '../apps/api/dist/auth/fastify-auth.js';
import {
  AccountClosureReconciler,
  createAccountClosureStepHandlers,
} from '../apps/api/dist/account/account-closure-reconciler.js';
import { AccountClosureBillingRetention } from '../apps/api/dist/account/account-closure-billing-retention.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';
import { AccountClosureService } from '../apps/api/dist/account/account-closure-service.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { JurisprudenceIngestionService } from '../packages/legal-data/dist/index.js';
import {
  AccountClosureRepository,
  AccountRepository,
  ApiKeyRepository,
  createDatabase,
  IngestionRunRepository,
  JurisprudenceRepository,
  MatterRepository,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { CanonicalFixtureProvider } from '../packages/source-providers/dist/index.js';
import {
  adminConnectionUrl,
  createDisposableDatabase,
  databaseUrl,
  disposableName,
  dropDisposableDatabase,
} from './account-closure-test-db.mjs';

const checks = [];
const adminUrl = adminConnectionUrl();
const name = disposableName('forgelex_closure_smoke_');
await createDisposableDatabase(adminUrl, name);
let client;
let stage = 'connect';
try {
  const connection = await createDatabase({ url: databaseUrl(adminUrl, name) });
  client = connection.client;
  stage = 'migrations';
  await runPersistenceMigrations(client);
  await runPersistenceMigrations(client);
  const ledger = new LedgerService(connection.db, client);
  await ledger.runMigrations();
  await ledger.runMigrations();
  checks.push('migrations_twice');
  const fixtureProvider = new CanonicalFixtureProvider();
  const documents = await fixtureProvider.search('vazamento', { court: 'STJ', limit: 1 });
  assert.ok(documents.length > 0);
  await new JurisprudenceIngestionService(
    new JurisprudenceRepository(connection.db),
    new IngestionRunRepository(connection.db),
  ).ingest({ providerId: fixtureProvider.id, court: 'STJ', documents });
  const globalDocumentId = String((await client.execute('SELECT id FROM jurisprudence_documents LIMIT 1')).rows[0]?.id);
  assert.ok(globalDocumentId);

  const accounts = new AccountRepository(connection.db);
  stage = 'bootstrap';
  const suffix = randomUUID();
  const main = await accounts.bootstrap({
    supabaseUserId: `closure_${suffix}`,
    email: `main-${suffix}@example.invalid`,
    displayName: 'Conta descartável',
  });
  const control = await accounts.bootstrap({
    supabaseUserId: `control_${suffix}`,
    email: `control-${suffix}@example.invalid`,
    displayName: 'Controle descartável',
  });
  const shared = await accounts.bootstrap({
    supabaseUserId: `shared_${suffix}`,
    email: `shared-${suffix}@example.invalid`,
    displayName: 'Compartilhada descartável',
  });
  const repo = new AccountClosureRepository(client);
  const service = new AccountClosureService(repo, {
    statusTokenSecret: 's'.repeat(64),
    subjectHashSecret: 'h'.repeat(64),
  });
  const principal = (account) => ({
    subjectId: account.user.supabaseUserId,
    userId: account.user.id,
    tenantId: account.tenant.id,
    roles: ['owner'],
    scopes: ['matter:read'],
    authMethod: 'session',
  });
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = `${encode({ alg: 'none' })}.${encode({ amr: [{ method: 'password', timestamp: now }], exp: now + 3600 })}.fixture`;
  const request = (account, key, confirmation = 'ENCERRAR MINHA CONTA') =>
    service.request({
      principal: principal(account),
      confirmation,
      policyVersion: '2026-09-22.v1',
      idempotencyKey: key,
      accessToken: jwt,
    });

  await client.execute({
    // The only shared membership in this disposable database belongs to synthetic accounts.
    sql: `INSERT INTO forgelex_tenant_memberships (id, tenant_id, user_id, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'MEMBER', 'ACTIVE', ?, ?)`,
    args: [randomUUID(), shared.tenant.id, control.user.id, new Date().toISOString(), new Date().toISOString()],
  });
  await assert.rejects(request(shared, `shared_${suffix}`), /ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER/);
  assert.equal((await accounts.findBySupabaseUserId(shared.user.supabaseUserId))?.user.status, 'ACTIVE');
  assert.equal(
    Number(
      (
        await client.execute({
          sql: 'SELECT COUNT(*) AS count FROM account_closures WHERE tenant_id = ?',
          args: [shared.tenant.id],
        })
      ).rows[0]?.count,
    ),
    0,
  );
  checks.push('shared_tenant_rejected');

  const matters = new MatterRepository(connection.db);
  stage = 'fixtures';
  await matters.createMatter({ tenantId: main.tenant.id, createdBy: main.user.id, title: 'Privado descartável' });
  await matters.createMatter({ tenantId: control.tenant.id, createdBy: control.user.id, title: 'Controle intacto' });
  const keyHash = createHash('sha256').update(`key_${suffix}`).digest('hex');
  await new ApiKeyRepository(connection.db).create({
    tenantId: main.tenant.id,
    userId: main.user.id,
    subjectId: main.user.supabaseUserId,
    name: 'Descartável',
    keyPrefix: 'flx_test',
    tokenHash: keyHash,
    roles: ['owner'],
    scopes: ['mcp'],
  });
  const timestamp = new Date().toISOString();
  await client.execute({
    sql: `INSERT INTO billing_purchases (id, tenant_id, user_id, package_id, idempotency_key,
      amount_cents, currency, status, checkout_url, receipt_url, created_at, updated_at)
      VALUES (?, ?, ?, 'credits_25', ?, 2500, 'brl', 'PAID', 'https://example.invalid/private',
      'https://example.invalid/private', ?, ?)`,
    args: [randomUUID(), main.tenant.id, main.user.id, `purchase_${suffix}`, timestamp, timestamp],
  });

  const key = `closure_${suffix}`;
  stage = 'request';
  const results = await Promise.all([request(main, key), request(main, key)]);
  assert.equal(results[0].closure.id, results[1].closure.id);
  assert.equal(results.filter((result) => result.replay).length, 1);
  assert.equal((await repo.listSteps(results[0].closure.id)).length, 5);
  const replay = await request(main, key);
  assert.equal(replay.closure.id, results[0].closure.id);
  await assert.rejects(request(main, `other_${suffix}`), /ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT/);
  checks.push('concurrent_single_closure', 'replay_and_conflict');

  const closureId = results[0].closure.id;
  assert.equal((await accounts.findBySupabaseUserId(main.user.supabaseUserId))?.user.status, 'DISABLED');
  assert.equal(await new ApiKeyRepository(connection.db).findActiveByTokenHash(keyHash), undefined);
  const staticToken = `static_${suffix}`;
  const staticKeys = EnvironmentTokenVerifier.fromEnvironment({
    FORGELEX_API_KEYS: JSON.stringify([
      {
        tokenHash: createHash('sha256').update(staticToken).digest('hex'),
        subjectId: main.user.supabaseUserId,
        tenantId: main.tenant.id,
        userId: main.user.id,
        roles: ['owner'],
        scopes: ['mcp'],
      },
    ]),
  });
  const syntheticSession = {
    async verify(value) {
      return value === jwt ? principal(main) : null;
    },
  };
  const adapter = new AuthAdapter(
    new ClosureAwareTokenVerifier(
      new CompositeTokenVerifier([
        staticKeys,
        new DatabaseApiKeyVerifier(new ApiKeyRepository(connection.db)),
        syntheticSession,
      ]),
      { isBlocked: (value) => repo.isBlocked(value) },
    ),
  );
  for (const token of [jwt, `key_${suffix}`, staticToken]) {
    await assert.rejects(adapter.authenticate(`Bearer ${token}`), /Credencial Bearer inválida/);
  }
  assert.equal(await repo.isBlocked(principal(control)), false);
  checks.push('session_api_key_static_key_and_live_jwt_blocked');

  let identityDeletes = 0;
  stage = 'reconcile';
  let failMinimize = true;
  const actualBilling = new AccountClosureBillingRetention(client);
  const worker = new AccountClosureReconciler({
    repository: repo,
    leaseOwner: 'postgres_smoke',
    maxAttempts: 1,
    handlers: createAccountClosureStepHandlers({
      identityAdmin: {
        async deleteUser() {
          identityDeletes += 1;
          return { alreadyMissing: false };
        },
      },
      purgeService: new AccountClosurePurgeService(client),
      billingRetention: {
        async minimize(input) {
          if (failMinimize) {
            failMinimize = false;
            throw new Error('ACCOUNT_CLOSURE_BILLING_TEMPORARY');
          }
          return actualBilling.minimize(input);
        },
      },
    }),
  });
  assert.equal(await worker.runOne(), 'completed');
  assert.equal(await worker.runOne(), 'completed');
  assert.equal(await worker.runOne(), 'failed');
  assert.equal((await repo.findById(closureId))?.status, 'RECONCILIATION_REQUIRED');
  assert.equal(await repo.isBlocked(principal(main)), true);
  assert.equal(await repo.resumeFailedStep({ closureId, now: new Date().toISOString() }), true);
  assert.equal(await repo.resumeFailedStep({ closureId, now: new Date().toISOString() }), false);
  for (let index = 0; index < 3; index += 1) assert.equal(await worker.runOne(), 'completed');
  assert.equal((await repo.findById(closureId))?.status, 'COMPLETED');
  assert.equal(identityDeletes, 1);
  checks.push('failure_resume_without_repeating_completed_step');

  const count = async (sql, args = []) => Number((await client.execute({ sql, args })).rows[0]?.count);
  assert.equal(await count('SELECT COUNT(*) AS count FROM matters WHERE tenant_id = ?', [main.tenant.id]), 0);
  assert.equal(await count('SELECT COUNT(*) AS count FROM matters WHERE tenant_id = ?', [control.tenant.id]), 1);
  assert.equal(
    await count('SELECT COUNT(*) AS count FROM jurisprudence_documents WHERE id = ?', [globalDocumentId]),
    1,
  );
  const purchases = await client.execute({
    sql: 'SELECT tenant_id, user_id, amount_cents, checkout_url, receipt_url FROM billing_purchases WHERE idempotency_key = ?',
    args: [`purchase_${suffix}`],
  });
  assert.equal(purchases.rows.length, 1);
  assert.equal(Number(purchases.rows[0]?.amount_cents), 2500);
  assert.equal(purchases.rows[0]?.checkout_url, null);
  assert.equal(purchases.rows[0]?.receipt_url, null);
  assert.notEqual(purchases.rows[0]?.tenant_id, main.tenant.id);
  assert.notEqual(purchases.rows[0]?.user_id, main.user.id);
  checks.push('private_zero_control_and_global_corpus_intact_financial_minimized');
  console.log(JSON.stringify({ status: 'passed', driver: 'postgres', disposableDatabase: name, checks }));
} catch (error) {
  console.error(
    `ACCOUNT_CLOSURE_POSTGRES_SMOKE_FAILED at ${stage}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  client?.close();
  try {
    await dropDisposableDatabase(adminUrl, name);
  } catch (error) {
    console.error(`DISPOSABLE_DB_CLEANUP_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
