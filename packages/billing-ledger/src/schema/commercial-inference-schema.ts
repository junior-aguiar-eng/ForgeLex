import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Only financial metadata: no prompts, legal content, provider credentials or result text.
export const commercialExecutions = sqliteTable(
  'commercial_executions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    accountId: text('account_id').notNull(),
    executionId: text('execution_id').notNull().unique(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull(),
    payloadJson: text('payload_json').notNull(),
  },
  (table) => ({
    ownerKey: uniqueIndex('commercial_executions_owner_key_idx').on(table.tenantId, table.userId, table.idempotencyKey),
    accountStatus: index('commercial_executions_account_status_idx').on(table.accountId, table.status),
  }),
);

export const commercialCalls = sqliteTable(
  'commercial_calls',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    executionId: text('execution_id').notNull(),
    callId: text('call_id').notNull(),
    status: text('status').notNull(),
    payloadJson: text('payload_json').notNull(),
  },
  (table) => ({
    executionCall: uniqueIndex('commercial_calls_execution_call_idx').on(table.executionId, table.callId),
    tenantStatus: index('commercial_calls_tenant_status_idx').on(table.tenantId, table.status),
  }),
);
