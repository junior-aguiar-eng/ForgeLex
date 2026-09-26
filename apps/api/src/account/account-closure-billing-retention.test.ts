import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations, type Client } from '@forgelex/persistence';
import { runLedgerMigrations } from '@forgelex/billing-ledger';
import { AccountClosureBillingRetention } from './account-closure-billing-retention.js';

const now = '2026-09-22T12:00:00.000Z';

describe('AccountClosureBillingRetention', () => {
  let client: Client;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-closure-billing-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    client = connection.client;
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    await seedFinancialRows(client);
  });

  afterEach(() => {
    client.close();
    try {
      rmSync(databasePath, { force: true });
    } catch {
      /* SQLite pode liberar depois do worker. */
    }
  });

  it('mantém valores e referências fiscais sem conteúdo jurídico ou identificador direto', async () => {
    const retention = new AccountClosureBillingRetention(client);

    await retention.minimize({
      tenantId: 'tenant_original',
      userId: 'user_original',
      tenantPseudonym: 'tenant_closed_1',
      userPseudonym: 'user_closed_1',
    });

    expect(await row(client, 'SELECT amount_cents, operation_result_snapshot FROM ledger_entries')).toMatchObject({
      amount_cents: -20,
      operation_result_snapshot: null,
    });
    expect(await row(client, 'SELECT tenant_id, user_id, session_id, model FROM usage_events')).toMatchObject({
      tenant_id: 'tenant_closed_1',
      user_id: null,
      session_id: null,
      model: null,
    });
    expect(
      await row(client, 'SELECT tenant_id, user_id, checkout_url, receipt_url FROM billing_purchases'),
    ).toMatchObject({ tenant_id: 'tenant_closed_1', user_id: 'user_closed_1', checkout_url: null, receipt_url: null });
    expect(await row(client, 'SELECT tenant_id, payload, error_message FROM billing_webhook_events')).toMatchObject({
      tenant_id: 'tenant_closed_1',
      payload: '{}',
      error_message: null,
    });
    expect(await count(client, 'SELECT COUNT(*) AS count FROM billing_payment_methods')).toBe(0);

    const retained = await client.batch(
      [
        'SELECT * FROM ledger_entries',
        'SELECT * FROM usage_events',
        'SELECT * FROM billing_purchases',
        'SELECT * FROM billing_refund_requests',
        'SELECT * FROM billing_operations',
        'SELECT * FROM billing_webhook_events',
      ],
      'read',
    );
    expect(JSON.stringify(retained.map((result) => result.rows))).not.toContain('consulta sigilosa');
    expect(JSON.stringify(retained.map((result) => result.rows))).not.toContain('tenant_original');
    expect(JSON.stringify(retained.map((result) => result.rows))).not.toContain('user_original');
  });
});

async function row(client: Client, sql: string): Promise<Record<string, unknown>> {
  const result = await client.execute(sql);
  return result.rows[0] as Record<string, unknown>;
}

async function count(client: Client, sql: string): Promise<number> {
  return Number((await row(client, sql)).count);
}

async function seedFinancialRows(client: Client): Promise<void> {
  await client.batch(
    [
      {
        sql: `INSERT INTO ledger_accounts (id, tenant_id, paid_balance_cents, promotional_balance_cents, created_at, updated_at) VALUES ('account_1', 'tenant_original', 100, 0, ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO usage_events (id, tenant_id, user_id, capability, model, units, request_id, session_id, occurred_at) VALUES ('usage_1', 'tenant_original', 'user_original', 'research.search_case_law', 'model-secret', 1, 'request_1', 'session_secret', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO ledger_entries (id, account_id, usage_event_id, idempotency_key, kind, bucket, amount_cents, operation_result_snapshot, created_at) VALUES ('entry_1', 'account_1', 'usage_1', 'idem_1', 'DEBIT', 'PAID', -20, '{"query":"consulta sigilosa"}', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_accounts (id, tenant_id, provider_customer_id, auto_recharge_enabled, default_payment_method_id, created_at, updated_at) VALUES ('billing_account_1', 'tenant_original', 'customer_direct', 1, 'method_1', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_purchases (id, tenant_id, user_id, package_id, idempotency_key, amount_cents, currency, status, checkout_url, receipt_url, created_at, updated_at) VALUES ('purchase_1', 'tenant_original', 'user_original', 'credits_25', 'purchase_idem', 2500, 'brl', 'PAID', 'https://checkout.invalid/secret', 'https://receipt.invalid/secret', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_payments (id, tenant_id, purchase_id, provider, provider_payment_id, amount_cents, currency, status, created_at, updated_at) VALUES ('payment_1', 'tenant_original', 'purchase_1', 'provider', 'provider_payment_1', 2500, 'brl', 'SUCCEEDED', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_webhook_events (id, provider, event_type, tenant_id, payload, status, received_at, error_message) VALUES ('webhook_1', 'provider', 'payment', 'tenant_original', '{"query":"consulta sigilosa"}', 'PROCESSED', ?, 'conteúdo interno')`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_payment_methods (id, tenant_id, provider, provider_payment_method_id, type, created_at) VALUES ('method_1', 'tenant_original', 'provider', 'provider_method_1', 'card', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_invoices (id, tenant_id, purchase_id, number, status, amount_cents, currency, receipt_url, issued_at) VALUES ('invoice_1', 'tenant_original', 'purchase_1', 'INV-1', 'PAID', 2500, 'brl', 'https://receipt.invalid/secret', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_refund_requests (id, tenant_id, purchase_id, requested_by, status, eligible_amount_cents, reason, reviewed_by, created_at, updated_at) VALUES ('refund_1', 'tenant_original', 'purchase_1', 'user_original', 'APPROVED', 100, 'consulta sigilosa', 'reviewer_direct', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_credit_lots (id, tenant_id, purchase_id, account_id, granted_cents, remaining_cents, created_at, updated_at) VALUES ('lot_1', 'tenant_original', 'purchase_1', 'account_1', 2500, 100, ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_operations (id, tenant_id, account_id, idempotency_key, status, reserved_amount_cents, lease_owner, lease_expires_at, result_snapshot, error_code, created_at, updated_at) VALUES ('operation_1', 'tenant_original', 'account_1', 'operation_idem', 'COMPLETED', 20, 'worker_direct', ?, '{"query":"consulta sigilosa"}', NULL, ?, ?)`,
        args: [now, now, now],
      },
    ],
    'write',
  );
}
