import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../apps/api/dist/app.js';
import {
  AccountClosureReconciler,
  createAccountClosureStepHandlers,
} from '../apps/api/dist/account/account-closure-reconciler.js';
import { AccountClosureBillingRetention } from '../apps/api/dist/account/account-closure-billing-retention.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import {
  AccountClosureRepository,
  createDatabase,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';

// This process has no external database, Auth project, or real subject.
const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
await runPersistenceMigrations(connection.client);
const ledger = new LedgerService(connection.db, connection.client);
await ledger.runMigrations();
const repository = new AccountClosureRepository(connection.client);
let fixture;
let failNextDeletion = false;
let deletedCount = 0;

function resetFixture() {
  const id = randomUUID();
  const email = `closure-${id}@forgelex.invalid`;
  const user = {
    id,
    email,
    email_confirmed_at: new Date().toISOString(),
    user_metadata: { full_name: 'Conta descartável' },
    app_metadata: { provider: 'email', providers: ['email'] },
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: false,
  };
  const now = Math.floor(Date.now() / 1_000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    sub: id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    iat: now,
    exp: now + 3_600,
    amr: [{ method: 'password', timestamp: now }],
  })}.fixture`;
  fixture = {
    user,
    password: 'senha-sintetica-7-8',
    token,
    deleted: false,
    session: {
      access_token: token,
      refresh_token: randomUUID(),
      expires_in: 3_600,
      expires_at: now + 3_600,
      token_type: 'bearer',
      user,
    },
  };
  deletedCount = 0;
  failNextDeletion = false;
  return { email, password: 'senha-sintetica-7-8', subjectId: id };
}
resetFixture();

function send(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
  });
  response.end(JSON.stringify(body));
}

const authServer = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204, {});
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:15431');
  if (
    request.method === 'POST' &&
    url.pathname === '/auth/v1/token' &&
    url.searchParams.get('grant_type') === 'password'
  ) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    let credentials;
    try {
      credentials = request.headers['content-type']?.includes('application/json')
        ? JSON.parse(raw)
        : Object.fromEntries(new URLSearchParams(raw));
    } catch {
      credentials = {};
    }
    return fixture.deleted || credentials.email !== fixture.user.email || credentials.password !== fixture.password
      ? send(response, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
      : send(response, 200, fixture.session);
  }
  if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
    return !fixture.deleted && request.headers.authorization === `Bearer ${fixture.token}`
      ? send(response, 200, fixture.user)
      : send(response, 401, { error: 'invalid_token' });
  }
  if (request.method === 'POST' && url.pathname === '/auth/v1/logout') return send(response, 204, {});
  return send(response, 404, { error: 'not_found' });
});
await new Promise((resolve, reject) => authServer.listen(15431, '127.0.0.1', resolve).once('error', reject));

const identityAdmin = {
  async deleteUser(subjectId) {
    if (subjectId !== fixture.user.id) throw new Error('SUPABASE_ACCOUNT_DELETE_FAILED');
    if (failNextDeletion) {
      failNextDeletion = false;
      throw new Error('SUPABASE_ACCOUNT_DELETE_FAILED');
    }
    const alreadyMissing = fixture.deleted;
    fixture.deleted = true;
    deletedCount += alreadyMissing ? 0 : 1;
    return { alreadyMissing };
  },
};
const worker = new AccountClosureReconciler({
  repository,
  handlers: createAccountClosureStepHandlers({
    identityAdmin,
    purgeService: new AccountClosurePurgeService(connection.client),
    billingRetention: new AccountClosureBillingRetention(connection.client),
  }),
  leaseOwner: 'e2e_disposable',
  maxAttempts: 1,
});
const app = await buildApp({
  database: connection.db,
  databaseClient: connection.client,
  ledgerService: ledger,
  accountIdentityAdmin: identityAdmin,
  environment: {
    NODE_ENV: 'test',
    FORGELEX_SUPABASE_URL: 'http://127.0.0.1:15431',
    FORGELEX_SUPABASE_PUBLISHABLE_KEY: 'closure-e2e-publishable',
    FORGELEX_ALLOWED_ORIGINS: 'http://127.0.0.1:3000',
    FORGELEX_ACCOUNT_CLOSURE_ENABLED: 'true',
    FORGELEX_ACCOUNT_CLOSURE_STATUS_TOKEN_SECRET: 's'.repeat(64),
    FORGELEX_ACCOUNT_CLOSURE_SUBJECT_HASH_SECRET: 'h'.repeat(64),
    FORGELEX_WEBHOOK_MASTER_KEY: 'closure-e2e-master-key',
  },
});
app.post('/e2e/reset', async () => resetFixture());
app.post('/e2e/fail-next-delete', async () => {
  failNextDeletion = true;
  return { armed: true };
});
app.post('/e2e/reconcile', async () => ({ result: await worker.runOne(), deletedCount }));
app.post('/e2e/resume/:closureId', async (request) => ({
  resumed: await repository.resumeFailedStep({ closureId: request.params.closureId, now: new Date().toISOString() }),
}));
app.get('/e2e/state', async () => ({ deleted: fixture.deleted, deletedCount }));
await app.listen({ host: '127.0.0.1', port: 3001 });

async function shutdown() {
  await app.close().catch(() => undefined);
  await new Promise((resolve) => authServer.close(resolve));
  connection.client.close();
}
process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
