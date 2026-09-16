import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const ledgerAccounts = sqliteTable('ledger_accounts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().unique(),
  paidBalanceCents: integer('paid_balance_cents').notNull().default(0),
  promotionalBalanceCents: integer('promotional_balance_cents').notNull().default(0),
  promoExpiresAt: text('promo_expires_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const usageEvents = sqliteTable(
  'usage_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id'),
    capability: text('capability').notNull(),
    toolName: text('tool_name'),
    provider: text('provider'),
    model: text('model'),
    units: integer('units').notNull(),
    legalCredits: integer('legal_credits'),
    monetaryCostCents: integer('monetary_cost_cents'),
    requestId: text('request_id').notNull(),
    sessionId: text('session_id'),
    occurredAt: text('occurred_at').notNull(),
  },
  (table) => ({
    tenantRequestUnique: uniqueIndex('usage_events_tenant_request_unique').on(table.tenantId, table.requestId),
  })
);

export const ledgerEntries = sqliteTable('ledger_entries', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => ledgerAccounts.id),
  usageEventId: text('usage_event_id').references(() => usageEvents.id),
  idempotencyKey: text('idempotency_key').notNull(),
  kind: text('kind').notNull(), // 'CREDIT' | 'DEBIT' | 'ADJUSTMENT' | 'EXPIRATION'
  bucket: text('bucket').notNull(), // 'PAID' | 'PROMOTIONAL'
  amountCents: integer('amount_cents').notNull(),
  operationResultSnapshot: text('operation_result_snapshot'),
  createdAt: text('created_at').notNull(),
}, (table) => ({
  accountIdIdempotencyKeyUnique: uniqueIndex('ledger_entries_account_id_idempotency_key_unique').on(
    table.accountId,
    table.idempotencyKey
  ),
}));
