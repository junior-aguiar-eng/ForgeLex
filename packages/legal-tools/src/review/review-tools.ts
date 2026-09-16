import { z } from 'zod';
import { AgentTool, ToolExecutionContext } from '@forgelex/agent-core';
import { DraftRepository } from '@forgelex/persistence';
import { FactsEvidenceService } from '../facts-evidence/facts-evidence-service.js';
import { DraftReviewService } from './review-service.js';

const ReviewInputSchema = z.object({ draftId: z.string().uuid(), versionId: z.string().uuid().optional() });

function contextOf(context: ToolExecutionContext) {
  if (!context.matterId) throw new Error('MATTER_REQUIRED: a revisão de minuta exige matterId.');
  return { tenantId: context.tenantId, userId: context.userId, matterId: context.matterId };
}

export function createReviewTools(repository: DraftRepository, factsEvidenceService: FactsEvidenceService): {
  verifyCitationsTool: AgentTool;
  checkFactSupportTool: AgentTool;
  adversarialReviewTool: AgentTool;
} {
  const service = new DraftReviewService(repository, factsEvidenceService);
  return {
    verifyCitationsTool: {
      name: 'review.verify_citations',
      description: 'Verifica se as âncoras de citação da versão possuem confirmação positiva registrada.',
      impactLevel: 'L1_ANALYSIS',
      inputSchema: ReviewInputSchema,
      outputSchema: z.unknown(),
      execute: async (input, context) => {
        const parsed = ReviewInputSchema.parse(input);
        return { success: true, data: await service.verifyCitations(contextOf(context), parsed.draftId, parsed.versionId) };
      },
    },
    checkFactSupportTool: {
      name: 'review.check_fact_support',
      description: 'Confere se os fatos vinculados à minuta possuem cobertura explícita no matter.',
      impactLevel: 'L1_ANALYSIS',
      inputSchema: ReviewInputSchema,
      outputSchema: z.unknown(),
      execute: async (input, context) => {
        const parsed = ReviewInputSchema.parse(input);
        return { success: true, data: await service.checkFactSupport(contextOf(context), parsed.draftId, parsed.versionId) };
      },
    },
    adversarialReviewTool: {
      name: 'review.adversarial_review',
      description: 'Aponta lacunas estruturais e vínculos ausentes antes da aprovação humana.',
      impactLevel: 'L1_ANALYSIS',
      inputSchema: ReviewInputSchema,
      outputSchema: z.unknown(),
      execute: async (input, context) => {
        const parsed = ReviewInputSchema.parse(input);
        return { success: true, data: await service.adversarialReview(contextOf(context), parsed.draftId, parsed.versionId) };
      },
    },
  };
}
