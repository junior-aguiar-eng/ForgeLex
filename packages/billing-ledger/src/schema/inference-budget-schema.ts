import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const inferenceBudgets = sqliteTable(
  'inference_budgets',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    userId: text('user_id').notNull(),
    executionId: text('execution_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payloadJson: text('payload_json').notNull(),
  },
  (t) => [
    uniqueIndex('inference_budgets_execution_idx').on(t.executionId),
    uniqueIndex('inference_budgets_owner_key_idx').on(t.tenantId, t.userId, t.idempotencyKey),
  ],
);
export const inferenceCalls = sqliteTable(
  'inference_calls',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    executionId: text('execution_id').notNull(),
    callId: text('call_id').notNull(),
    operationKey: text('operation_key').notNull(),
    payloadJson: text('payload_json').notNull(),
  },
  (t) => [
    uniqueIndex('inference_calls_execution_call_idx').on(t.executionId, t.callId),
    uniqueIndex('inference_calls_operation_idx').on(t.tenantId, t.operationKey),
  ],
);
