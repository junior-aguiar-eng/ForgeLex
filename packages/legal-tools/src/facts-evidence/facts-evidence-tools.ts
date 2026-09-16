import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '@forgelex/agent-core';
import {
  EvidenceCoverageSchema,
  EvidenceItemSchema,
  EvidenceLinkSchema,
  EvidenceSourceLinkSchema,
  FactSchema,
  FactSourceLinkSchema,
} from '@forgelex/domain';
import { FactsEvidenceService } from './facts-evidence-service.js';

const MatterIdInput = z.object({ matterId: z.string().uuid().optional() });

const CandidateFactSchema = z.object({
  statement: z.string().min(3),
  category: z.enum(['FACTUAL', 'PROCEDURAL', 'TEMPORAL', 'DAMAGE', 'OTHER']).optional(),
  sourceAnchorId: z.string().uuid().optional(),
});

export const FactsExtractInputSchema = MatterIdInput.extend({
  facts: z.array(CandidateFactSchema).min(1).max(100),
});
export type FactsExtractInput = z.infer<typeof FactsExtractInputSchema>;

export const FactsExtractOutputSchema = z.object({ facts: z.array(FactSchema) });
export type FactsExtractOutput = z.infer<typeof FactsExtractOutputSchema>;

export const FactsListInputSchema = MatterIdInput;
export const FactsListOutputSchema = z.object({
  items: z.array(FactSchema),
  coverage: z.array(EvidenceCoverageSchema),
});
export type FactsListOutput = z.infer<typeof FactsListOutputSchema>;

export const FactsFindSupportInputSchema = MatterIdInput.extend({ factId: z.string().uuid() });
export const FactsFindSupportOutputSchema = z.object({
  fact: FactSchema,
  sourceLinks: z.array(FactSourceLinkSchema),
  evidenceLinks: z.array(EvidenceLinkSchema),
  evidenceSourceLinks: z.array(EvidenceSourceLinkSchema),
  coverage: EvidenceCoverageSchema,
});
export type FactsFindSupportOutput = z.infer<typeof FactsFindSupportOutputSchema>;

const EvidenceInputSchema = z.object({
  title: z.string().min(3),
  description: z.string().max(10000).optional(),
  evidenceType: z.enum(['DOCUMENT', 'TESTIMONY', 'RECORD', 'EXPERT_REPORT', 'OTHER']).optional(),
  status: z.enum(['AVAILABLE', 'MISSING', 'CONTESTED']).optional(),
});

export const EvidenceMapSupportInputSchema = MatterIdInput.extend({
  factId: z.string().uuid(),
  evidenceItemId: z.string().uuid().optional(),
  evidence: EvidenceInputSchema.optional(),
  anchorIds: z.array(z.string().uuid()).max(100).optional(),
  relation: z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']).default('SUPPORTS'),
  note: z.string().max(2000).optional(),
}).refine((input) => input.evidenceItemId || input.evidence, {
  message: 'evidenceItemId ou evidence é obrigatório.',
  path: ['evidence'],
});
export type EvidenceMapSupportInput = z.infer<typeof EvidenceMapSupportInputSchema>;

export const EvidenceMapSupportOutputSchema = z.object({
  evidence: EvidenceItemSchema,
  evidenceLink: EvidenceLinkSchema,
  sourceLinks: z.array(EvidenceSourceLinkSchema),
});
export type EvidenceMapSupportOutput = z.infer<typeof EvidenceMapSupportOutputSchema>;

export const EvidenceCoverageInputSchema = MatterIdInput;
export const EvidenceCoverageOutputSchema = z.object({ coverage: z.array(EvidenceCoverageSchema) });
export type EvidenceCoverageOutput = z.infer<typeof EvidenceCoverageOutputSchema>;

function contextOf(context: ToolExecutionContext) {
  return { tenantId: context.tenantId, userId: context.userId, matterId: context.matterId };
}

export function createFactsExtractTool(service: FactsEvidenceService): AgentTool<FactsExtractInput, FactsExtractOutput> {
  return {
    name: 'facts.extract',
    description: 'Registra fatos candidatos fornecidos pelo fluxo e suas âncoras, sem confirmar automaticamente sua veracidade.',
    impactLevel: 'L3_INTERNAL_MUTATION',
    inputSchema: FactsExtractInputSchema,
    outputSchema: FactsExtractOutputSchema,
    execute: async (input, context): Promise<ToolExecutionResult<FactsExtractOutput>> => ({
      success: true,
      data: { facts: await service.extractCandidateFacts(contextOf(context), input) },
    }),
  };
}

export function createFactsListTool(service: FactsEvidenceService): AgentTool<z.infer<typeof FactsListInputSchema>, FactsListOutput> {
  return {
    name: 'facts.list',
    description: 'Lista fatos do matter e a cobertura explícita calculada a partir de âncoras e itens de prova vinculados.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: FactsListInputSchema,
    outputSchema: FactsListOutputSchema,
    execute: async (input, context): Promise<ToolExecutionResult<FactsListOutput>> => ({
      success: true,
      data: await service.listFacts(contextOf(context), input.matterId),
    }),
  };
}

export function createFactsFindSupportTool(service: FactsEvidenceService): AgentTool<z.infer<typeof FactsFindSupportInputSchema>, FactsFindSupportOutput> {
  return {
    name: 'facts.find_support',
    description: 'Retorna as âncoras e provas explicitamente relacionadas a um fato, incluindo conflitos de suporte.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: FactsFindSupportInputSchema,
    outputSchema: FactsFindSupportOutputSchema,
    execute: async (input, context): Promise<ToolExecutionResult<FactsFindSupportOutput>> => ({
      success: true,
      data: await service.findSupport(contextOf(context), input),
    }),
  };
}

export function createEvidenceMapSupportTool(service: FactsEvidenceService): AgentTool<EvidenceMapSupportInput, EvidenceMapSupportOutput> {
  return {
    name: 'evidence.map_support',
    description: 'Vincula um item de prova a um fato e, opcionalmente, às âncoras documentais correspondentes.',
    impactLevel: 'L3_INTERNAL_MUTATION',
    inputSchema: EvidenceMapSupportInputSchema,
    outputSchema: EvidenceMapSupportOutputSchema,
    execute: async (input, context): Promise<ToolExecutionResult<EvidenceMapSupportOutput>> => ({
      success: true,
      data: await service.mapEvidenceSupport(contextOf(context), input),
    }),
  };
}

export function createEvidenceCoverageTool(service: FactsEvidenceService): AgentTool<z.infer<typeof EvidenceCoverageInputSchema>, EvidenceCoverageOutput> {
  return {
    name: 'evidence.get_coverage',
    description: 'Calcula a cobertura explícita dos fatos do matter; não substitui avaliação jurídica ou prova judicial.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: EvidenceCoverageInputSchema,
    outputSchema: EvidenceCoverageOutputSchema,
    execute: async (input, context): Promise<ToolExecutionResult<EvidenceCoverageOutput>> => ({
      success: true,
      data: { coverage: await service.getCoverage(contextOf(context), input.matterId) },
    }),
  };
}
