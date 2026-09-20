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
  {
    id: 'billing-ledger-0002-billing-operations',
    statements: [
      `CREATE TABLE IF NOT EXISTS billing_accounts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL UNIQUE,
        stripe_customer_id TEXT UNIQUE,
        auto_recharge_enabled INTEGER NOT NULL DEFAULT 0,
        auto_recharge_threshold_cents INTEGER NOT NULL DEFAULT 500,
        last_recharge_amount_cents INTEGER,
        default_payment_method_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS billing_purchases (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        package_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'brl',
        status TEXT NOT NULL,
        stripe_checkout_session_id TEXT UNIQUE,
        checkout_url TEXT,
        stripe_payment_intent_id TEXT UNIQUE,
        receipt_url TEXT,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS billing_purchases_tenant_created_idx ON billing_purchases(tenant_id, created_at);`,
      `CREATE UNIQUE INDEX IF NOT EXISTS billing_purchases_tenant_idempotency_unique ON billing_purchases(tenant_id, idempotency_key);`,
      `CREATE TABLE IF NOT EXISTS billing_payments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        purchase_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_payment_id TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        payment_method_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider, provider_payment_id)
      );`,
      `CREATE INDEX IF NOT EXISTS billing_payments_tenant_created_idx ON billing_payments(tenant_id, created_at);`,
      `CREATE TABLE IF NOT EXISTS billing_webhook_events (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        received_at TEXT NOT NULL,
        processed_at TEXT,
        error_message TEXT,
        UNIQUE(provider, id)
      );`,
      `CREATE TABLE IF NOT EXISTS billing_payment_methods (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_payment_method_id TEXT NOT NULL,
        type TEXT NOT NULL,
        brand TEXT,
        last4 TEXT,
        exp_month INTEGER,
        exp_year INTEGER,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        UNIQUE(provider, provider_payment_method_id)
      );`,
      `CREATE INDEX IF NOT EXISTS billing_payment_methods_tenant_idx ON billing_payment_methods(tenant_id);`,
      `CREATE TABLE IF NOT EXISTS billing_invoices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        purchase_id TEXT NOT NULL UNIQUE,
        number TEXT NOT NULL,
        status TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        receipt_url TEXT,
        issued_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS billing_invoices_tenant_issued_idx ON billing_invoices(tenant_id, issued_at);`,
      `CREATE TABLE IF NOT EXISTS billing_refund_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        purchase_id TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        status TEXT NOT NULL,
        eligible_amount_cents INTEGER NOT NULL,
        approved_amount_cents INTEGER,
        reason TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS billing_refund_requests_tenant_created_idx ON billing_refund_requests(tenant_id, created_at);`,
      `CREATE TABLE IF NOT EXISTS billing_credit_lots (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        purchase_id TEXT NOT NULL UNIQUE,
        account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
        granted_cents INTEGER NOT NULL,
        remaining_cents INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS billing_credit_lots_tenant_created_idx ON billing_credit_lots(tenant_id, created_at);`,
    ],
  },
  {
    id: 'billing-ledger-0003-auto-recharge-state',
    statements: [
      `ALTER TABLE billing_accounts ADD COLUMN auto_recharge_armed INTEGER NOT NULL DEFAULT 1;`,
    ],
  },
  {
    id: 'billing-ledger-0004-provider-neutral-identifiers',
    statements: [
      `ALTER TABLE billing_accounts RENAME COLUMN stripe_customer_id TO provider_customer_id;`,
      `ALTER TABLE billing_purchases RENAME COLUMN stripe_checkout_session_id TO provider_checkout_id;`,
      `ALTER TABLE billing_purchases RENAME COLUMN stripe_payment_intent_id TO provider_payment_id;`,
    ],
  },
];

export async function runLedgerMigrations(client: Client): Promise<void> {
  await runMigrations(client, ledgerMigrations);
}
