import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '@forgelex/agent-core';
import { DraftRepository } from '@forgelex/persistence';
import { DraftingService } from './draft-service.js';

const DraftSectionInputSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  title: z.string().min(3),
  content: z.string(),
  linkedFactIds: z.array(z.string().uuid()).default([]),
  linkedEvidenceIds: z.array(z.string().uuid()).default([]),
  linkedAuthorityIds: z.array(z.string().uuid()).default([]),
  linkedThesisIds: z.array(z.string().uuid()).default([]),
});
const CitationInputSchema = z.object({
  sectionOrdinal: z.number().int().nonnegative(),
  targetType: z.enum(['AUTHORITY', 'FACT', 'EVIDENCE']),
  targetId: z.string().uuid(),
  citationText: z.string().min(3),
  verified: z.boolean(),
});
const DraftContentSchema = z.object({
  title: z.string().min(3),
  sections: z.array(DraftSectionInputSchema).min(1).max(100),
  citations: z.array(CitationInputSchema).max(500).default([]),
  notes: z.string().max(2000).optional(),
});
const DraftUpdateInputSchema = DraftContentSchema.extend({ draftId: z.string().uuid() });
const DraftGetInputSchema = z.object({ draftId: z.string().uuid() });

export const DraftCreateInputSchema = DraftContentSchema;
export const DraftCreateOutputSchema = z.object({
  draft: z.unknown(),
  version: z.unknown(),
  sections: z.array(z.unknown()),
  citations: z.array(z.unknown()),
});
export type DraftCreateInput = z.infer<typeof DraftCreateInputSchema>;
export type DraftCreateOutput = z.infer<typeof DraftCreateOutputSchema>;
export type DraftUpdateInput = z.infer<typeof DraftUpdateInputSchema>;

function contextOf(context: ToolExecutionContext) {
  if (!context.matterId) throw new Error('MATTER_REQUIRED: a tool de drafting exige matterId.');
  return { tenantId: context.tenantId, userId: context.userId, matterId: context.matterId };
}

export function createDraftingTools(repository: DraftRepository): {
  createDraftTool: AgentTool<DraftCreateInput, DraftCreateOutput>;
  updateDraftTool: AgentTool<DraftUpdateInput, DraftCreateOutput>;
  getDraftTool: AgentTool<z.infer<typeof DraftGetInputSchema>, unknown>;
} {
  const service = new DraftingService(repository);
  const createDraftTool: AgentTool<DraftCreateInput, DraftCreateOutput> = {
    name: 'drafting.create_draft',
    description: 'Cria um rascunho versionado com seções e vínculos explícitos, sem efeito externo.',
    impactLevel: 'L3_INTERNAL_MUTATION',
    inputSchema: DraftCreateInputSchema,
    outputSchema: DraftCreateOutputSchema,
    execute: async (input, context): Promise<ToolExecutionResult<DraftCreateOutput>> => ({
      success: true,
      data: await service.createDraft(contextOf(context), input),
    }),
  };
  const updateDraftTool: AgentTool<DraftUpdateInput, DraftCreateOutput> = {
    name: 'drafting.update_draft',
    description: 'Cria uma nova versão do rascunho preservando o histórico, sem sobrescrever versões anteriores.',
    impactLevel: 'L3_INTERNAL_MUTATION',
    inputSchema: DraftUpdateInputSchema,
    outputSchema: DraftCreateOutputSchema,
    execute: async (input, context) => {
      return { success: true, data: await service.updateDraft(contextOf(context), input.draftId, input) };
    },
  };
  const getDraftTool: AgentTool<z.infer<typeof DraftGetInputSchema>, unknown> = {
    name: 'drafting.get_draft',
    description: 'Retorna o rascunho, a versão atual, o histórico e os achados de revisão do matter autenticado.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: DraftGetInputSchema,
    outputSchema: z.unknown(),
    execute: async (input, context) => ({
      success: true,
      data: await service.getDraft(contextOf(context), input.draftId),
    }),
  };
  return { createDraftTool, updateDraftTool, getDraftTool };
}
