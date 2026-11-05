import { z } from 'zod';
import { AnalysisSourceSchema } from './case-analysis.js';

/** Server-owned references, frozen when a new request is admitted. Never a client selection. */
export const ApprovedItemsSchema = z
  .array(
    z.strictObject({
      deliveryId: z.string().min(1).max(200),
      itemId: z.string().regex(/^[a-f0-9]{64}$/),
      contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  )
  .max(50)
  .refine((items) => new Set(items.map((i) => `${i.deliveryId}/${i.itemId}`)).size === items.length);
export type ApprovedItems = z.infer<typeof ApprovedItemsSchema>;
export const ApprovedItemSnapshotSchema = z.strictObject({
  deliveryId: z.string().min(1).max(200),
  itemId: z.string().regex(/^[a-f0-9]{64}$/),
  targetId: z.string().uuid(),
  kind: z.enum(['FACT', 'EVIDENCE']),
  text: z.string().min(3).max(4000),
  status: z.enum(['ASSERTED', 'DISPUTED', 'AVAILABLE']),
  decidedBy: z.string().min(1).max(200),
  decidedAt: z.string().datetime(),
  receiptHash: z.string().regex(/^[a-f0-9]{64}$/),
  relation: z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']).optional(),
  relatedFactId: z.string().uuid().optional(),
  sources: z
    .array(
      AnalysisSourceSchema.extend({
        quote: z.string().min(1).max(4000),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .max(1000),
});
export type ApprovedItemSnapshot = z.infer<typeof ApprovedItemSnapshotSchema>;

export const EvidenceReapprovalCommandSchema = z.strictObject({
  approved: z.literal(true),
  commandId: z.string().uuid(),
  reviewToken: z.string().regex(/^[a-f0-9]{64}$/),
  items: z
    .array(
      z.strictObject({
        deliveryId: z.string().min(1).max(200),
        itemId: z.string().regex(/^[a-f0-9]{64}$/),
      }),
    )
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => `${i.deliveryId}/${i.itemId}`)).size === items.length),
});
export type EvidenceReapprovalCommand = z.infer<typeof EvidenceReapprovalCommandSchema>;
export interface EvidenceReapproval {
  matterId: string;
  reviewToken: string;
  items: {
    deliveryId: string;
    itemId: string;
    previous: ApprovedItemSnapshot;
    previousSourcesUnavailable?: boolean;
    current?: ApprovedItemSnapshot;
    relatedFactText?: string;
    previousRelatedFactText?: string;
    blocked?: string;
  }[];
  isReplay?: boolean;
}
