import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from './migration-runner.js';
import type { Client } from '@libsql/client';

describe('persistence migrations', () => {
  let clients: Client[] = [];
  let databasePaths: string[] = [];
  const localPostgresUrl = process.env.FORGELEX_LOCAL_POSTGRES_URL;
  const hasLocalPostgres = Boolean(localPostgresUrl && /^postgres(?:ql)?:\/\/(?:[^/]+@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(localPostgresUrl));

  afterEach(() => {
    for (const client of clients) client.close();
    clients = [];
    for (const databasePath of databasePaths) {
      try { rmSync(databasePath, { force: true }); } catch { /* SQLite pode manter o arquivo bloqueado até o worker terminar. */ }
    }
    databasePaths = [];
  });

  it('é idempotente em SQLite', async () => {
    const databasePath = join(tmpdir(), `.forgelex-migrations-${randomUUID()}.db`);
    databasePaths.push(databasePath);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    clients.push(connection.client);
    await runPersistenceMigrations(connection.client);
    await runPersistenceMigrations(connection.client);

    const result = await connection.client.execute({
      sql: "SELECT COUNT(*) AS count FROM forgelex_migrations WHERE id = 'persistence-0013-jurisprudence-data-plane'",
      args: [],
    });
    expect(Number(result.rows[0]?.count)).toBe(1);
  });

  it.skipIf(!hasLocalPostgres)('exerce idempotência em PostgreSQL local quando explicitamente habilitado', async () => {
    const connection = await createDatabase({ url: localPostgresUrl! });
    clients.push(connection.client);
    await runPersistenceMigrations(connection.client);
    await runPersistenceMigrations(connection.client);

    const result = await connection.client.execute({
      sql: "SELECT COUNT(*) AS count FROM forgelex_migrations WHERE id = ?",
      args: ['persistence-0013-jurisprudence-data-plane'],
    });
    expect(Number(result.rows[0]?.count)).toBe(1);
  });
});
