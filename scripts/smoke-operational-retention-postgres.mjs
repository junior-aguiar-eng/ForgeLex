import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createDatabase, runPersistenceMigrations, ResearchHistoryRepository } from '../packages/persistence/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { OperationalRetentionService } from '../apps/api/dist/operations/retention-service.js';

const url = new URL(process.env.FORGELEX_LOCAL_POSTGRES_URL ?? process.env.DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'LOCAL_TEST_POSTGRES_REQUIRED');
const name = `forgelex_retention_${randomUUID().replaceAll('-', '')}`;
const adminUrl = new URL(url); adminUrl.pathname = '/postgres';
const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
let connection;
try {
  await admin.unsafe(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  connection = await createDatabase({ url: url.toString() });
  await runPersistenceMigrations(connection.client);
  const ledger = new LedgerService(connection.db, connection.client);
  await ledger.runMigrations();
  await ledger.provisionAccount('retention-test', { paidBalanceCents: 100, promotionalBalanceCents: 0 });
  const now = new Date('2026-10-07T12:00:00.000Z');
  const history = new ResearchHistoryRepository(connection.db);
  await history.record({ tenantId: 'retention-test', userId: 'synthetic', operationId: 'old', query: 'synthetic', court: 'STJ', resultCount: 0, billingMode: 'FREE', chargedCents: 0, createdAt: '2020-01-01T00:00:00.000Z' });
  await history.record({ tenantId: 'retention-test', userId: 'synthetic', operationId: 'boundary', query: 'boundary', court: 'STJ', resultCount: 0, billingMode: 'FREE', chargedCents: 0, createdAt: '2026-07-09T12:00:00.000Z' });
  const service = new OperationalRetentionService(connection.client);
  const inspection = await service.inspect(now);
  assert.equal(inspection.history, 1);
  assert.equal((await history.list('retention-test', 'synthetic')).length, 2);
  assert.deepEqual(await service.purge(now), inspection);
  assert.equal((await history.list('retention-test', 'synthetic')).length, 1);
  assert.equal(await ledger.getAvailableBalanceCents('retention-test'), 100);
  console.log(JSON.stringify({ status: 'passed', checks: ['postgres_read_only_inspection', 'exact_cutoff', 'inspection_matches_purge', 'financial_balance_preserved'], isolatedDatabase: name }));
} finally {
  connection?.client.close();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end({ timeout: 5 });
}
