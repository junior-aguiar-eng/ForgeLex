import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const forgelexUserProfiles = sqliteTable(
  'forgelex_user_profiles',
  {
    id: text('id').primaryKey(),
    supabaseUserId: text('supabase_user_id').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deactivatedAt: text('deactivated_at'),
  },
  (table) => [uniqueIndex('forgelex_user_profiles_supabase_id_idx').on(table.supabaseUserId)],
);

export const forgelexTenants = sqliteTable(
  'forgelex_tenants',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deactivatedAt: text('deactivated_at'),
  },
  (table) => [index('forgelex_tenants_status_idx').on(table.status)],
);

export const forgelexTenantMemberships = sqliteTable(
  'forgelex_tenant_memberships',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => forgelexTenants.id),
    userId: text('user_id')
      .notNull()
      .references(() => forgelexUserProfiles.id),
    role: text('role').notNull().default('OWNER'),
    status: text('status').notNull().default('ACTIVE'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    revokedAt: text('revoked_at'),
  },
  (table) => [
    uniqueIndex('forgelex_tenant_memberships_tenant_user_idx').on(table.tenantId, table.userId),
    index('forgelex_tenant_memberships_user_status_idx').on(table.userId, table.status),
  ],
);

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

export const drafts = sqliteTable(
  'drafts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    title: text('title').notNull(),
    status: text('status').notNull(),
    currentVersionId: text('current_version_id'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('drafts_tenant_matter_updated_idx').on(table.tenantId, table.matterId, table.updatedAt)],
);

export const draftVersions = sqliteTable(
  'draft_versions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    draftId: text('draft_id').notNull().references(() => drafts.id),
    versionNumber: integer('version_number').notNull(),
    source: text('source').notNull(),
    contentHash: text('content_hash').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('draft_versions_draft_number_idx').on(table.draftId, table.versionNumber),
    index('draft_versions_tenant_matter_idx').on(table.tenantId, table.matterId, table.createdAt),
  ],
);

export const draftSections = sqliteTable(
  'draft_sections',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    draftId: text('draft_id').notNull().references(() => drafts.id),
    draftVersionId: text('draft_version_id').notNull().references(() => draftVersions.id),
    ordinal: integer('ordinal').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    linkedFactIds: text('linked_fact_ids').notNull(),
    linkedEvidenceIds: text('linked_evidence_ids').notNull(),
    linkedAuthorityIds: text('linked_authority_ids').notNull(),
    linkedThesisIds: text('linked_thesis_ids').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('draft_sections_version_ordinal_idx').on(table.draftVersionId, table.ordinal)],
);

export const citationAnchors = sqliteTable(
  'citation_anchors',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    draftId: text('draft_id').notNull().references(() => drafts.id),
    draftVersionId: text('draft_version_id').notNull().references(() => draftVersions.id),
    sectionId: text('section_id').notNull().references(() => draftSections.id),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    citationText: text('citation_text').notNull(),
    verified: integer('verified', { mode: 'boolean' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('citation_anchors_version_idx').on(table.draftVersionId, table.sectionId)],
);

export const draftReviewFindings = sqliteTable(
  'draft_review_findings',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    draftId: text('draft_id').notNull().references(() => drafts.id),
    draftVersionId: text('draft_version_id').notNull().references(() => draftVersions.id),
    reviewType: text('review_type').notNull(),
    severity: text('severity').notNull(),
    code: text('code').notNull(),
    message: text('message').notNull(),
    sectionId: text('section_id'),
    targetId: text('target_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('draft_review_findings_version_idx').on(table.tenantId, table.draftVersionId, table.severity)],
);

export const draftApprovalRequests = sqliteTable(
  'draft_approval_requests',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    draftId: text('draft_id').notNull().references(() => drafts.id),
    draftVersionId: text('draft_version_id').notNull().references(() => draftVersions.id),
    requestedBy: text('requested_by').notNull(),
    proposedAction: text('proposed_action').notNull(),
    status: text('status').notNull(),
    requestedAt: text('requested_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
    decisionReason: text('decision_reason'),
  },
  (table) => [index('draft_approval_requests_tenant_status_idx').on(table.tenantId, table.status, table.requestedAt)],
);

export const draftApprovalDecisions = sqliteTable(
  'draft_approval_decisions',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull().references(() => draftApprovalRequests.id),
    tenantId: text('tenant_id').notNull(),
    decision: text('decision').notNull(),
    decidedBy: text('decided_by').notNull(),
    reason: text('reason'),
    decidedAt: text('decided_at').notNull(),
  },
  (table) => [index('draft_approval_decisions_request_idx').on(table.tenantId, table.requestId, table.decidedAt)],
);

export const draftApprovalTokens = sqliteTable(
  'draft_approval_tokens',
  {
    id: text('id').primaryKey(),
    requestId: text('request_id').notNull().references(() => draftApprovalRequests.id),
    tenantId: text('tenant_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    issuedAt: text('issued_at').notNull(),
    expiresAt: text('expires_at'),
    usedAt: text('used_at'),
  },
  (table) => [index('draft_approval_tokens_request_idx').on(table.tenantId, table.requestId)],
);

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    subjectId: text('subject_id').notNull(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    roles: text('roles').notNull(),
    scopes: text('scopes').notNull(),
    createdAt: text('created_at').notNull(),
    revokedAt: text('revoked_at'),
  },
  (table) => [
    uniqueIndex('api_keys_token_hash_idx').on(table.tokenHash),
    index('api_keys_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

export const matterAuthorities = sqliteTable(
  'matter_authorities',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    authorityId: text('authority_id').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    authorityJson: text('authority_json').notNull(),
    savedBy: text('saved_by').notNull(),
    savedAt: text('saved_at').notNull(),
  },
  (table) => [
    uniqueIndex('matter_authorities_matter_dedupe_idx').on(table.matterId, table.dedupeKey),
    index('matter_authorities_tenant_matter_saved_idx').on(table.tenantId, table.matterId, table.savedAt),
  ],
);

export const legalIssues = sqliteTable(
  'legal_issues',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    statement: text('statement').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('legal_issues_tenant_matter_updated_idx').on(table.tenantId, table.matterId, table.updatedAt)],
);

export const researchMemos = sqliteTable(
  'research_memos',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    query: text('query').notNull(),
    issueIds: text('issue_ids').notNull(),
    workflowId: text('workflow_id').notNull(),
    workflowVersion: text('workflow_version').notNull(),
    memoJson: text('memo_json').notNull(),
    status: text('status').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: text('reviewed_at'),
    reviewReason: text('review_reason'),
  },
  (table) => [
    uniqueIndex('research_memos_tenant_matter_idempotency_idx').on(table.tenantId, table.matterId, table.idempotencyKey),
    index('research_memos_tenant_matter_updated_idx').on(table.tenantId, table.matterId, table.updatedAt),
  ],
);

export const legalTheses = sqliteTable(
  'legal_theses',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    matterId: text('matter_id').notNull().references(() => matters.id),
    title: text('title').notNull(),
    statement: text('statement').notNull(),
    rationale: text('rationale'),
    issueIds: text('issue_ids').notNull(),
    factIds: text('fact_ids').notNull(),
    evidenceIds: text('evidence_ids').notNull(),
    authorityIds: text('authority_ids').notNull(),
    status: text('status').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('legal_theses_tenant_matter_updated_idx').on(table.tenantId, table.matterId, table.updatedAt)],
);
