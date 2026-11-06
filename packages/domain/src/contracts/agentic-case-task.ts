import { z } from 'zod';
import { LegalAnswerSchema } from './agentic-workspace.js';
import { TaskEvidenceMatrixSchema } from './task-evidence.js';
import { ApprovedItemSnapshotSchema } from './approved-case-context.js';
const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(16000);
export const AgenticTaskActionSchema = z.enum([
  'analyze_documents',
  'research_question',
  'create_document',
  'review_text',
  'analyze_evidence',
]);
export const TaskSourceSchema = z.strictObject({
  id,
  kind: z.enum([
    'USER_TEXT',
    'DOCUMENT',
    'DRAFT',
    'ANSWER',
    'AUTHORITY',
    'NORM',
    'PREVIOUS_DELIVERY',
    'CASE_FACT',
    'CASE_EVIDENCE',
  ]),
  text: z.string().min(1).max(64000),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  documentId: id.optional(),
  versionId: id.optional(),
  url: z.url().optional(),
  extent: z.enum(['SELECTED_TEXT', 'SYLLABUS', 'PROVISION', 'EXCERPT']).optional(),
  identityStatus: z.string().max(100).optional(),
  approvedItem: ApprovedItemSnapshotSchema.optional(),
});
export type TaskSource = z.infer<typeof TaskSourceSchema>;
export const TaskFindingSchema = z.strictObject({
  id,
  code: id,
  severity: z.enum(['WARNING', 'BLOCKING']),
  statement: text,
  sourceIds: z.array(id).max(100),
});
export const TaskIssueSchema = z.strictObject({ id, statement: text, sourceIds: z.array(id).max(100) });
export const TaskClaimSchema = z.strictObject({
  id,
  classification: z.enum(['ALLEGATION', 'INFERENCE', 'CONFLICT', 'DOCUMENT_RECORD']),
  statement: text,
  sourceIds: z.array(id).max(100),
});
export const TaskRequirementSchema = z.strictObject({
  id,
  kind: z.enum(['EDITORIAL', 'PROCEDURAL']).optional(),
  statement: text,
  sourceIds: z.array(id).max(100),
  verified: z.boolean(),
});
export const TaskDocumentSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  documentType: z.string().trim().min(1).max(200),
  sections: z
    .array(z.strictObject({ title: id, content: text, sourceIds: z.array(id).max(100) }))
    .min(1)
    .max(30),
});
/** Server-produced record: literal matching and a model assessment are not legal validation. */
export const TaskSupportAuditSchema = z.strictObject({
  claimId: id,
  sourceId: id,
  sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  quote: z.string().min(1).max(4000).optional(),
  quoteStatus: z.enum(['MATCHED', 'MISMATCH', 'MISSING', 'CONFLICTING']),
  modelAssessment: z.enum(['SUPPORTED', 'PARTIAL', 'NONE', 'UNDETERMINED', 'NOT_ASSESSED']),
});
export type TaskSupportAudit = z.infer<typeof TaskSupportAuditSchema>;
export const TaskDocumentAssessmentSchema = z.strictObject({
  sourceId: id,
  aspects: z
    .array(
      z.strictObject({
        aspect: z.enum(['PARTIES', 'CAUSE', 'DUE_DATE', 'CREDIT_LINK']),
        status: z.enum(['PRESENT', 'NOT_PROVIDED', 'AMBIGUOUS', 'NOT_APPLICABLE']),
        quote: text.optional(),
      }),
    )
    .length(4),
  conclusion: text,
});
export const TaskEquivalenceSchema = z.strictObject({
  kind: z.enum(['claim', 'requirement', 'finding']),
  retainedId: id,
  memberIds: z.array(id).min(2).max(100),
});
export const TaskReviewMetadataSchema = z.strictObject({
  equivalences: z.array(TaskEquivalenceSchema).max(100).optional(),
  documentAssessments: z.array(TaskDocumentAssessmentSchema).max(100).optional(),
  integritySignals: z
    .array(
      z.strictObject({
        sourceId: id,
        quote: text,
        kind: z.enum(['EMBEDDED_INSTRUCTION', 'ADVERSE_TO_REPRESENTED_PARTY']),
      }),
    )
    .max(100)
    .optional(),
});
export const TaskReviewedDeliverySchema = z.strictObject({
  version: z.literal(1),
  questions: z.array(z.strictObject({ prompt: text, reason: text, sourceIds: z.array(id).max(100) })).max(100),
  documentAssessments: z.array(TaskDocumentAssessmentSchema).max(100),
  integrityAlerts: z
    .array(
      z.strictObject({
        kind: z.enum(['EMBEDDED_INSTRUCTION', 'DERIVED_TEXT_REVIEW', 'ADVERSE_TO_REPRESENTED_PARTY']),
        statement: text,
        sourceIds: z.array(id).max(100),
      }),
    )
    .max(200),
  provenance: z
    .array(z.strictObject({ kind: z.enum(['claim', 'requirement', 'finding']), id, originIds: z.array(id).max(200) }))
    .max(400),
  technicalFindings: z.array(TaskFindingSchema).max(200),
  original: z.strictObject({
    claims: z.array(TaskClaimSchema).max(100),
    requirements: z.array(TaskRequirementSchema).max(100),
    findings: z.array(TaskFindingSchema).max(200),
  }),
});
export const AgenticTaskDeliverySchema = z.strictObject({
  action: AgenticTaskActionSchema,
  contextId: id,
  contextRevision: z.number().int().positive(),
  status: z.enum(['CANDIDATE', 'LIMITED']),
  humanReviewRequired: z.literal(true),
  legalAssessment: z.literal('NOT_EVALUATED').default('NOT_EVALUATED'),
  issues: z.array(TaskIssueSchema).max(100),
  claims: z.array(TaskClaimSchema).max(100),
  requirements: z.array(TaskRequirementSchema).max(100),
  findings: z.array(TaskFindingSchema).max(200),
  sources: z.array(TaskSourceSchema.omit({ text: true })).max(100),
  // Optional for reading historical deliveries without rewriting their content/hash.
  supportAudit: z.array(TaskSupportAuditSchema).max(10000).optional(),
  evidenceMatrix: TaskEvidenceMatrixSchema.optional(),
  document: TaskDocumentSchema.optional(),
  // Server-bound edit target; omitted for new pieces and read-only reviews.
  replacesVersionId: id.optional(),
  review: TaskReviewedDeliverySchema.optional(),
});
export type AgenticTaskDelivery = z.infer<typeof AgenticTaskDeliverySchema>;
export interface TaskBinding {
  tenantId: string;
  userId: string;
  executionId: string;
  conversationId: string;
  contextRevision: number;
  objective: string;
  actionId?: z.infer<typeof AgenticTaskActionSchema>;
  matterId?: string;
  previousDeliveryIds?: string[];
}
export const NativeTaskPacketSchema = z.strictObject({
  contextId: id,
  contextRevision: z.number().int().positive(),
  sources: z.array(TaskSourceSchema).max(100),
  answers: z.array(LegalAnswerSchema).max(1000),
});
export type NativeTaskPacket = z.infer<typeof NativeTaskPacketSchema>;
export interface NativeTaskContextPort {
  load(binding: TaskBinding): Promise<NativeTaskPacket>;
  assert(binding: TaskBinding): Promise<void>;
  save(
    binding: TaskBinding,
    delivery: AgenticTaskDelivery,
  ): Promise<{ id: string; draftId?: string; versionId?: string }>;
}
