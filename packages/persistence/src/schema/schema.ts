import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  matterId: text('matter_id'),
  status: text('status').notNull(),
  model: text('model').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const sessionMessages = sqliteTable('session_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata'),
  createdAt: text('created_at').notNull(),
});

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  toolName: text('tool_name').notNull(),
  callId: text('call_id').notNull(),
  approvalToken: text('approval_token').notNull().unique(),
  proposedAction: text('proposed_action').notNull(),
  parametersSummary: text('parameters_summary').notNull(),
  status: text('status').notNull().default('PENDING'),
  requestedAt: text('requested_at').notNull(),
  decidedAt: text('decided_at'),
  decidedBy: text('decided_by'),
});

export const checkpoints = sqliteTable('checkpoints', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  turnNumber: integer('turn_number').notNull(),
  stateSnapshot: text('state_snapshot').notNull(),
  createdAt: text('created_at').notNull(),
});

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  toolName: text('tool_name'),
  durationMs: integer('duration_ms').notNull(),
  status: text('status').notNull(),
  payloadHash: text('payload_hash').notNull(),
  costMetadata: text('cost_metadata'),
  createdAt: text('created_at').notNull(),
});
