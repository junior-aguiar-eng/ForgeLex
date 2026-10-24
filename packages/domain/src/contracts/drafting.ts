import { z } from 'zod';

export const DraftStatusSchema = z.enum(['DRAFT', 'IN_REVIEW', 'APPROVAL_PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const DraftVersionSourceSchema = z.enum(['HUMAN', 'WORKFLOW', 'SYSTEM']);
export type DraftVersionSource = z.infer<typeof DraftVersionSourceSchema>;

export const DraftSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  title: z.string().min(3),
  status: DraftStatusSchema,
  currentVersionId: z.string().guid().optional(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Draft = z.infer<typeof DraftSchema>;

export const DraftVersionSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  draftId: z.string().guid(),
  versionNumber: z.number().int().positive(),
  source: DraftVersionSourceSchema,
  contentHash: z.string().length(64),
  status: DraftStatusSchema,
  createdBy: z.string().min(1),
  notes: z.string().max(2000).optional(),
  derivedFromVersionId: z.string().guid().optional(),
  createdAt: z.string().datetime(),
});
export type DraftVersion = z.infer<typeof DraftVersionSchema>;

export const DraftSectionSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  draftId: z.string().guid(),
  draftVersionId: z.string().guid(),
  ordinal: z.number().int().nonnegative(),
  title: z.string().min(1),
  content: z.string(),
  linkedFactIds: z.array(z.string().guid()),
  linkedEvidenceIds: z.array(z.string().guid()),
  linkedAuthorityIds: z.array(z.string().guid()),
  linkedThesisIds: z.array(z.string().guid()),
  createdAt: z.string().datetime(),
});
export type DraftSection = z.infer<typeof DraftSectionSchema>;

export const CitationAnchorTargetSchema = z.enum(['AUTHORITY', 'FACT', 'EVIDENCE']);
export type CitationAnchorTarget = z.infer<typeof CitationAnchorTargetSchema>;

export const CitationAnchorSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  draftId: z.string().guid(),
  draftVersionId: z.string().guid(),
  sectionId: z.string().guid(),
  targetType: CitationAnchorTargetSchema,
  targetId: z.string().guid(),
  citationText: z.string().min(3),
  verified: z.boolean(),
  createdAt: z.string().datetime(),
});
export type CitationAnchor = z.infer<typeof CitationAnchorSchema>;

export const DraftReviewTypeSchema = z.enum(['CITATION', 'FACT_SUPPORT', 'ADVERSARIAL']);
export type DraftReviewType = z.infer<typeof DraftReviewTypeSchema>;

export const DraftReviewSeveritySchema = z.enum(['INFO', 'WARNING', 'BLOCKING']);
export type DraftReviewSeverity = z.infer<typeof DraftReviewSeveritySchema>;

export const DraftReviewFindingSchema = z.object({
  id: z.string().guid(),
  reviewRunId: z.string().guid().optional(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  draftId: z.string().guid(),
  draftVersionId: z.string().guid(),
  reviewType: DraftReviewTypeSchema,
  severity: DraftReviewSeveritySchema,
  code: z.string().min(3),
  message: z.string().min(3),
  sectionId: z.string().guid().optional(),
  targetId: z.string().guid().optional(),
  createdAt: z.string().datetime(),
});
export type DraftReviewFinding = z.infer<typeof DraftReviewFindingSchema>;

export const ApprovalRequestStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export type ApprovalRequestStatus = z.infer<typeof ApprovalRequestStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string().guid(),
  tenantId: z.string().min(1),
  matterId: z.string().guid(),
  draftId: z.string().guid(),
  draftVersionId: z.string().guid(),
  requestedBy: z.string().min(1),
  proposedAction: z.string().min(3),
  status: ApprovalRequestStatusSchema,
  requestedAt: z.string().datetime(),
  decidedAt: z.string().datetime().optional(),
  decidedBy: z.string().min(1).optional(),
  decisionReason: z.string().max(2000).optional(),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalDecisionSchema = z.object({
  id: z.string().guid(),
  requestId: z.string().guid(),
  tenantId: z.string().min(1),
  decision: z.enum(['APPROVED', 'REJECTED']),
  decidedBy: z.string().min(1),
  reason: z.string().max(2000).optional(),
  decidedAt: z.string().datetime(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

/** O segredo bruto nunca é persistido; somente o hash do token de aprovação. */
export const ApprovalTokenSchema = z.object({
  id: z.string().guid(),
  requestId: z.string().guid(),
  tenantId: z.string().min(1),
  tokenHash: z.string().length(64),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  usedAt: z.string().datetime().optional(),
});
export type ApprovalToken = z.infer<typeof ApprovalTokenSchema>;
