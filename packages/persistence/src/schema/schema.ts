import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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

export const matters = sqliteTable('matters', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  clientId: text('client_id'),
  title: text('title').notNull(),
  description: text('description'),
  practiceArea: text('practice_area'),
  jurisdiction: text('jurisdiction'),
  status: text('status').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const legalDocuments = sqliteTable('legal_documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  matterId: text('matter_id')
    .notNull()
    .references(() => matters.id),
  title: text('title').notNull(),
  originalFilename: text('original_filename').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  contentHash: text('content_hash').notNull(),
  status: text('status').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const documentVersions = sqliteTable('document_versions', {
  id: text('id').primaryKey(),
  documentId: text('document_id')
    .notNull()
    .references(() => legalDocuments.id),
  versionNumber: integer('version_number').notNull(),
  contentHash: text('content_hash').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
});

export const documentAnchors = sqliteTable('document_anchors', {
  id: text('id').primaryKey(),
  documentVersionId: text('document_version_id')
    .notNull()
    .references(() => documentVersions.id),
  anchorKey: text('anchor_key').notNull(),
  anchorType: text('anchor_type').notNull(),
  ordinal: integer('ordinal').notNull(),
  startOffset: integer('start_offset').notNull(),
  endOffset: integer('end_offset').notNull(),
  text: text('text').notNull(),
  contentHash: text('content_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const facts = sqliteTable(
  'facts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id')
      .notNull()
      .references(() => matters.id),
    statement: text('statement').notNull(),
    category: text('category').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('facts_tenant_matter_idx').on(table.tenantId, table.matterId, table.createdAt)],
);

export const factSourceLinks = sqliteTable(
  'fact_source_links',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id')
      .notNull()
      .references(() => matters.id),
    factId: text('fact_id')
      .notNull()
      .references(() => facts.id),
    documentAnchorId: text('document_anchor_id')
      .notNull()
      .references(() => documentAnchors.id),
    relation: text('relation').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('fact_source_links_unique_idx').on(table.factId, table.documentAnchorId, table.relation),
    index('fact_source_links_tenant_matter_idx').on(table.tenantId, table.matterId),
  ],
);

export const evidenceItems = sqliteTable(
  'evidence_items',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id')
      .notNull()
      .references(() => matters.id),
    title: text('title').notNull(),
    description: text('description'),
    evidenceType: text('evidence_type').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('evidence_items_tenant_matter_idx').on(table.tenantId, table.matterId, table.createdAt)],
);

export const evidenceSourceLinks = sqliteTable(
  'evidence_source_links',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id')
      .notNull()
      .references(() => matters.id),
    evidenceItemId: text('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
    documentAnchorId: text('document_anchor_id')
      .notNull()
      .references(() => documentAnchors.id),
    relation: text('relation').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('evidence_source_links_unique_idx').on(table.evidenceItemId, table.documentAnchorId, table.relation),
    index('evidence_source_links_tenant_matter_idx').on(table.tenantId, table.matterId),
  ],
);

export const evidenceLinks = sqliteTable(
  'evidence_links',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id')
      .notNull()
      .references(() => matters.id),
    factId: text('fact_id')
      .notNull()
      .references(() => facts.id),
    evidenceItemId: text('evidence_item_id')
      .notNull()
      .references(() => evidenceItems.id),
    relation: text('relation').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('evidence_links_unique_idx').on(table.factId, table.evidenceItemId, table.relation),
    index('evidence_links_tenant_matter_idx').on(table.tenantId, table.matterId),
  ],
);

export const timelineEvents = sqliteTable(
  'timeline_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id')
      .notNull()
      .references(() => matters.id),
    title: text('title').notNull(),
    eventDate: text('event_date').notNull(),
    description: text('description'),
    sourceAnchorId: text('source_anchor_id').references(() => documentAnchors.id),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('timeline_events_tenant_matter_date_idx').on(table.tenantId, table.matterId, table.eventDate)],
);
