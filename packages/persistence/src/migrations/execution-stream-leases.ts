import type { SqlMigration } from './migration-runner.js';
export const executionStreamLeasesMigration: SqlMigration = {
  id: 'persistence-0043-execution-stream-leases',
  statements: [
    `CREATE TABLE execution_stream_admission_lock (id INTEGER PRIMARY KEY CHECK (id = 1), value INTEGER NOT NULL);`,
    `INSERT INTO execution_stream_admission_lock (id, value) VALUES (1, 1);`,
    `CREATE TABLE execution_stream_leases (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL,
      execution_id TEXT NOT NULL, expires_at BIGINT NOT NULL
    );`,
    `CREATE INDEX execution_stream_leases_expiry_idx ON execution_stream_leases(expires_at);`,
    `CREATE INDEX execution_stream_leases_user_idx ON execution_stream_leases(user_id);`,
    `CREATE INDEX execution_stream_leases_owner_idx ON execution_stream_leases(tenant_id, user_id, execution_id);`,
  ],
};
