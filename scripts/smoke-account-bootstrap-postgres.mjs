import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { createDatabase, runPersistenceMigrations, AccountRepository } from '../packages/persistence/dist/index.js';

// Cadastro simultâneo do mesmo usuário em PostgreSQL real: nenhuma chamada pode falhar na chave primária
// `forgelex_user_profiles_pkey` e só pode existir uma linha de perfil, espaço e vínculo.
const rawUrl = process.env.FORGELEX_LOCAL_POSTGRES_URL;
let base;
try {
  base = new URL(rawUrl);
} catch {
  throw new Error('BLOCKED_TEST_DATABASE');
}
if (
  !['postgres:', 'postgresql:'].includes(base.protocol) ||
  !['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) ||
  base.searchParams.has('host')
)
  throw new Error('BLOCKED_TEST_DATABASE');

const name = `forgelex_bootstrap_${randomUUID().replaceAll('-', '')}`;
assert.match(name, /^forgelex_bootstrap_[a-f0-9]{32}$/);
const admin = postgres(rawUrl, { max: 1 });
await admin.unsafe(`CREATE DATABASE ${name}`);
const isolated = new URL(base);
isolated.pathname = '/' + name;
let connection;
try {
  connection = await createDatabase({ url: isolated.toString() });
  await runPersistenceMigrations(connection.client);
  const repository = new AccountRepository(connection.db);

  for (let round = 0; round < 5; round += 1) {
    const input = {
      supabaseUserId: `user-race-${round}`,
      email: `corrida${round}@exemplo.com`,
      displayName: 'Pessoa Corrida',
    };
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => repository.bootstrap(input)));
    const failed = results.filter((result) => result.status === 'rejected');
    assert.equal(failed.length, 0, `rodada ${round}: ${failed.map((f) => f.reason?.message).join(' | ')}`);
    const accounts = results.map((result) => result.value);
    assert.equal(new Set(accounts.map((account) => account.user.id)).size, 1);
    assert.equal(new Set(accounts.map((account) => account.membership.id)).size, 1);
  }

  const sql = postgres(isolated.toString(), { max: 1 });
  try {
    const [counts] = await sql`SELECT
      (SELECT COUNT(*) FROM forgelex_user_profiles)::int AS users,
      (SELECT COUNT(*) FROM forgelex_tenants)::int AS tenants,
      (SELECT COUNT(*) FROM forgelex_tenant_memberships)::int AS memberships`;
    assert.deepEqual({ ...counts }, { users: 5, tenants: 5, memberships: 5 });
  } finally {
    await sql.end();
  }
  console.log('account_bootstrap_concurrent_ok');
} finally {
  await connection?.client.close?.();
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}
