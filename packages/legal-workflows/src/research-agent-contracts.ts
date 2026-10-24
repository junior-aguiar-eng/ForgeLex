import { z } from 'zod';
import type { ToolRegistry } from '@forgelex/agent-core';
import { VerifyAuthorityOutputSchema } from '@forgelex/legal-tools';
import { RESEARCH_AUTHORITY_INSTRUCTIONS, RESEARCH_AUTHORITY_WORKFLOW } from './agentic-contracts.js';

/** Contratos internos. Não executam modelos nem substituem autorização no servidor. */
export const ResearchContextSchema = z.strictObject({
  contextId: z.string().trim().min(1).max(200),
  objective: z.string().trim().min(3).max(4000),
  constraints: z.array(z.string().trim().min(1).max(500)).max(20),
});
export type ResearchContext = z.infer<typeof ResearchContextSchema>;

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
export const ResearchDeliverySchema = z.strictObject({
  contextId: z.string().trim().min(1).max(200),
  status: z.enum(['READY_FOR_HUMAN_REVIEW', 'LIMITED', 'SOURCE_UNAVAILABLE']),
  authorities: z.array(ResearchAuthoritySchema).max(20),
  limitations: z.array(z.string().trim().min(1).max(2000)).max(20),
  humanReviewRequired: z.literal(true),
}).superRefine((delivery, ctx) => {
  if (delivery.status === 'READY_FOR_HUMAN_REVIEW') {
    if (delivery.authorities.length === 0 || delivery.authorities.some((result) =>
      !['VERIFIED_OFFICIAL', 'VERIFIED_PROVIDER'].includes(result.status))) {
      ctx.addIssue({ code: 'custom', message: 'Entrega para revisão exige ao menos uma autoridade verificada.' });
    }
  } else if (delivery.limitations.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'Limitação ou indisponibilidade exige motivo explícito.' });
  }
});
export type ResearchDelivery = z.infer<typeof ResearchDeliverySchema>;

export interface LegalAgentDefinition {
  readonly id: string;
  readonly version: string;
  readonly role: string;
  readonly objective: string;
  readonly scope: 'STJ';
  readonly instructionId: string;
  readonly instructionVersion: string;
  readonly workflowId: string;
  readonly workflowVersion: string;
  readonly allowedTools: readonly string[];
  readonly inputSchema: typeof ResearchContextSchema;
  readonly outputSchema: typeof ResearchDeliverySchema;
  readonly escalation: readonly string[];
  readonly qualityChecks: readonly string[];
  readonly executionEnabled: false;
}

export const LEGAL_AGENT_CATALOG: readonly LegalAgentDefinition[] = [{
  id: 'stj-authority-researcher', version: '1.0.0', role: 'legal-researcher',
  objective: 'Pesquisar candidatos no STJ e entregar autoridades com proveniência e limitações para revisão humana.',
  scope: 'STJ',
  instructionId: RESEARCH_AUTHORITY_INSTRUCTIONS.id,
  instructionVersion: RESEARCH_AUTHORITY_INSTRUCTIONS.version,
  workflowId: RESEARCH_AUTHORITY_WORKFLOW.id,
  workflowVersion: RESEARCH_AUTHORITY_WORKFLOW.version,
  allowedTools: RESEARCH_AUTHORITY_WORKFLOW.steps.map((step) => step.toolName),
  inputSchema: ResearchContextSchema, outputSchema: ResearchDeliverySchema,
  escalation: ['fonte indisponível', 'autoridade ausente ou divergente', 'questão fora do STJ', 'contexto insuficiente'],
  qualityChecks: ['preservar status da fonte', 'não inventar fatos ou autoridades', 'não equiparar verificação a adequação jurídica', 'exigir revisão humana'],
  executionEnabled: false,
}];

export type LegalActionId = 'analyze_documents' | 'research_question' | 'create_document' | 'review_text';
export interface LegalActionDefinition {
  readonly id: LegalActionId;
  readonly label: string;
  readonly contractStatus: 'PLANNED' | 'DEFINED';
  readonly agentIds: readonly string[];
  readonly executionEnabled: false;
}

/** Catálogo interno de planejamento, sem publicação automática no frontend/MCP. */
export const LEGAL_ACTION_CATALOG: readonly LegalActionDefinition[] = [
  { id: 'analyze_documents', label: 'Analisar documentos', contractStatus: 'PLANNED', agentIds: [], executionEnabled: false },
  { id: 'research_question', label: 'Pesquisar uma questão', contractStatus: 'DEFINED', agentIds: ['stj-authority-researcher'], executionEnabled: false },
  { id: 'create_document', label: 'Criar uma peça', contractStatus: 'PLANNED', agentIds: [], executionEnabled: false },
  { id: 'review_text', label: 'Revisar um texto', contractStatus: 'PLANNED', agentIds: [], executionEnabled: false },
];

/** Checa dependências; não concede permissões nem instala ferramentas no runtime. */
export function validateResearchToolBindings(registry: Pick<ToolRegistry, 'get'>): void {
  for (const name of LEGAL_AGENT_CATALOG[0].allowedTools) {
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
