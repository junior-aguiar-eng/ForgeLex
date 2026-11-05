import { z } from 'zod';
import {
  AnalysisItemSchema,
  AnalysisSourceSchema,
  TaskEvidenceMatrixSchema,
  ApprovedItemSnapshotSchema,
} from '@forgelex/domain';
export const savedReviewSchema = z.strictObject({
  version: z.literal(1),
  revision: z.number().int().positive(),
  decisions: z.record(
    z.string().regex(/^[a-f0-9]{64}$/),
    z.strictObject({
      action: z.enum(['ADOPT', 'DISCARD']),
      text: z.string().min(1).max(16000),
      targetId: z.string().uuid().optional(),
      eventDate: z.string().date().optional(),
      decidedAt: z.string().datetime(),
      decidedBy: z.string().min(1).max(200),
      proposal: z.strictObject({
        ...AnalysisItemSchema.shape,
        text: z.string().min(1).max(16000),
        sources: z.array(AnalysisSourceSchema.extend({ quote: z.string().min(1).max(4000) })),
        references: z.array(TaskEvidenceMatrixSchema.shape.rows.element.shape.references.element),
        originIds: z.array(z.string()),
        blockedReasons: z.array(z.string()),
        dateText: z.string().optional(),
      }),
    }),
  ),
  commands: z.record(z.string().uuid(), z.strictObject({ inputHash: z.string().regex(/^[a-f0-9]{64}$/) })),
  reapprovals: z.record(z.string().regex(/^[a-f0-9]{64}$/), z.array(ApprovedItemSnapshotSchema).max(100)).optional(),
  reapprovalCommands: z
    .record(z.string().uuid(), z.strictObject({ inputHash: z.string().regex(/^[a-f0-9]{64}$/) }))
    .optional(),
});
