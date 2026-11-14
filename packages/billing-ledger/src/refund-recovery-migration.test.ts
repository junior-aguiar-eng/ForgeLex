import { describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@forgelex/persistence';
import { ledgerMigrations } from './migrations/ledger-migrations.js';

describe('refund recovery migration', () => {
  it('quarantines historical pending requests without inventing a debit or clearing their open key', async () => {
    const { client } = await createDatabase();
    try {
      await runMigrations(client, ledgerMigrations.slice(0, -1));
      await client.execute(
        `INSERT INTO billing_refund_requests (id, tenant_id, purchase_id, requested_by, status, open_key, eligible_amount_cents, created_at, updated_at) VALUES ('old', 'tenant', 'purchase', 'user', 'PENDING', 'purchase', 2500, 'now', 'now')`,
      );
      await runMigrations(client, ledgerMigrations);
      await runMigrations(client, ledgerMigrations);
      const rows = await client.execute("SELECT * FROM billing_refund_requests WHERE id = 'old'");
      expect(rows.rows[0]).toMatchObject({
        status: 'RECONCILIATION_REQUIRED',
        operation_state: 'LEGACY_RECONCILIATION_REQUIRED',
        open_key: 'purchase',
        approved_amount_cents: null,
      });
      expect((await client.execute('SELECT * FROM ledger_entries')).rows).toHaveLength(0);
    } finally {
      client.close();
    }
  });
});
