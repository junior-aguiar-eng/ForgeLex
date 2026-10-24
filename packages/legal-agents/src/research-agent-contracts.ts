import { z } from 'zod';
import type { ToolRegistry } from '@forgelex/agent-core';
import { VerifyAuthorityOutputSchema } from '@forgelex/legal-tools';
import { RESEARCH_AUTHORITY_WORKFLOW } from './instructions/research-authority.js';
import { ResearchContextSchema } from './context-packet.js';

const ResearchAuthoritySchema = VerifyAuthorityOutputSchema.superRefine((result, ctx) => {
  const verified = result.status === 'VERIFIED_OFFICIAL' || result.status === 'VERIFIED_PROVIDER';
  if (verified && !result.authority) {
    ctx.addIssue({ code: 'custom', message: 'Autoridade verificada exige dados e proveniência.' });
  }
  if (verified && result.authority && !result.authority.provenance.verified) {
    ctx.addIssue({ code: 'custom', message: 'Status verificado contradiz a proveniência.' });
  }
  if (verified && result.authority) {
    const official = result.authority.provenance.verificationMethod === 'OFFICIAL_SOURCE_HASH';
    if ((result.status === 'VERIFIED_OFFICIAL') !== official) {
      ctx.addIssue({ code: 'custom', message: 'Status incompatível com o método de verificação da fonte.' });
    }
  }
  if (result.authority && result.authority.court !== 'STJ') {
    ctx.addIssue({ code: 'custom', message: 'A0 suporta somente autoridades do STJ.' });
  }
});

/** Verificação de identidade/proveniência não comprova adequação jurídica ao caso. */
export const ResearchDeliverySchema = z
  .strictObject({
    contextId: z.string().trim().min(1).max(200),
    status: z.enum(['READY_FOR_HUMAN_REVIEW', 'LIMITED', 'SOURCE_UNAVAILABLE']),
    authorities: z.array(ResearchAuthoritySchema).max(20),
    limitations: z.array(z.string().trim().min(1).max(2000)).max(20),
    humanReviewRequired: z.literal(true),
  })
  .superRefine((delivery, ctx) => {
    if (delivery.status === 'READY_FOR_HUMAN_REVIEW') {
      if (
        delivery.authorities.length === 0 ||
        delivery.authorities.some((result) => !['VERIFIED_OFFICIAL', 'VERIFIED_PROVIDER'].includes(result.status))
      ) {
        ctx.addIssue({ code: 'custom', message: 'Entrega para revisão exige ao menos uma autoridade verificada.' });
      }
    } else if (delivery.limitations.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Limitação ou indisponibilidade exige motivo explícito.' });
    }
  });
export type ResearchDelivery = z.infer<typeof ResearchDeliverySchema>;

/** Checa dependências; não concede permissões nem instala ferramentas no runtime. */
export function validateResearchToolBindings(registry: Pick<ToolRegistry, 'get'>): void {
  for (const name of RESEARCH_AUTHORITY_WORKFLOW.steps.map((step) => step.toolName)) {
    if (!registry.get(name)) throw new Error(`Ferramenta requerida ausente: ${name}`);
  }
}

/** Validação estrutural de handoff. Autorização e origem efetiva dependem do executor futuro. */
export function validateResearchHandoff(context: unknown, output: unknown): ResearchDelivery {
  const parsedContext = ResearchContextSchema.parse(context);
  const delivery = ResearchDeliverySchema.parse(output);
  if (delivery.contextId !== parsedContext.contextId) throw new Error('Entrega pertence a outro contexto.');
  return delivery;
}
