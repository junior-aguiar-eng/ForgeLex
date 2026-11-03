import { z } from 'zod';
import type { AnalysisItem, AnalysisDecision } from './case-analysis.js';
import type { TaskEvidenceMatrix } from './task-evidence.js';

export interface EvidenceReviewItem extends Omit<AnalysisItem, 'sources'> {
  sources: AnalysisItem['sources'];
  references: TaskEvidenceMatrix['rows'][number]['references'];
  originIds: string[];
  blockedReasons: string[];
  dateText?: string;
}
export interface EvidenceReviewDecision extends AnalysisDecision {
  eventDate?: string;
  /** Exact reviewed proposal, including resolved sources; the original delivery remains immutable. */
  proposal: EvidenceReviewItem;
}
export interface EvidenceReview {
  deliveryId: string;
  matterId: string;
  revision: number;
  reviewToken: string;
  items: EvidenceReviewItem[];
  decisions: Record<string, EvidenceReviewDecision>;
  isReplay?: boolean;
}
export const EvidenceReviewCommandSchema = z
  .strictObject({
    approved: z.literal(true),
    commandId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
    decisions: z
      .array(
        z.strictObject({
          itemId: z.string().regex(/^[a-f0-9]{64}$/),
          action: z.enum(['ADOPT', 'DISCARD']),
          text: z.string().trim().min(3).max(4000).optional(),
          eventDate: z.string().date().optional(),
        }),
      )
      .min(1)
      .max(50),
  })
  .refine((v) => new Set(v.decisions.map((d) => d.itemId)).size === v.decisions.length, 'Decisões duplicadas.');
export type EvidenceReviewCommand = z.infer<typeof EvidenceReviewCommandSchema>;
