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
  {
    id: 'persistence-0002-matter-foundation',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS matters (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          client_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          practice_area TEXT,
          jurisdiction TEXT,
          status TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS matters_tenant_updated_idx
        ON matters (tenant_id, updated_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS legal_documents (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          title TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          status TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS legal_documents_tenant_matter_idx
        ON legal_documents (tenant_id, matter_id, created_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS document_versions (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES legal_documents(id),
          version_number INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (document_id, version_number)
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS document_anchors (
          id TEXT PRIMARY KEY,
          document_version_id TEXT NOT NULL REFERENCES document_versions(id),
          anchor_key TEXT NOT NULL,
          anchor_type TEXT NOT NULL,
          ordinal INTEGER NOT NULL,
          start_offset INTEGER NOT NULL,
          end_offset INTEGER NOT NULL,
          text TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (document_version_id, anchor_key)
        );
      `,
    ],
  },
  {
    id: 'persistence-0003-facts-evidence',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS facts (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          statement TEXT NOT NULL,
          category TEXT NOT NULL,
          status TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS facts_tenant_matter_idx
        ON facts (tenant_id, matter_id, created_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS fact_source_links (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          fact_id TEXT NOT NULL REFERENCES facts(id),
          document_anchor_id TEXT NOT NULL REFERENCES document_anchors(id),
          relation TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (fact_id, document_anchor_id, relation)
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS fact_source_links_tenant_matter_idx
        ON fact_source_links (tenant_id, matter_id, created_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS evidence_items (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          title TEXT NOT NULL,
          description TEXT,
          evidence_type TEXT NOT NULL,
          status TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS evidence_items_tenant_matter_idx
        ON evidence_items (tenant_id, matter_id, created_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS evidence_source_links (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
          document_anchor_id TEXT NOT NULL REFERENCES document_anchors(id),
          relation TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (evidence_item_id, document_anchor_id, relation)
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS evidence_source_links_tenant_matter_idx
        ON evidence_source_links (tenant_id, matter_id, created_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS evidence_links (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          fact_id TEXT NOT NULL REFERENCES facts(id),
          evidence_item_id TEXT NOT NULL REFERENCES evidence_items(id),
          relation TEXT NOT NULL,
          note TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (fact_id, evidence_item_id, relation)
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS evidence_links_tenant_matter_idx
        ON evidence_links (tenant_id, matter_id, created_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS timeline_events (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          title TEXT NOT NULL,
          event_date TEXT NOT NULL,
          description TEXT,
          source_anchor_id TEXT REFERENCES document_anchors(id),
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS timeline_events_tenant_matter_date_idx
        ON timeline_events (tenant_id, matter_id, event_date ASC);
      `,
    ],
  },
];

export async function runPersistenceMigrations(client: Client): Promise<void> {
  await runMigrations(client, persistenceMigrations);
}
