import { afterEach, beforeEach, expect, it } from 'vitest';
import { ToolRegistry } from '@forgelex/agent-core';
import { LedgerService } from '@forgelex/billing-ledger';
import { createDatabase, runMigrations } from '@forgelex/persistence';
import { analiseMigrations, executarMigrationsAnalise } from './migrations.js';
import { ModuloAnalise } from './modulo.js';

let connection: Awaited<ReturnType<typeof createDatabase>>;
let ledger: LedgerService;

beforeEach(async () => {
  connection = await createDatabase({ url: 'file::memory:' });
  ledger = new LedgerService(connection.db, connection.client);
  await ledger.bootstrapTables();
});
afterEach(() => connection.client.close());

const create = (migrationMode: 'apply' | 'verify') =>
  ModuloAnalise.criar({
    client: connection.client,
    ledger,
    registry: new ToolRegistry(),
    migrationMode,
  });
const schemaState = async () => ({
  tables: (await connection.client.execute('SELECT name, sql FROM sqlite_master ORDER BY name')).rows,
  journal: (await connection.client.execute('SELECT id, applied_at FROM forgelex_migrations ORDER BY id')).rows,
});

it('verify recusa migrations ausentes sem criar tabelas nem modificar o journal', async () => {
  const before = await schemaState();
  await expect(create('verify')).rejects.toMatchObject({ code: 'MIGRATIONS_PENDING' });
  expect(await schemaState()).toEqual(before);
});

it('verify recusa atualização parcial sem aplicar a migration de idempotência', async () => {
  await runMigrations(connection.client, [analiseMigrations[0]!]);
  const before = await schemaState();
  await expect(create('verify')).rejects.toThrow('analise-0002-operation-idempotency');
  expect(await schemaState()).toEqual(before);
});

it('verify aceita schema preparado sem executar escrita', async () => {
  await executarMigrationsAnalise(connection.client);
  await connection.client.execute('PRAGMA query_only = ON');
  const before = await schemaState();
  await expect(create('verify')).resolves.toBeInstanceOf(ModuloAnalise);
  expect(await schemaState()).toEqual(before);
});

it('apply instala o módulo explicitamente e conserva o journal ao repetir', async () => {
  await create('apply');
  const before = await schemaState();
  expect(before.journal.filter((row) => String(row.id).startsWith('analise-'))).toHaveLength(2);
  await create('apply');
  expect(await schemaState()).toEqual(before);
});
