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
      sql: "SELECT COUNT(*) AS count FROM forgelex_migrations WHERE id = 'persistence-0019-explicit-version-publication-status'",
      args: [],
    });
    expect(Number(result.rows[0]?.count)).toBe(1);
    const tables = await connection.client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('jurisprudence_source_manifests', 'jurisprudence_ingestion_staging')",
      args: [],
    });
    expect(tables.rows).toHaveLength(2);
    const compactSearch = await connection.client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jurisprudence_document_terms'",
      args: [],
    });
    expect(compactSearch.rows).toHaveLength(0);
    const columns = await connection.client.execute({ sql: 'PRAGMA table_info(jurisprudence_documents)', args: [] });
    expect(columns.rows.some((row) => row.name === 'search_text')).toBe(true);
    expect(columns.rows.some((row) => row.name === 'syllabus')).toBe(false);
    expect(columns.rows.some((row) => row.name === 'provenance_json')).toBe(false);
    const versionColumns = await connection.client.execute({ sql: 'PRAGMA table_info(jurisprudence_document_versions)', args: [] });
    expect(versionColumns.rows.some((row) => row.name === 'source_manifest_id')).toBe(true);
    expect(versionColumns.rows.some((row) => row.name === 'publication_status')).toBe(true);
    const fullTextIndex = await connection.client.execute({
      sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jurisprudence_documents_fts'",
      args: [],
    });
    expect(fullTextIndex.rows).toHaveLength(1);
  });

  it.skipIf(!hasLocalPostgres)('exerce idempotência em PostgreSQL local quando explicitamente habilitado', async () => {
    const connection = await createDatabase({ url: localPostgresUrl! });
    clients.push(connection.client);
    await runPersistenceMigrations(connection.client);
    await runPersistenceMigrations(connection.client);

    const result = await connection.client.execute({
      sql: "SELECT COUNT(*) AS count FROM forgelex_migrations WHERE id = ?",
      args: ['persistence-0016-native-jurisprudence-full-text'],
    });
    expect(Number(result.rows[0]?.count)).toBe(1);
    const compactSearch = await connection.client.execute({
      sql: "SELECT to_regclass('public.jurisprudence_document_terms') AS relation",
      args: [],
    });
    expect(compactSearch.rows[0]?.relation).toBeNull();
    const fullTextIndex = await connection.client.execute({
      sql: "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'jurisprudence_documents_search_fts_idx'",
      args: [],
    });
    expect(fullTextIndex.rows).toHaveLength(1);
  });
});
