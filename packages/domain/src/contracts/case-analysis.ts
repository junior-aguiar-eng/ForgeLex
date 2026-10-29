import { z } from 'zod';

export const AnalysisPermissionSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }).strict(),
  z.object({ enabled: z.literal(true), objective: z.string().trim().min(3).max(2000) }).strict(),
]);
export type AnalysisPermission = z.infer<typeof AnalysisPermissionSchema>;
// Item IDs become keys of the persisted decision map.
const AnalysisItemIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/)
  .refine((id) => !Object.prototype.hasOwnProperty.call(Object.prototype, id), 'Identificador reservado.');
export const AnalysisSourceSchema = z
  .object({
    documentId: z.string().uuid(),
    versionId: z.string().uuid(),
    anchorId: z.string().uuid(),
    quote: z.string().min(3).max(4000),
    relation: z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']),
  })
  .strict();
export const AnalysisItemSchema = z
  .object({
    id: AnalysisItemIdSchema,
    kind: z.enum(['FACT', 'EVIDENCE', 'TIMELINE', 'ISSUE', 'GAP']),
    text: z.string().trim().min(3).max(4000),
    classification: z.enum(['EXTRACTED', 'ALLEGATION', 'SUPPORTED', 'DISPUTED', 'INFERENCE', 'LEGAL_QUESTION', 'GAP']),
    sources: z.array(AnalysisSourceSchema).min(1).max(10),
    eventDate: z.string().date().optional(),
    factItemId: AnalysisItemIdSchema.optional(),
    relation: z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.kind === 'TIMELINE' && !v.eventDate) ctx.addIssue({ code: 'custom', message: 'Evento exige data.' });
    if (v.kind !== 'TIMELINE' && v.eventDate) ctx.addIssue({ code: 'custom', message: 'Data só em evento.' });
    if (v.factItemId && (v.kind !== 'EVIDENCE' || !v.relation))
      ctx.addIssue({ code: 'custom', message: 'Vínculo probatório exige relação.' });
    if (
      v.kind === 'FACT' &&
      !['EXTRACTED', 'ALLEGATION', 'SUPPORTED', 'DISPUTED', 'INFERENCE'].includes(v.classification)
    )
      ctx.addIssue({ code: 'custom', message: 'Classificação fática inválida.' });
    if (v.classification === 'SUPPORTED' && !v.sources.some((s) => s.relation === 'SUPPORTS'))
      ctx.addIssue({ code: 'custom', message: 'Suporte exige referência de suporte.' });
  });
export type AnalysisItem = z.infer<typeof AnalysisItemSchema>;
export const CaseAnalysisInputSchema = z
  .object({
    matterId: z.string().uuid(),
    expectedGrantRevision: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    objective: z.string().trim().min(3).max(2000),
    items: z.array(AnalysisItemSchema).min(1).max(100),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (new Set(v.items.map((i) => i.id)).size !== v.items.length)
      ctx.addIssue({ code: 'custom', message: 'Identificadores duplicados.' });
    for (const i of v.items)
      if (i.factItemId && !v.items.some((f) => f.id === i.factItemId && f.kind === 'FACT'))
        ctx.addIssue({ code: 'custom', message: 'Fato relacionado não consta da análise.' });
  });
export type CaseAnalysisInput = z.infer<typeof CaseAnalysisInputSchema>;
export const AnalysisReceiptSchema = z
  .object({
    id: z.string().uuid(),
    matterId: z.string().uuid(),
    receivedAt: z.string().datetime(),
    reviewPending: z.literal(true),
    isReplay: z.boolean(),
    openPath: z.string(),
  })
  .strict();
export type AnalysisReceipt = z.infer<typeof AnalysisReceiptSchema>;
export const AnalysisDecisionInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    decisions: z
      .array(
        z
          .object({
            itemId: AnalysisItemIdSchema,
            action: z.enum(['ADOPT', 'DISCARD']),
            text: z.string().trim().min(3).max(4000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .refine((v) => new Set(v.decisions.map((d) => d.itemId)).size === v.decisions.length, 'Decisões duplicadas.');
export type AnalysisDecisionInput = z.infer<typeof AnalysisDecisionInputSchema>;
export interface AnalysisDecision {
  action: 'ADOPT' | 'DISCARD';
  text: string;
  targetId?: string;
  decidedAt: string;
  decidedBy: string;
}
export interface AnalysisReview {
  id: string;
  matterId: string;
  revision: number;
  objective: string;
  receivedAt: string;
  application: { clientId: string };
  items: AnalysisItem[];
  decisions: Record<string, AnalysisDecision>;
}
