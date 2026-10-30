import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  createDatabase,
  runPersistenceMigrations,
  assertMigrationsApplied,
  persistenceMigrations,
  AccountRepository,
  MatterRepository,
} from '../packages/persistence/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { buildApp } from '../apps/api/dist/app.js';

// Local validation only. Never loads an OpenAI key, dispatches a worker or sends inference.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = resolve(root, '.superpowers/sdd/2026-10-10-agentic-workspace-transition/task7-local');
const databasePath = resolve(directory, 'application.sqlite');
const markerPath = resolve(directory, 'initialized.json');
const mode = process.argv[2];
assert(['prepare', 'serve', 'check'].includes(mode), 'Use prepare, serve or check');
const hash = (value) => createHash('sha256').update(value).digest('hex');
function profile(name) {
  return Object.fromEntries(
    readFileSync(resolve(root, name), 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).trim()];
      }),
  );
}
const identity = profile('.env.closed-pilot.local');
const auth = profile('.env.auth-local.local');
const owner = { tenantId: identity.FORGELEX_CLOSED_PILOT_TENANT_ID, userId: identity.FORGELEX_CLOSED_PILOT_USER_ID };
assert(/^tenant_[a-f0-9]{32}$/.test(owner.tenantId) && /^user_[a-f0-9]{32}$/.test(owner.userId));
assert(/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(auth.FORGELEX_SUPABASE_URL));
assert(auth.FORGELEX_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'));
const url = 'file:' + databasePath.replaceAll('\\', '/');
const fixtureBytes = readFileSync(resolve(root, 'docs/architecture/fixtures/agentic-task6-synthetic-cases.json'));
assert.equal(hash(fixtureBytes), 'f28cbc3b4b0c7b6135e36365ddb8b1a8d42419aee0076a96d70d34d64e370b5b');
const example = JSON.parse(fixtureBytes).cases.find((c) => c.id === 'T6-GAP');
mkdirSync(directory, { recursive: true });
if (mode === 'prepare') {
  assert(!existsSync(databasePath) && !existsSync(markerPath), 'Never migrate or overwrite an existing target');
  const connection = await createDatabase({ url });
  try {
    await runPersistenceMigrations(connection.client);
    await new LedgerService(connection.db, connection.client).runMigrations();
    writeFileSync(
      markerPath,
      JSON.stringify(
        {
          database: 'application.sqlite',
          ownerHash: hash(JSON.stringify(owner)),
          createdAt: new Date().toISOString(),
          initOnly: true,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify({ status: 'prepared', durableSQLite: true, newDatabaseOnly: true, paidCalls: 0 }));
  } finally {
    connection.client.close();
  }
  process.exit(0);
}
assert(existsSync(databasePath) && existsSync(markerPath), 'Run prepare for the new isolated database first');
const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
assert.equal(marker.ownerHash, hash(JSON.stringify(owner)), 'Local owner configuration changed');
const connection = await createDatabase({ url });
await assertMigrationsApplied(connection.client, persistenceMigrations);
const ledger = new LedgerService(connection.db, connection.client, { migrationMode: 'verify' });
await ledger.runMigrations();
if (mode === 'check') {
  try {
    const integrity = await connection.client.execute('PRAGMA quick_check');
    assert.equal(Object.values(integrity.rows[0])[0], 'ok');
    const account = await new AccountRepository(connection.db).findByUserAndTenant(owner.userId, owner.tenantId);
    assert(
      account &&
        account.user.status === 'ACTIVE' &&
        account.tenant.status === 'ACTIVE' &&
        account.membership.status === 'ACTIVE' &&
        account.membership.role === 'OWNER',
      'Local login not yet validated',
    );
    const matters = new MatterRepository(connection.db);
    if (!marker.syntheticMatterId) {
      const matter = await matters.createMatter({
        ...owner,
        createdBy: owner.userId,
        title: 'Validação local — T6-GAP',
      });
      const source = example.selectedSources[0];
      const document = await matters.ingestTextDocument({
        ...owner,
        createdBy: owner.userId,
        matterId: matter.id,
        title: source.id,
        originalFilename: source.id + '.txt',
        mimeType: 'text/plain',
        content: source.text,
      });
      marker.syntheticMatterId = matter.id;
      marker.syntheticDocumentId = document.document.id;
      marker.syntheticVersionId = document.version.id;
      writeFileSync(markerPath, JSON.stringify(marker, null, 2));
    }
    const saved = await matters.getDocumentVersion(owner.tenantId, marker.syntheticDocumentId, 'work');
    assert(saved && saved.version.id === marker.syntheticVersionId, 'Synthetic version not persisted');
    assert.equal(saved.version.content, example.selectedSources[0].text);
    assert.equal(saved.version.contentHash, hash(example.selectedSources[0].text));
    const users = await connection.client.execute('SELECT count(*) AS n FROM forgelex_user_profiles');
    assert.equal(Number(users.rows[0].n), 1, 'Only the verified owner may be enrolled in this local target');
    const budgets = await connection.client.execute('SELECT count(*) AS n FROM inference_budgets');
    const executions = await connection.client.execute('SELECT count(*) AS n FROM agentic_executions');
    assert.equal(Number(budgets.rows[0].n), 0);
    assert.equal(Number(executions.rows[0].n), 0);
    const backupPath = resolve(directory, 'application-validation-backup.sqlite');
    if (!existsSync(backupPath)) await connection.client.execute({ sql: 'VACUUM INTO ?', args: [backupPath] });
    const backup = await createDatabase({ url: 'file:' + backupPath.replaceAll('\\', '/') });
    try {
      const integrity = await backup.client.execute('PRAGMA quick_check');
      assert.equal(Object.values(integrity.rows[0])[0], 'ok');
      const recovered = await new MatterRepository(backup.db).getDocumentVersion(
        owner.tenantId,
        marker.syntheticDocumentId,
        'work',
      );
      const recoveredOwner = await new AccountRepository(backup.db).findByUserAndTenant(owner.userId, owner.tenantId);
      assert(recoveredOwner && recoveredOwner.membership.status === 'ACTIVE');
      assert.equal(recovered?.version.id, saved.version.id);
      assert.equal(recovered?.version.content, example.selectedSources[0].text);
    } finally {
      backup.client.close();
    }
    const originalLedgerPath = resolve(
      root,
      '.superpowers/sdd/2026-10-10-agentic-workspace-transition/task6-pilot/pilot.sqlite',
    );
    assert(existsSync(originalLedgerPath), 'Original cumulative ledger must exist');
    const original = await createDatabase({ url: 'file:' + originalLedgerPath.replaceAll('\\', '/') });
    let financial;
    try {
      const account = await original.client.execute({
        sql: 'SELECT paid_balance_cents, promotional_balance_cents FROM ledger_accounts WHERE tenant_id=?',
        args: ['boni-task6-synthetic-only'],
      });
      const rows = await original.client.execute({
        sql: 'SELECT payload_json FROM inference_budgets WHERE tenant_id=?',
        args: ['boni-task6-synthetic-only'],
      });
      const historical = rows.rows.map((row) => JSON.parse(row.payload_json));
      const calls = await original.client.execute({
        sql: 'SELECT count(*) AS n FROM inference_calls WHERE tenant_id=?',
        args: ['boni-task6-synthetic-only'],
      });
      financial = {
        availableCents: Number(account.rows[0].paid_balance_cents),
        settledCents: historical.reduce((n, b) => n + b.consumedCents, 0),
        provisionedCents: historical.reduce((n, b) => n + (b.provisionedCents ?? 0), 0),
        escrowCents: historical.reduce((n, b) => n + b.remainingPaidCents + b.remainingPromoCents, 0),
        historicalCalls: Number(calls.rows[0].n),
        invoiceReconciled: false,
      };
      assert.deepEqual(financial, {
        availableCents: 441,
        settledCents: 55,
        provisionedCents: 4,
        escrowCents: 0,
        historicalCalls: 55,
        invoiceReconciled: false,
      });
    } finally {
      original.client.close();
    }
    const receipt = {
      status: 'passed',
      kind: 'DURABLE_LOCAL_DATABASE_AND_REAL_AUTH_ACCOUNT',
      ownerMatchesVerifiedProfile: true,
      activeOwner: true,
      syntheticFixture: 'T6-GAP',
      syntheticVersionPreserved: true,
      syntheticContentMatchesFixture: true,
      backupIndependentReadbackPassed: true,
      sqliteIntegrityCheck: 'ok',
      originalFundingDatabaseCopied: false,
      syntheticContentHash: saved.version.contentHash,
      syntheticVersionIdHash: hash(marker.syntheticVersionId),
      model: 'gpt-6.1-sol',
      cumulativeCeilingCents: 500,
      newBudgetOrTopup: false,
      newPaidCalls: 0,
      inferenceCommandsDisabled: true,
      workerEnabled: false,
      originalLedgerMigrated: false,
      financial,
    };
    writeFileSync(resolve(directory, 'check.json'), JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } finally {
    connection.client.close();
  }
  process.exit(0);
}
let outboundAuthReads = 0,
  blockedOutbound = 0;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const target = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (
    target.origin !== auth.FORGELEX_SUPABASE_URL ||
    target.pathname !== '/auth/v1/user' ||
    (init?.method ?? 'GET') !== 'GET'
  ) {
    blockedOutbound++;
    throw new Error('LOCAL_VALIDATION_OUTBOUND_BLOCKED');
  }
  outboundAuthReads++;
  return nativeFetch(input, { ...init, redirect: 'error' });
};
const app = await buildApp({
  database: connection.db,
  databaseClient: connection.client,
  ledgerService: ledger,
  environment: {
    NODE_ENV: 'test',
    FORGELEX_AUTO_MIGRATE: 'false',
    FORGELEX_DATABASE_URL: url,
    FORGELEX_SUPABASE_URL: auth.FORGELEX_SUPABASE_URL,
    FORGELEX_SUPABASE_PUBLISHABLE_KEY: auth.FORGELEX_SUPABASE_PUBLISHABLE_KEY,
    FORGELEX_ALLOWED_ORIGINS: 'http://127.0.0.1:3420',
    FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true',
    FORGELEX_CLOSED_PILOT_ENABLED: 'true',
    FORGELEX_CLOSED_PILOT_TENANT_ID: owner.tenantId,
    FORGELEX_CLOSED_PILOT_USER_ID: owner.userId,
  },
  agenticWorkspace: { scheduler: false },
  closedPilotDependencies: {
    apiKey: 'local-validation-sending-disabled',
    transport: async () => {
      blockedOutbound++;
      throw new Error('LOCAL_VALIDATION_INFERENCE_DISABLED');
    },
  },
});
app.get('/local-validation/status', async () => ({
  mode: 'READ_ONLY_LOCAL_VALIDATION',
  outboundAuthReads,
  blockedOutbound,
  workerEnabled: false,
  inferenceCommandsDisabled: true,
  authVerifier: 'SupabaseIdentityVerifier',
  host: '127.0.0.1',
}));
app.addHook('onRequest', async (request, reply) => {
  if (!['GET', 'OPTIONS', 'HEAD'].includes(request.method) && request.url !== '/api/v2/auth/bootstrap')
    return reply
      .code(503)
      .send({ error: 'LOCAL_VALIDATION_ONLY', message: 'Validação local: envios e cobranças estão desabilitados.' });
});
await app.listen({ host: '127.0.0.1', port: 3421 });
marker.serverStarts = (marker.serverStarts ?? 0) + 1;
writeFileSync(markerPath, JSON.stringify(marker, null, 2));
console.log(
  JSON.stringify({
    status: 'listening',
    origin: 'http://127.0.0.1:3421',
    durableSQLite: true,
    realAuthVerifier: true,
    workerEnabled: false,
    inferenceCommandsDisabled: true,
  }),
);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  connection.client.close();
  globalThis.fetch = nativeFetch;
  writeFileSync(
    resolve(directory, 'server-stop.json'),
    JSON.stringify(
      { outboundAuthReads, blockedOutbound, workerEnabled: false, originalLedgerMigrated: false, stoppedCleanly: true },
      null,
      2,
    ),
  );
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
