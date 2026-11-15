import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@forgelex/persistence';
import { ledgerMigrations } from './migrations/ledger-migrations.js';

// createDatabase() defaults to a shared in-memory database; each test needs its own migration journal.
const isolatedDatabase = () =>
  createDatabase({ url: `file:${join(mkdtempSync(join(tmpdir(), 'refund-migration-')), 'db.sqlite')}` });

const insertLegacyRequest = (id: string, tenant: string, purchase: string) =>
  `INSERT INTO billing_refund_requests (id, tenant_id, purchase_id, requested_by, status, open_key, eligible_amount_cents, created_at, updated_at) VALUES ('${id}', '${tenant}', '${purchase}', 'user', 'PENDING', '${purchase}', 2500, 'now', 'now')`;

describe('refund recovery migration', () => {
  it('keeps unreviewed historical requests in the normal review queue', async () => {
    const { client } = await isolatedDatabase();
    try {
      await runMigrations(client, ledgerMigrations.slice(0, -1));
      await client.execute(insertLegacyRequest('waiting', 'tenant', 'purchase'));
      await runMigrations(client, ledgerMigrations);
      const rows = await client.execute("SELECT * FROM billing_refund_requests WHERE id = 'waiting'");
      expect(rows.rows[0]).toMatchObject({
        status: 'PENDING',
        operation_state: 'UNPREPARED',
        open_key: 'purchase',
        approved_amount_cents: null,
      });
    } finally {
      client.close();
    }
  });

  it('quarantines only historical requests whose provider or ledger effect left a local trace, without inventing a debit', async () => {
    const { client } = await isolatedDatabase();
    try {
      await runMigrations(client, ledgerMigrations.slice(0, -1));
      await client.execute(
        "INSERT INTO ledger_accounts (id, tenant_id, created_at, updated_at) VALUES ('acct', 'tenant', 'now', 'now')",
      );
      await client.execute(
        "INSERT INTO ledger_entries (id, account_id, idempotency_key, kind, bucket, amount_cents, created_at) VALUES ('entry', 'acct', 'refund-ledger:ledgered', 'REFUND', 'PAID', 2500, 'now')",
      );
      await client.execute(insertLegacyRequest('ledgered', 'tenant', 'purchase_a'));
      await client.execute(
        "INSERT INTO billing_payments (id, tenant_id, purchase_id, provider, provider_payment_id, amount_cents, currency, status, created_at, updated_at) VALUES ('pay', 'tenant', 'purchase_b', 'mercadopago', 'order_b', 2500, 'brl', 'REFUNDED', 'now', 'now')",
      );
      await client.execute(insertLegacyRequest('payment_refunded', 'tenant', 'purchase_b'));
      await client.execute(insertLegacyRequest('other_tenant_same_id_shape', 'tenant_two', 'purchase_c'));
      await runMigrations(client, ledgerMigrations);
      await runMigrations(client, ledgerMigrations);
      const rows = await client.execute(
        'SELECT id, status, operation_state, open_key, approved_amount_cents FROM billing_refund_requests ORDER BY id',
      );
      const byId = Object.fromEntries(rows.rows.map((row) => [String(row.id), row]));
      expect(byId.ledgered).toMatchObject({
        status: 'RECONCILIATION_REQUIRED',
        operation_state: 'LEGACY_RECONCILIATION_REQUIRED',
        open_key: 'purchase_a',
        approved_amount_cents: null,
      });
      expect(byId.payment_refunded).toMatchObject({
        status: 'RECONCILIATION_REQUIRED',
        operation_state: 'LEGACY_RECONCILIATION_REQUIRED',
        open_key: 'purchase_b',
      });
      expect(byId.other_tenant_same_id_shape).toMatchObject({ status: 'PENDING', operation_state: 'UNPREPARED' });
      expect((await client.execute('SELECT * FROM ledger_entries')).rows).toHaveLength(1);
    } finally {
      client.close();
    }
  });
});
