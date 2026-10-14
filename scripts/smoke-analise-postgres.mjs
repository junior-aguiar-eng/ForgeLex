import assert from 'node:assert/strict';
import { createDatabase, runPersistenceMigrations } from '../packages/persistence/dist/index.js';
import { runLedgerMigrations } from '../packages/billing-ledger/dist/index.js';
import { executarMigrationsAnalise } from '../packages/analise-juridica/dist/index.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';

// Dedicated local test database only; this check seeds and purges synthetic tenants.
const url = new URL(process.env.FORGELEX_ANALISE_TEST_POSTGRES_URL ?? '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/forgelex_analise_review');
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
const { client } = await createDatabase({ url: url.toString() });
try {
  await runPersistenceMigrations(client);
  await runLedgerMigrations(client);
  await executarMigrationsAnalise(client);
  const timestamp = new Date().toISOString();
  for (const tenant of ['analise-pg-a', 'analise-pg-b']) {
    const session = `${tenant}-session`;
    await client.execute({
      sql: 'INSERT INTO analise_sessoes (sessao_analitica_id,tenant_id,usuario_id,criada_em,atualizada_em) VALUES (?,?,?,?,?)',
      args: [session, tenant, `${tenant}-user`, timestamp, timestamp],
    });
    await client.execute({
      sql: "INSERT INTO analise_achados (id,sessao_analitica_id,ordem,tipo_analise,resumo,registrado_em) VALUES (?,?,1,'analisar','{}',?)",
      args: [`${tenant}-finding`, session, timestamp],
    });
    await client.execute({
      sql: "INSERT INTO analise_combos (id,tenant_id,usuario_id,sessao_analitica_id,combo,tools_restantes,preco_cents,ativado_em) VALUES (?,?,?,?,'decisao','[]',371,?)",
      args: [`${tenant}-combo`, tenant, `${tenant}-user`, session, timestamp],
    });
    await client.execute({
      sql: "INSERT INTO analise_consumos (id,tenant_id,idempotency_key,sessao_analitica_id,tool,resultado,criado_em) VALUES (?,?,'legacy',?,'analise.peca_analisar','{}',?)",
      args: [`${tenant}-legacy`, tenant, session, timestamp],
    });
    await client.execute({
      sql: "INSERT INTO analise_operacoes (id,tenant_id,usuario_id,idempotency_key,sessao_analitica_id,tool,fingerprint,status,resultado,criado_em,atualizado_em) VALUES (?,?,?,'new',?,'analise.peca_analisar',?,'COMPLETED','{}',?,?)",
      args: [`${tenant}-operation`, tenant, `${tenant}-user`, session, 'a'.repeat(64), timestamp, timestamp],
    });
  }
  const purge = new AccountClosurePurgeService(client);
  await assert.rejects(
    purge.verifyResiduals({
      closureId: 'analise-pg-closure',
      tenantId: 'analise-pg-a',
      tenantPseudonym: 'closed-analise-pg-a',
    }),
    { code: 'ACCOUNT_CLOSURE_RESIDUAL_DATA' },
  );
  const result = await purge.purgePrivateContent({ tenantId: 'analise-pg-a', closureId: 'analise-pg-closure' });
  assert.equal(result.deletedRows, 5);
  assert.equal(result.remainingPrivateRows, 0);
  const verified = await purge.verifyResiduals({
    closureId: 'analise-pg-closure',
    tenantId: 'analise-pg-a',
    tenantPseudonym: 'closed-analise-pg-a',
  });
  assert.equal(verified.privateRows, 0);
  const other = await client.execute({
    sql: 'SELECT COUNT(*) AS count FROM analise_sessoes WHERE tenant_id = ?',
    args: ['analise-pg-b'],
  });
  assert.equal(Number(other.rows[0].count), 1);
  for (const table of ['analise_consumos', 'analise_operacoes', 'analise_achados', 'analise_combos', 'analise_sessoes'])
    await client.execute(`DROP TABLE ${table}`);
  await client.execute(
    "DELETE FROM forgelex_migrations WHERE id IN ('analise-0001-initial', 'analise-0002-operation-idempotency')",
  );
  const disabled = await purge.purgePrivateContent({ tenantId: 'analise-pg-a', closureId: 'analise-pg-closure' });
  assert.equal(disabled.remainingPrivateRows, 0);
  console.log(
    'PostgreSQL: resíduos bloqueiam encerramento; cinco tabelas privadas expurgadas; outro tenant preservado; módulo ausente compatível.',
  );
} finally {
  client.close();
}
