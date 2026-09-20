import type { Client } from '@libsql/client';

export interface SqlMigration {
  id: string;
  statements: readonly string[];
  sqliteStatements?: readonly string[];
  postgresStatements?: readonly string[];
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
      const dialect = (client as Client & { forgelexDialect?: 'sqlite' | 'postgres' }).forgelexDialect ?? 'sqlite';
      const dialectStatements = dialect === 'postgres' ? migration.postgresStatements : migration.sqliteStatements;
      for (const statement of [...migration.statements, ...(dialectStatements ?? [])]) {
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
  {
    id: 'persistence-0004-drafting-review',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS drafts (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          current_version_id TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS drafts_tenant_matter_updated_idx
        ON drafts (tenant_id, matter_id, updated_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS draft_versions (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          draft_id TEXT NOT NULL REFERENCES drafts(id),
          version_number INTEGER NOT NULL,
          source TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          status TEXT NOT NULL,
          created_by TEXT NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (draft_id, version_number)
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS draft_versions_tenant_matter_idx
        ON draft_versions (tenant_id, matter_id, created_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS draft_sections (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          draft_id TEXT NOT NULL REFERENCES drafts(id),
          draft_version_id TEXT NOT NULL REFERENCES draft_versions(id),
          ordinal INTEGER NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          linked_fact_ids TEXT NOT NULL,
          linked_evidence_ids TEXT NOT NULL,
          linked_authority_ids TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS draft_sections_version_ordinal_idx
        ON draft_sections (draft_version_id, ordinal);
      `,
      `
        CREATE TABLE IF NOT EXISTS citation_anchors (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          draft_id TEXT NOT NULL REFERENCES drafts(id),
          draft_version_id TEXT NOT NULL REFERENCES draft_versions(id),
          section_id TEXT NOT NULL REFERENCES draft_sections(id),
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          citation_text TEXT NOT NULL,
          verified INTEGER NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS citation_anchors_version_idx
        ON citation_anchors (draft_version_id, section_id);
      `,
      `
        CREATE TABLE IF NOT EXISTS draft_review_findings (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          draft_id TEXT NOT NULL REFERENCES drafts(id),
          draft_version_id TEXT NOT NULL REFERENCES draft_versions(id),
          review_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          code TEXT NOT NULL,
          message TEXT NOT NULL,
          section_id TEXT,
          target_id TEXT,
          created_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS draft_review_findings_version_idx
        ON draft_review_findings (tenant_id, draft_version_id, severity);
      `,
      `
        CREATE TABLE IF NOT EXISTS draft_approval_requests (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          draft_id TEXT NOT NULL REFERENCES drafts(id),
          draft_version_id TEXT NOT NULL REFERENCES draft_versions(id),
          requested_by TEXT NOT NULL,
          proposed_action TEXT NOT NULL,
          status TEXT NOT NULL,
          requested_at TEXT NOT NULL,
          decided_at TEXT,
          decided_by TEXT,
          decision_reason TEXT
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS draft_approval_requests_tenant_status_idx
        ON draft_approval_requests (tenant_id, status, requested_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS draft_approval_decisions (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES draft_approval_requests(id),
          tenant_id TEXT NOT NULL,
          decision TEXT NOT NULL,
          decided_by TEXT NOT NULL,
          reason TEXT,
          decided_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS draft_approval_decisions_request_idx
        ON draft_approval_decisions (tenant_id, request_id, decided_at DESC);
      `,
      `
        CREATE TABLE IF NOT EXISTS draft_approval_tokens (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL REFERENCES draft_approval_requests(id),
          tenant_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          issued_at TEXT NOT NULL,
          expires_at TEXT,
          used_at TEXT
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS draft_approval_tokens_request_idx
        ON draft_approval_tokens (tenant_id, request_id);
      `,
    ],
  },
  {
    id: 'persistence-0005-api-keys',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          roles TEXT NOT NULL,
          scopes TEXT NOT NULL,
          created_at TEXT NOT NULL,
          revoked_at TEXT
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS api_keys_tenant_created_idx
        ON api_keys (tenant_id, created_at DESC);
      `,
    ],
  },
  {
    id: 'persistence-0006-matter-authorities',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS matter_authorities (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          authority_id TEXT NOT NULL,
          dedupe_key TEXT NOT NULL,
          authority_json TEXT NOT NULL,
          saved_by TEXT NOT NULL,
          saved_at TEXT NOT NULL,
          UNIQUE (matter_id, dedupe_key)
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS matter_authorities_tenant_matter_saved_idx
        ON matter_authorities (tenant_id, matter_id, saved_at DESC);
      `,
    ],
  },
  {
    id: 'persistence-0007-legal-issues',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS legal_issues (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          statement TEXT NOT NULL,
          status TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS legal_issues_tenant_matter_updated_idx
        ON legal_issues (tenant_id, matter_id, updated_at DESC);
      `,
    ],
  },
  {
    id: 'persistence-0008-research-memos',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS research_memos (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          query TEXT NOT NULL,
          issue_ids TEXT NOT NULL,
          workflow_id TEXT NOT NULL,
          workflow_version TEXT NOT NULL,
          memo_json TEXT NOT NULL,
          status TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          reviewed_by TEXT,
          reviewed_at TEXT,
          review_reason TEXT,
          UNIQUE (tenant_id, matter_id, idempotency_key)
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS research_memos_tenant_matter_updated_idx
        ON research_memos (tenant_id, matter_id, updated_at DESC);
      `,
    ],
  },
  {
    id: 'persistence-0009-legal-theses',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS legal_theses (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          title TEXT NOT NULL,
          statement TEXT NOT NULL,
          rationale TEXT,
          issue_ids TEXT NOT NULL,
          fact_ids TEXT NOT NULL,
          evidence_ids TEXT NOT NULL,
          authority_ids TEXT NOT NULL,
          status TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS legal_theses_tenant_matter_updated_idx
        ON legal_theses (tenant_id, matter_id, updated_at DESC);
      `,
    ],
  },
  {
    id: 'persistence-0010-draft-thesis-links',
    statements: [
      `
        ALTER TABLE draft_sections
        ADD COLUMN linked_thesis_ids TEXT NOT NULL DEFAULT '[]';
      `,
    ],
  },
  {
    id: 'persistence-0011-webhook-outbox',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS webhook_endpoints (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          url TEXT NOT NULL,
          description TEXT,
          secret_ciphertext TEXT NOT NULL,
          event_types TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revoked_at TEXT
        );
      `,
      `CREATE INDEX IF NOT EXISTS webhook_endpoints_tenant_status_idx ON webhook_endpoints (tenant_id, status);`,
      `
        CREATE TABLE IF NOT EXISTS webhook_events (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
      `CREATE INDEX IF NOT EXISTS webhook_events_tenant_created_idx ON webhook_events (tenant_id, created_at);`,
      `
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES webhook_events(id),
          endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id),
          tenant_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'PENDING',
          attempt_count INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 8,
          next_attempt_at TEXT NOT NULL,
          last_attempt_at TEXT,
          response_status INTEGER,
          response_body_excerpt TEXT,
          last_error TEXT,
          delivered_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE (event_id, endpoint_id)
        );
      `,
      `CREATE INDEX IF NOT EXISTS webhook_deliveries_due_idx ON webhook_deliveries (status, next_attempt_at);`,
      `CREATE INDEX IF NOT EXISTS webhook_deliveries_tenant_idx ON webhook_deliveries (tenant_id, created_at);`,
    ],
  },
  {
    id: 'persistence-0012-account-identity',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS forgelex_user_profiles (
          id TEXT PRIMARY KEY,
          supabase_user_id TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL,
          display_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deactivated_at TEXT
        );
      `,
      `CREATE UNIQUE INDEX IF NOT EXISTS forgelex_user_profiles_supabase_id_idx ON forgelex_user_profiles (supabase_user_id);`,
      `
        CREATE TABLE IF NOT EXISTS forgelex_tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deactivated_at TEXT
        );
      `,
      `CREATE INDEX IF NOT EXISTS forgelex_tenants_status_idx ON forgelex_tenants (status);`,
      `
        CREATE TABLE IF NOT EXISTS forgelex_tenant_memberships (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES forgelex_tenants(id),
          user_id TEXT NOT NULL REFERENCES forgelex_user_profiles(id),
          role TEXT NOT NULL DEFAULT 'OWNER',
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          revoked_at TEXT,
          UNIQUE (tenant_id, user_id)
        );
      `,
      `CREATE INDEX IF NOT EXISTS forgelex_tenant_memberships_user_status_idx ON forgelex_tenant_memberships (user_id, status);`,
    ],
  },
  {
    id: 'persistence-0013-jurisprudence-data-plane',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS jurisprudence_ingestion_runs (
          id TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          court TEXT NOT NULL,
          status TEXT NOT NULL,
          documents_seen INTEGER NOT NULL DEFAULT 0,
          documents_published INTEGER NOT NULL DEFAULT 0,
          coverage_start TEXT,
          coverage_end TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          error TEXT
        );
      `,
      `CREATE INDEX IF NOT EXISTS jurisprudence_ingestion_runs_court_started_idx ON jurisprudence_ingestion_runs (court, started_at);`,
      `CREATE INDEX IF NOT EXISTS jurisprudence_ingestion_runs_status_idx ON jurisprudence_ingestion_runs (status);`,
      `
        CREATE TABLE IF NOT EXISTS jurisprudence_documents (
          id TEXT PRIMARY KEY,
          court TEXT NOT NULL,
          process_number TEXT NOT NULL,
          normalized_process_number TEXT NOT NULL,
          process_class TEXT,
          rapporteur TEXT NOT NULL,
          chamber TEXT,
          judgment_date TEXT NOT NULL,
          publication_date TEXT NOT NULL,
          syllabus TEXT NOT NULL,
          full_text TEXT,
          official_url TEXT,
          provider_id TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          dedupe_key TEXT NOT NULL UNIQUE,
          current_version_id TEXT,
          first_seen_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          provenance_json TEXT NOT NULL,
          ingestion_run_id TEXT NOT NULL REFERENCES jurisprudence_ingestion_runs(id),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `CREATE INDEX IF NOT EXISTS jurisprudence_documents_court_judgment_idx ON jurisprudence_documents (court, judgment_date);`,
      `CREATE INDEX IF NOT EXISTS jurisprudence_documents_process_idx ON jurisprudence_documents (court, normalized_process_number);`,
      `CREATE INDEX IF NOT EXISTS jurisprudence_documents_content_hash_idx ON jurisprudence_documents (content_hash);`,
      `
        CREATE TABLE IF NOT EXISTS jurisprudence_document_versions (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES jurisprudence_documents(id),
          version_number INTEGER NOT NULL,
          process_number TEXT NOT NULL,
          process_class TEXT,
          rapporteur TEXT NOT NULL,
          chamber TEXT,
          judgment_date TEXT NOT NULL,
          publication_date TEXT NOT NULL,
          syllabus TEXT NOT NULL,
          full_text TEXT,
          official_url TEXT,
          provider_id TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          verification_status TEXT NOT NULL,
          provenance_json TEXT NOT NULL,
          ingestion_run_id TEXT NOT NULL REFERENCES jurisprudence_ingestion_runs(id),
          captured_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (document_id, version_number)
        );
      `,
      `CREATE INDEX IF NOT EXISTS jurisprudence_document_versions_document_idx ON jurisprudence_document_versions (document_id, version_number);`,
      `
        CREATE TABLE IF NOT EXISTS jurisprudence_document_terms (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL REFERENCES jurisprudence_documents(id),
          term TEXT NOT NULL,
          field TEXT NOT NULL,
          UNIQUE (document_id, term, field)
        );
      `,
      `CREATE INDEX IF NOT EXISTS jurisprudence_document_terms_term_idx ON jurisprudence_document_terms (term, document_id);`,
    ],
  },
  {
    id: 'persistence-0014-stj-source-manifest',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS jurisprudence_source_manifests (
          id TEXT PRIMARY KEY,
          dataset_id TEXT NOT NULL,
          dataset_title TEXT NOT NULL,
          resource_id TEXT NOT NULL,
          resource_name TEXT NOT NULL,
          resource_url TEXT NOT NULL,
          resource_role TEXT NOT NULL,
          extraction_date TEXT NOT NULL,
          resource_sha256 TEXT NOT NULL,
          status TEXT NOT NULL,
          raw_record_count INTEGER NOT NULL DEFAULT 0,
          accepted_record_count INTEGER NOT NULL DEFAULT 0,
          rejected_record_count INTEGER NOT NULL DEFAULT 0,
          duplicate_record_count INTEGER NOT NULL DEFAULT 0,
          published_record_count INTEGER NOT NULL DEFAULT 0,
          coverage_start TEXT,
          coverage_end TEXT,
          warnings_json TEXT NOT NULL DEFAULT '[]',
          error TEXT,
          ingestion_run_id TEXT REFERENCES jurisprudence_ingestion_runs(id),
          started_at TEXT NOT NULL,
          completed_at TEXT
        );
      `,
      `CREATE INDEX IF NOT EXISTS jurisprudence_source_manifests_resource_hash_idx ON jurisprudence_source_manifests (resource_id, resource_sha256, status);`,
      `CREATE INDEX IF NOT EXISTS jurisprudence_source_manifests_resource_idx ON jurisprudence_source_manifests (resource_id, extraction_date);`,
      `CREATE INDEX IF NOT EXISTS jurisprudence_source_manifests_status_idx ON jurisprudence_source_manifests (status, started_at);`,
      `
        CREATE TABLE IF NOT EXISTS jurisprudence_ingestion_staging (
          id TEXT PRIMARY KEY,
          manifest_id TEXT NOT NULL REFERENCES jurisprudence_source_manifests(id),
          record_ordinal INTEGER NOT NULL,
          source_record_id TEXT NOT NULL,
          dedupe_key TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          document_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (manifest_id, record_ordinal)
        );
      `,
      `CREATE INDEX IF NOT EXISTS jurisprudence_ingestion_staging_manifest_idx ON jurisprudence_ingestion_staging (manifest_id, record_ordinal);`,
    ],
  },
  {
    id: 'persistence-0015-compact-jurisprudence-search',
    statements: [
      `ALTER TABLE jurisprudence_documents ADD COLUMN search_text TEXT NOT NULL DEFAULT '';`,
      `DROP TABLE IF EXISTS jurisprudence_document_terms;`,
    ],
  },
  {
    id: 'persistence-0016-native-jurisprudence-full-text',
    statements: [
      `ALTER TABLE jurisprudence_documents ADD COLUMN search_identity_text TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE jurisprudence_documents ADD COLUMN search_authority_text TEXT NOT NULL DEFAULT '';`,
    ],
    sqliteStatements: [
      `
        CREATE VIRTUAL TABLE jurisprudence_documents_fts USING fts5(
          search_identity_text,
          search_authority_text,
          search_text,
          content='jurisprudence_documents',
          content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 2'
        );
      `,
      `
        CREATE TRIGGER jurisprudence_documents_fts_insert AFTER INSERT ON jurisprudence_documents BEGIN
          INSERT INTO jurisprudence_documents_fts(rowid, search_identity_text, search_authority_text, search_text)
          VALUES (new.rowid, new.search_identity_text, new.search_authority_text, new.search_text);
        END;
      `,
      `
        CREATE TRIGGER jurisprudence_documents_fts_delete AFTER DELETE ON jurisprudence_documents BEGIN
          INSERT INTO jurisprudence_documents_fts(jurisprudence_documents_fts, rowid, search_identity_text, search_authority_text, search_text)
          VALUES ('delete', old.rowid, old.search_identity_text, old.search_authority_text, old.search_text);
        END;
      `,
      `
        CREATE TRIGGER jurisprudence_documents_fts_update AFTER UPDATE ON jurisprudence_documents BEGIN
          INSERT INTO jurisprudence_documents_fts(jurisprudence_documents_fts, rowid, search_identity_text, search_authority_text, search_text)
          VALUES ('delete', old.rowid, old.search_identity_text, old.search_authority_text, old.search_text);
          INSERT INTO jurisprudence_documents_fts(rowid, search_identity_text, search_authority_text, search_text)
          VALUES (new.rowid, new.search_identity_text, new.search_authority_text, new.search_text);
        END;
      `,
      `INSERT INTO jurisprudence_documents_fts(jurisprudence_documents_fts) VALUES ('rebuild');`,
    ],
    postgresStatements: [
      `
        CREATE INDEX jurisprudence_documents_search_fts_idx
        ON jurisprudence_documents USING GIN ((
          setweight(to_tsvector('simple', search_identity_text), 'A') ||
          setweight(to_tsvector('simple', search_authority_text), 'B') ||
          setweight(to_tsvector('simple', search_text), 'C')
        ));
      `,
    ],
  },
  {
    id: 'persistence-0017-canonical-jurisprudence-version',
    statements: [],
    sqliteStatements: [
      `ALTER TABLE jurisprudence_documents ADD COLUMN search_vector TEXT NOT NULL DEFAULT '';`,
      `DROP INDEX IF EXISTS jurisprudence_documents_court_judgment_idx;`,
      `CREATE INDEX IF NOT EXISTS jurisprudence_documents_court_idx ON jurisprudence_documents (court);`,
      `CREATE INDEX IF NOT EXISTS jurisprudence_document_versions_judgment_idx ON jurisprudence_document_versions (judgment_date);`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN process_class;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN rapporteur;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN chamber;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN judgment_date;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN publication_date;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN syllabus;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN full_text;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN official_url;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN provider_id;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN verification_status;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN provenance_json;`,
    ],
    postgresStatements: [
      `ALTER TABLE jurisprudence_documents ADD COLUMN search_vector tsvector NOT NULL DEFAULT ''::tsvector;`,
      `
        UPDATE jurisprudence_documents
        SET search_vector =
          setweight(to_tsvector('simple', search_identity_text), 'A') ||
          setweight(to_tsvector('simple', search_authority_text), 'B') ||
          setweight(to_tsvector('simple', search_text), 'C');
      `,
      `
        CREATE OR REPLACE FUNCTION jurisprudence_documents_search_vector_sync()
        RETURNS trigger AS $$
        BEGIN
          NEW.search_vector :=
            setweight(to_tsvector('simple', NEW.search_identity_text), 'A') ||
            setweight(to_tsvector('simple', NEW.search_authority_text), 'B') ||
            setweight(to_tsvector('simple', NEW.search_text), 'C');
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `,
      `
        CREATE TRIGGER jurisprudence_documents_search_vector_sync_trigger
        BEFORE INSERT OR UPDATE OF search_identity_text, search_authority_text, search_text
        ON jurisprudence_documents
        FOR EACH ROW EXECUTE FUNCTION jurisprudence_documents_search_vector_sync();
      `,
      `DROP INDEX IF EXISTS jurisprudence_documents_search_fts_idx;`,
      `DROP INDEX IF EXISTS jurisprudence_documents_court_judgment_idx;`,
      `CREATE INDEX jurisprudence_documents_court_idx ON jurisprudence_documents (court);`,
      `CREATE INDEX jurisprudence_document_versions_judgment_idx ON jurisprudence_document_versions (judgment_date);`,
      `CREATE INDEX jurisprudence_documents_search_vector_idx ON jurisprudence_documents USING GIN (search_vector);`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN process_class;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN rapporteur;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN chamber;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN judgment_date;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN publication_date;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN syllabus;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN full_text;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN official_url;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN provider_id;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN verification_status;`,
      `ALTER TABLE jurisprudence_documents DROP COLUMN provenance_json;`,
    ],
  },
  {
    id: 'persistence-0018-version-source-manifest-link',
    statements: [
      `ALTER TABLE jurisprudence_document_versions ADD COLUMN source_manifest_id TEXT REFERENCES jurisprudence_source_manifests(id);`,
      `CREATE INDEX jurisprudence_document_versions_manifest_idx ON jurisprudence_document_versions (source_manifest_id);`,
    ],
  },
  {
    id: 'persistence-0019-explicit-version-publication-status',
    statements: [
      `ALTER TABLE jurisprudence_document_versions ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'LEGACY_COMPATIBILITY';`,
    ],
  },
  {
    id: 'persistence-0020-workflow-checkpoints',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS workflow_checkpoints (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          matter_id TEXT REFERENCES matters(id),
          workflow_id TEXT NOT NULL,
          workflow_version TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'INTERNAL',
          idempotency_key TEXT,
          step_id TEXT NOT NULL,
          step_index INTEGER NOT NULL,
          status TEXT NOT NULL,
          state_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
      `CREATE INDEX IF NOT EXISTS workflow_checkpoints_execution_tenant_idx ON workflow_checkpoints (execution_id, tenant_id, created_at);`,
      `CREATE INDEX IF NOT EXISTS workflow_checkpoints_tenant_matter_idx ON workflow_checkpoints (tenant_id, matter_id, created_at);`,
    ],
  },
  {
    id: 'persistence-0021-authority-verification-history',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS matter_authority_verifications (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          matter_id TEXT NOT NULL REFERENCES matters(id),
          saved_authority_id TEXT NOT NULL REFERENCES matter_authorities(id),
          status TEXT NOT NULL,
          checked_at TEXT NOT NULL,
          provider_id TEXT,
          reason TEXT,
          authority_snapshot_json TEXT,
          created_by TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `,
      `CREATE INDEX IF NOT EXISTS matter_authority_verifications_history_idx ON matter_authority_verifications (tenant_id, matter_id, saved_authority_id, created_at);`,
    ],
  },
  {
    id: 'persistence-0022-research-history',
    statements: [
      `CREATE TABLE IF NOT EXISTS research_search_history (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        operation_id TEXT NOT NULL,
        query TEXT NOT NULL,
        court TEXT NOT NULL,
        result_count INTEGER NOT NULL,
        billing_mode TEXT NOT NULL,
        charged_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (tenant_id, operation_id)
      );`,
      `CREATE INDEX IF NOT EXISTS research_history_tenant_user_created_idx ON research_search_history(tenant_id, user_id, created_at);`,
    ],
  },
];

export async function runPersistenceMigrations(client: Client): Promise<void> {
  await runMigrations(client, persistenceMigrations);
}
