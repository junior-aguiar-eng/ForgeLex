import { z } from 'zod';
export const CaseItemKindSchema = z.enum(['DOCUMENT', 'FACT', 'EVIDENCE', 'THESIS', 'AUTHORITY']);
export type CaseItemKind = z.infer<typeof CaseItemKindSchema>;
export interface VerifiedOAuthConnection {
  clientId: string;
  grantedAt: string;
}
export interface CaseAiOwner {
  tenantId: string;
  userId: string;
}
export type CaseAiReader = CaseAiOwner & { oauthConnection: VerifiedOAuthConnection };
const ids = z
  .array(z.string().uuid())
  .max(100)
  .transform((value) => [...new Set(value)].sort());
export const CaseAiSelectionSchema = z
  .object({
    documents: z
      .array(z.object({ documentId: z.string().uuid(), versionId: z.string().uuid() }).strict())
      .max(100)
      .refine(
        (value) => value.every((a) => value.every((b) => a.documentId !== b.documentId || a.versionId === b.versionId)),
        'Escolha uma única versão de cada documento.',
      )
      .transform((value) =>
        [...new Map(value.map((v) => [v.documentId, v])).values()].sort((a, b) =>
          a.documentId.localeCompare(b.documentId),
        ),
      ),
    factIds: ids,
    evidenceIds: ids,
    thesisIds: ids,
    authorityIds: ids,
  })
  .strict()
  .refine(
    (s) =>
      s.documents.length + s.factIds.length + s.evidenceIds.length + s.thesisIds.length + s.authorityIds.length > 0,
    'Selecione ao menos um item.',
  );
export type CaseAiSelection = z.infer<typeof CaseAiSelectionSchema>;
export const CaseAiGrantSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string(),
    userId: z.string(),
    oauthClientId: z.string().min(1),
    oauthGrantedAt: z.string().datetime(),
    matterId: z.string().uuid(),
    revision: z.number().int().positive(),
    status: z.enum(['ACTIVE', 'REVOKED']),
    selection: CaseAiSelectionSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    revokedAt: z.string().datetime().optional(),
  })
  .strict();
export type CaseAiGrant = z.infer<typeof CaseAiGrantSchema>;
export const CaseManifestItemSchema = z
  .object({
    kind: CaseItemKindSchema,
    id: z.string().uuid(),
    title: z.string(),
    preview: z.string(),
    versionId: z.string().uuid().optional(),
    versionNumber: z.number().int().positive().optional(),
  })
  .strict();
export const CaseAiPreviewSchema = z
  .object({
    matter: z.object({ id: z.string().uuid(), title: z.string() }).strict(),
    items: z.array(CaseManifestItemSchema),
    counts: z
      .object({
        DOCUMENT: z.number(),
        FACT: z.number(),
        EVIDENCE: z.number(),
        THESIS: z.number(),
        AUTHORITY: z.number(),
      })
      .strict(),
    nextCursor: z.string().optional(),
  })
  .strict();
export type CaseAiPreview = z.infer<typeof CaseAiPreviewSchema>;
export const SharedCasePageSchema = z
  .object({
    items: z.array(z.object({ matterId: z.string().uuid(), title: z.string(), grantRevision: z.number() }).strict()),
    nextCursor: z.string().optional(),
  })
  .strict();
export type SharedCasePage = z.infer<typeof SharedCasePageSchema>;
export const CaseContextPageSchema = z
  .object({
    matterId: z.string().uuid(),
    grantRevision: z.number(),
    items: z.array(CaseManifestItemSchema),
    nextCursor: z.string().optional(),
  })
  .strict();
export type CaseContextPage = z.infer<typeof CaseContextPageSchema>;
export const CaseItemPageSchema = z
  .object({
    matterId: z.string().uuid(),
    kind: CaseItemKindSchema,
    itemId: z.string().uuid(),
    grantRevision: z.number(),
    parts: z.array(
      z
        .object({
          field: z.string(),
          text: z.string(),
          offset: z.number().int().nonnegative(),
          documentId: z.string().uuid().optional(),
          versionId: z.string().uuid().optional(),
          anchorId: z.string().uuid().optional(),
        })
        .strict(),
    ),
    relations: z.array(
      z.object({ kind: CaseItemKindSchema, itemId: z.string().uuid(), relation: z.string() }).strict(),
    ),
    nextCursor: z.string().optional(),
  })
  .strict();
export type CaseItemPage = z.infer<typeof CaseItemPageSchema>;
