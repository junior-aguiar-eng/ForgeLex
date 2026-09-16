import { z } from 'zod';

export const FactCategorySchema = z.enum(['FACTUAL', 'PROCEDURAL', 'TEMPORAL', 'DAMAGE', 'OTHER']);
export type FactCategory = z.infer<typeof FactCategorySchema>;

export const FactStatusSchema = z.enum(['ASSERTED', 'CONFIRMED', 'DISPUTED', 'REJECTED']);
export type FactStatus = z.infer<typeof FactStatusSchema>;

export const FactSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  statement: z.string().min(3),
  category: FactCategorySchema,
  status: FactStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Fact = z.infer<typeof FactSchema>;

export const FactSourceRelationSchema = z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']);
export type FactSourceRelation = z.infer<typeof FactSourceRelationSchema>;

export const FactSourceLinkSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  factId: z.string().uuid(),
  documentAnchorId: z.string().uuid(),
  relation: FactSourceRelationSchema,
  note: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
});
export type FactSourceLink = z.infer<typeof FactSourceLinkSchema>;

export const EvidenceTypeSchema = z.enum(['DOCUMENT', 'TESTIMONY', 'RECORD', 'EXPERT_REPORT', 'OTHER']);
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;

export const EvidenceStatusSchema = z.enum(['AVAILABLE', 'MISSING', 'CONTESTED']);
export type EvidenceStatus = z.infer<typeof EvidenceStatusSchema>;

export const EvidenceItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().max(10000).optional(),
  evidenceType: EvidenceTypeSchema,
  status: EvidenceStatusSchema,
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

export const EvidenceSourceRelationSchema = z.enum(['PROVES', 'REFUTES', 'CONTEXT']);
export type EvidenceSourceRelation = z.infer<typeof EvidenceSourceRelationSchema>;

export const EvidenceSourceLinkSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  evidenceItemId: z.string().uuid(),
  documentAnchorId: z.string().uuid(),
  relation: EvidenceSourceRelationSchema,
  note: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
});
export type EvidenceSourceLink = z.infer<typeof EvidenceSourceLinkSchema>;

export const FactEvidenceRelationSchema = z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']);
export type FactEvidenceRelation = z.infer<typeof FactEvidenceRelationSchema>;

/** Relação explícita entre um item de prova e um fato; não representa juízo automático de veracidade. */
export const EvidenceLinkSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  factId: z.string().uuid(),
  evidenceItemId: z.string().uuid(),
  relation: FactEvidenceRelationSchema,
  note: z.string().max(2000).optional(),
  createdAt: z.string().datetime(),
});
export type EvidenceLink = z.infer<typeof EvidenceLinkSchema>;

export const EvidenceCoverageStatusSchema = z.enum(['SUPPORTED', 'PARTIAL', 'UNSUPPORTED', 'CONFLICTING']);
export type EvidenceCoverageStatus = z.infer<typeof EvidenceCoverageStatusSchema>;

export const EvidenceCoverageSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  factId: z.string().uuid(),
  supportingEvidenceCount: z.number().int().nonnegative(),
  contradictingEvidenceCount: z.number().int().nonnegative(),
  contextualEvidenceCount: z.number().int().nonnegative(),
  supportingAnchorCount: z.number().int().nonnegative(),
  contradictingAnchorCount: z.number().int().nonnegative(),
  coverage: EvidenceCoverageStatusSchema,
  calculatedAt: z.string().datetime(),
});
export type EvidenceCoverage = z.infer<typeof EvidenceCoverageSchema>;

export const TimelineEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  title: z.string().min(3),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'eventDate deve usar o formato YYYY-MM-DD'),
  description: z.string().max(10000).optional(),
  sourceAnchorId: z.string().uuid().optional(),
  createdBy: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
