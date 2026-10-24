import { VerifyAuthorityInputSchema } from '@forgelex/legal-tools';
import { z } from 'zod';
import { CaseItemKindSchema } from '@forgelex/domain';
/** Contratos internos. Não executam modelos nem substituem autorização no servidor. */
export const ResearchContextSchema = z.strictObject({
  contextId: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(3).max(4000),
  constraints: z.array(z.string().trim().min(1).max(500)).max(20),
});
export type ResearchContext = z.infer<typeof ResearchContextSchema>;

export const referenceId = z.string().trim().min(1).max(200);
export const legalWorkText = z.string().trim().min(1).max(4000);

/** Referências ao snapshot fornecido pelo executor. Hash e id não concedem acesso. */
export const LegalWorkSourceSchema = z
  .strictObject({
    id: referenceId,
    kind: z.enum([...CaseItemKindSchema.options, 'USER_TEXT', 'ISSUE', 'DRAFT_SECTION']),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    documentVersionId: z.string().guid().optional(),
  })
  .superRefine((source, ctx) => {
    if ((source.kind === 'DOCUMENT') !== Boolean(source.documentVersionId)) {
      ctx.addIssue({ code: 'custom', message: 'Somente documento exige referência à versão documental.' });
    }
  });

export const LegalWorkContextSchema = ResearchContextSchema.extend({
  action: z.enum(['analyze_documents', 'create_document', 'review_text']),
  contextRevision: z.number().int().positive(),
  sources: z.array(LegalWorkSourceSchema).min(1).max(100),
}).superRefine((context, ctx) => {
  if (new Set(context.sources.map((source) => source.id)).size !== context.sources.length) {
    ctx.addIssue({ code: 'custom', message: 'Referências de contexto devem ser únicas.' });
  }
});
export type LegalWorkContext = z.infer<typeof LegalWorkContextSchema>;

/** Nome canônico do plano; contexto mínimo consumido pelos especialistas. */
export const LegalContextPacketSchema = LegalWorkContextSchema;
export type LegalContextPacket = LegalWorkContext;

export const AuthorityVerificationContextSchema = ResearchContextSchema.extend({
  authority: VerifyAuthorityInputSchema,
});
