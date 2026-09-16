import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const ledgerAccounts = sqliteTable('ledger_accounts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().unique(),
  paidBalanceCents: integer('paid_balance_cents').notNull().default(0),
  promotionalBalanceCents: integer('promotional_balance_cents').notNull().default(0),
  promoExpiresAt: text('promo_expires_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const ledgerEntries = sqliteTable('ledger_entries', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  kind: text('kind').notNull(), // 'CREDIT' | 'DEBIT' | 'ADJUSTMENT' | 'EXPIRATION'
  bucket: text('bucket').notNull(), // 'PAID' | 'PROMOTIONAL'
  amountCents: integer('amount_cents').notNull(),
  operationResultSnapshot: text('operation_result_snapshot'),
  createdAt: text('created_at').notNull(),
});
