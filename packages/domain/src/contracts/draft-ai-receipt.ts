import { z } from 'zod';

export const DraftReceivePermissionSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(false) }).strict(),
  z
    .object({
      enabled: z.literal(true),
      destination: z.discriminatedUnion('mode', [
        z.object({ mode: z.literal('NEW') }).strict(),
        z.object({ mode: z.literal('EXISTING'), draftId: z.string().uuid() }).strict(),
      ]),
    })
    .strict(),
]);
export type DraftReceivePermission = z.infer<typeof DraftReceivePermissionSchema>;

export const DraftAiReferenceSchema = z
  .object({
    sectionOrdinal: z.number().int().nonnegative(),
    kind: z.enum(['DOCUMENT', 'FACT', 'EVIDENCE', 'THESIS', 'AUTHORITY']),
    itemId: z.string().uuid(),
    documentVersionId: z.string().uuid().optional(),
    anchorId: z.string().uuid().optional(),
    citationText: z.string().optional(),
  })
  .strict()
  .superRefine((ref, ctx) => {
    if (ref.kind === 'DOCUMENT' ? !ref.documentVersionId : ref.documentVersionId || ref.anchorId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Informe a versão apenas para uma referência documental.' });
    }
  });
export type DraftAiReference = z.infer<typeof DraftAiReferenceSchema>;

export const DraftSaveFromAiInputSchema = z
  .object({
    matterId: z.string().uuid(),
    expectedGrantRevision: z.number().int().positive(),
    idempotencyKey: z.string().min(16).max(128),
    title: z.string().trim().min(3).max(200),
    sections: z
      .array(
        z
          .object({
            ordinal: z.number().int().nonnegative(),
            title: z.string().trim().min(1).max(200),
            content: z.string().refine((text) => text.trim().length > 0, 'O texto não pode estar vazio.'),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    references: z.array(DraftAiReferenceSchema).max(500).default([]),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const ordinals = new Set(input.sections.map((section) => section.ordinal));
    if (ordinals.size !== input.sections.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'As seções devem ter ordinais únicos.' });
    if (input.references.some((ref) => !ordinals.has(ref.sectionOrdinal)))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A referência deve pertencer a uma seção enviada.' });
    if (new TextEncoder().encode(JSON.stringify(input)).length > 512 * 1024)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'O texto excede o limite de recebimento.' });
  });
export type DraftSaveFromAiInput = z.infer<typeof DraftSaveFromAiInputSchema>;

export const DraftAiReceiptSchema = z
  .object({
    id: z.string().uuid(),
    draftId: z.string().uuid(),
    versionId: z.string().uuid(),
    versionNumber: z.number().int().positive(),
    receivedAt: z.string().datetime(),
    reviewPending: z.literal(true),
    isReplay: z.boolean(),
    openPath: z.string(),
    application: z.object({ clientId: z.string().min(1), label: z.string().optional() }).strict(),
  })
  .strict();
export type DraftAiReceipt = z.infer<typeof DraftAiReceiptSchema>;
