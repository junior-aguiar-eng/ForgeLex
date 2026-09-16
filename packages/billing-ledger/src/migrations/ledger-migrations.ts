import type { Client } from '@libsql/client';
import { runMigrations, SqlMigration } from '@forgelex/persistence';

export const ledgerMigrations: readonly SqlMigration[] = [
  {
    id: 'billing-ledger-0001-initial',
    statements: [
      `
        CREATE TABLE IF NOT EXISTS ledger_accounts (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL UNIQUE,
          paid_balance_cents INTEGER NOT NULL DEFAULT 0,
          promotional_balance_cents INTEGER NOT NULL DEFAULT 0,
          promo_expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS usage_events (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL,
          user_id TEXT,
          capability TEXT NOT NULL,
          tool_name TEXT,
          provider TEXT,
          model TEXT,
          units INTEGER NOT NULL,
          legal_credits INTEGER,
          monetary_cost_cents INTEGER,
          request_id TEXT NOT NULL,
          session_id TEXT,
          occurred_at TEXT NOT NULL,
          UNIQUE (tenant_id, request_id)
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS ledger_entries (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
          usage_event_id TEXT REFERENCES usage_events(id),
          idempotency_key TEXT NOT NULL,
          kind TEXT NOT NULL,
          bucket TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          operation_result_snapshot TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (account_id, idempotency_key)
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS ledger_entries_account_id_idx
        ON ledger_entries(account_id);
      `,
    ],
  },
];

export async function runLedgerMigrations(client: Client): Promise<void> {
  await runMigrations(client, ledgerMigrations);
}
