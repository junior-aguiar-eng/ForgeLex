import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const billingOperations = sqliteTable('billing_operations', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  accountId: text('account_id').notNull().references(() => ledgerAccounts.id),
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull(),
  reservedAmountCents: integer('reserved_amount_cents').notNull(),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: text('lease_expires_at'),
  resultSnapshot: text('result_snapshot'),
  errorCode: text('error_code'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => ({
  tenantKeyUnique: uniqueIndex('billing_operations_tenant_key_unique').on(table.tenantId, table.idempotencyKey),
  accountStatusIndex: index('billing_operations_account_status_idx').on(table.accountId, table.status),
}));
