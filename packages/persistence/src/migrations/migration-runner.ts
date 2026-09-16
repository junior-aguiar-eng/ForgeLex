import type { Client } from '@libsql/client';

export interface SqlMigration {
  id: string;
  statements: readonly string[];
}

const migrationTableStatement = `
  CREATE TABLE IF NOT EXISTS forgelex_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`;

export async function runMigrations(client: Client, migrations: readonly SqlMigration[]): Promise<void> {
  await client.execute(migrationTableStatement);

  for (const migration of migrations) {
    const applied = await client.execute({
      sql: 'SELECT id FROM forgelex_migrations WHERE id = ?',
      args: [migration.id],
    });

    if (applied.rows.length > 0) {
      continue;
    }

    const transaction = await client.transaction();
    try {
      for (const statement of migration.statements) {
        await transaction.execute(statement);
      }

      await transaction.execute({
        sql: 'INSERT INTO forgelex_migrations (id, applied_at) VALUES (?, ?)',
        args: [migration.id, new Date().toISOString()],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export const persistenceMigrations: readonly SqlMigration[] = [
  {
    id: 'persistence-0001-initial',
    statements: [
      `
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
      `,
      `
        CREATE TABLE IF NOT EXISTS session_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          metadata TEXT,
          created_at TEXT NOT NULL
        );
      `,
      `
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
      `,
      `
        CREATE TABLE IF NOT EXISTS checkpoints (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          turn_number INTEGER NOT NULL,
          state_snapshot TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
      `
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
      `,
    ],
  },
];

export async function runPersistenceMigrations(client: Client): Promise<void> {
  await runMigrations(client, persistenceMigrations);
}
