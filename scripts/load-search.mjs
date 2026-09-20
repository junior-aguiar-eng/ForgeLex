import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AuthAdapter } from '../apps/api/dist/auth/fastify-auth.js';
import { buildApp } from '../apps/api/dist/app.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { JurisprudenceIngestionService } from '../packages/legal-data/dist/index.js';
import {
  createDatabase, IngestionRunRepository, JurisprudenceRepository, runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { CanonicalFixtureProvider, SourceRouter } from '../packages/source-providers/dist/index.js';

const concurrency = Number(process.env.FORGELEX_LOAD_CONCURRENCY ?? 5);
const requests = Number(process.env.FORGELEX_LOAD_REQUESTS ?? 25);
const databaseUrl = process.env.FORGELEX_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) throw new Error('DATABASE_URL_POSTGRES_REQUIRED');
if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(requests) || requests < 1) throw new Error('INVALID_LOAD_CONFIGURATION');

const runId = randomUUID();
const tenantId = `load_${runId}`;
const userId = `load_user_${runId}`;
const token = `load_token_${runId}`;
const connection = await createDatabase({ url: databaseUrl });
const ledger = new LedgerService(connection.db, connection.client);
let app;

class LoadVerifier {
  async verify(candidate) {
    return candidate === token ? {
      subjectId: userId, tenantId, userId, roles: ['lawyer'],
      scopes: ['research:read', 'billing:read'], authMethod: 'api_key',
    } : null;
  }
}

try {
  await runPersistenceMigrations(connection.client);
  await ledger.runMigrations();
  await ledger.provisionAccount(tenantId, { paidBalanceCents: requests * 20 + 100, promotionalBalanceCents: 0 });
  const sourceRouter = new SourceRouter();
  const fixture = new CanonicalFixtureProvider();
  sourceRouter.registerProvider(fixture);
  const documents = await fixture.search('vazamento', { court: 'STJ', limit: 10 });
  await new JurisprudenceIngestionService(
    new JurisprudenceRepository(connection.db), new IngestionRunRepository(connection.db),
  ).ingest({ providerId: fixture.id, court: 'STJ', documents });
  app = await buildApp({
    authAdapter: new AuthAdapter(new LoadVerifier()), database: connection.db,
    databaseClient: connection.client, ledgerService: ledger, sourceRouter,
    environment: { NODE_ENV: 'test', FORGELEX_WEBHOOK_MASTER_KEY: 'load-fixture-master-key' },
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const endpoint = `http://127.0.0.1:${address.port}/api/v2/research/search-case-law`;
  const balanceBefore = await ledger.getAvailableBalanceCents(tenantId);
  const latencies = [];
  const outcomes = [];
  const intents = Array.from({ length: requests }, () => ({ key: randomUUID(), retry: false }));
  for (let index = 0; index < Math.min(3, intents.length); index += 1) intents.push({ key: intents[index].key, retry: true });

  let cursor = 0;
  async function worker() {
    while (cursor < intents.length) {
      const intent = intents[cursor++];
      const started = performance.now();
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': intent.key },
          body: JSON.stringify({ query: 'vazamento de dados', court: 'STJ', limit: 5 }),
        });
        latencies.push(performance.now() - started);
        outcomes.push({ status: response.status, replay: response.headers.get('x-idempotent-replay') === 'true', retry: intent.retry });
        await response.arrayBuffer();
      } catch {
        latencies.push(performance.now() - started);
        outcomes.push({ status: 0, replay: false, retry: intent.retry });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, intents.length) }, () => worker()));
  const balanceAfter = await ledger.getAvailableBalanceCents(tenantId);
  const errors = outcomes.filter((item) => item.status < 200 || item.status >= 400);
  const serverErrors = outcomes.filter((item) => item.status >= 500);
  const replays = outcomes.filter((item) => item.replay).length;
  const sorted = latencies.toSorted((a, b) => a - b);
  const percentile = (value) => Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] * 100) / 100;
  const balanceDeltaCents = balanceBefore - balanceAfter;
  assert.equal(serverErrors.length, 0);
  assert.ok(errors.length / outcomes.length <= 0.01);
  assert.equal(balanceDeltaCents, requests * 20);
  assert.equal(replays, Math.min(3, requests));
  console.log(JSON.stringify({
    status: 'passed', requests, totalAttempts: outcomes.length, concurrency,
    errors: errors.length, replays, balanceDeltaCents, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
  }));
} finally {
  if (app) await app.close();
  const cleanup = [
    'DELETE FROM research_search_history WHERE tenant_id = ?',
    'DELETE FROM ledger_entries WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id = ?)',
    'DELETE FROM usage_events WHERE tenant_id = ?', 'DELETE FROM billing_operations WHERE tenant_id = ?',
    'DELETE FROM ledger_accounts WHERE tenant_id = ?', 'DELETE FROM audit_logs WHERE tenant_id = ?',
  ];
  for (const sql of cleanup) { try { await connection.client.execute({ sql, args: [tenantId] }); } catch {} }
  connection.client.close();
}
