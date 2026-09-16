import { createClient, Client } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema/schema.js';

export interface DatabaseConfig {
  url?: string;
  authToken?: string;
}

export type ForgeLexDatabase = LibSQLDatabase<typeof schema>;

export async function createDatabase(config: DatabaseConfig = {}): Promise<{
  db: ForgeLexDatabase;
  client: Client;
}> {
  const url = config.url ?? 'file::memory:?cache=shared';
  const client = createClient({
    url,
    authToken: config.authToken,
  });

  const db = drizzle(client, { schema });

  // Criação automática de tabelas se não existirem (auto-bootstrap)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      matter_id TEXT,
      status TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      tool_name TEXT NOT NULL,
      call_id TEXT NOT NULL,
      approval_token TEXT NOT NULL UNIQUE,
      proposed_action TEXT NOT NULL,
      parameters_summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      requested_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      turn_number INTEGER NOT NULL,
      state_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tool_name TEXT,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      cost_metadata TEXT,
      created_at TEXT NOT NULL
    );
  `);

  return { db, client };
}
