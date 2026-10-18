import { afterEach, beforeEach, expect, it } from 'vitest';
import { LedgerService } from '@forgelex/billing-ledger';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { executarMigrationsAnalise } from '@forgelex/analise-juridica';
import { buildApp } from './app.js';

let connection: Awaited<ReturnType<typeof createDatabase>>;
let ledger: LedgerService;
beforeEach(async () => {
  connection = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(connection.client);
  ledger = new LedgerService(connection.db, connection.client);
  await ledger.bootstrapTables();
});
afterEach(() => connection.client.close());

const start = (overrides: Record<string, string> = {}) =>
  buildApp({
    database: connection.db,
    databaseClient: connection.client,
    ledgerService: ledger,
    environment: {
      NODE_ENV: 'production',
      FORGELEX_WEBHOOK_MASTER_KEY: 'test-only-webhook-key',
      FORGELEX_AUTO_MIGRATE: 'false',
      FORGELEX_ANALISE_ENABLED: 'true',
      ...overrides,
    },
  });

it('produção recusa análise sem schema preparado quando auto-migrate está desligado', async () => {
  // Close even an incorrectly successful startup so the RED run leaves no app open.
  await expect(
    start().then(async (app) => {
      await app.close();
    }),
  ).rejects.toMatchObject({ code: 'MIGRATIONS_PENDING' });
  expect(
    (await connection.client.execute("SELECT name FROM sqlite_master WHERE name = 'analise_operacoes'")).rows,
  ).toHaveLength(0);
});

it.each([{ FORGELEX_ANALISE_ENABLED: 'false' }, { FORGELEX_AUTO_MIGRATE: 'true' }])(
  'preserva o controle de ativação e a aplicação explícita: %j',
  async (flags) => {
    const app = await start(flags);
    await app.close();
    const tables = await connection.client.execute("SELECT name FROM sqlite_master WHERE name = 'analise_operacoes'");
    expect(tables.rows).toHaveLength(flags.FORGELEX_AUTO_MIGRATE === 'true' ? 1 : 0);
  },
);

it('produção inicia análise com schema preparado e conexão somente leitura', async () => {
  await executarMigrationsAnalise(connection.client);
  await connection.client.execute('PRAGMA query_only = ON');
  const app = await start();
  await app.close();
});
