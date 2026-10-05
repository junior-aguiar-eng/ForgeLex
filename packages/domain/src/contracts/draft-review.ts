import { z } from 'zod';
import { DraftReviewFindingSchema } from './drafting.js';

export const DraftReviewModeSchema = z.enum(['ALL', 'CITATION', 'FACT_SUPPORT', 'STRUCTURE']);
export type DraftReviewMode = z.infer<typeof DraftReviewModeSchema>;
export const DraftReviewResultStatusSchema = z.enum(['PASSED', 'WARNINGS', 'BLOCKED', 'INCOMPLETE']);
export const DraftReviewCheckSchema = z.object({
  kind: z.enum(['CITATION', 'FACT_SUPPORT', 'STRUCTURE']),
  state: z.enum(['CONFIRMED', 'ATTENTION', 'UNAVAILABLE', 'NOT_APPLICABLE']),
  code: z.string().min(1),
  message: z.string().min(1),
  sectionId: z.string().uuid().optional(),
  targetType: z.enum(['AUTHORITY', 'FACT', 'EVIDENCE']).optional(),
  targetId: z.string().uuid().optional(),
  humanConfirmed: z.boolean().optional(),
  checkedAt: z.string().datetime(),
  source: z
    .object({
      providerId: z.string().optional(),
      sourceUrl: z.string().optional(),
      capturedAt: z.string().optional(),
      contentHash: z.string().optional(),
      method: z.enum(['PERSISTED_CORPUS', 'PROVIDER']),
    })
    .optional(),
});
export type DraftReviewCheck = z.infer<typeof DraftReviewCheckSchema>;
export const DraftReviewRunSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  matterId: z.string().uuid(),
  draftId: z.string().uuid(),
  draftVersionId: z.string().uuid(),
  contentHash: z.string().length(64),
  contextHash: z.string().length(64),
  runNumber: z.number().int().positive(),
  mode: DraftReviewModeSchema,
  state: z.enum(['RUNNING', 'COMPLETE', 'INCOMPLETE']),
  status: DraftReviewResultStatusSchema,
  startedBy: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  checks: z.array(DraftReviewCheckSchema),
  blockingCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
});
export type DraftReviewRun = z.infer<typeof DraftReviewRunSchema>;
export const DraftReviewResultSchema = z.object({
  draftId: z.string().uuid(),
  draftVersionId: z.string().uuid(),
  run: DraftReviewRunSchema,
  findings: z.array(DraftReviewFindingSchema),
  blockingCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  status: DraftReviewResultStatusSchema,
});
export type DraftReviewResult = z.infer<typeof DraftReviewResultSchema>;
