import type { Client } from '@libsql/client';

/** Fresh disposable test schema, without the upgrade or its migration ledger entry. */
export async function createDraftSaveTestStorage(client: Client) {
  await client.execute(`CREATE TABLE draft_save_commands (
    tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, command_id TEXT NOT NULL,
    matter_id TEXT NOT NULL REFERENCES matters(id), input_hash TEXT NOT NULL,
    version_id TEXT REFERENCES draft_versions(id) ON DELETE CASCADE,
    receipt_json TEXT, created_at TEXT NOT NULL,
    PRIMARY KEY (tenant_id, user_id, command_id)
  )`);
}
