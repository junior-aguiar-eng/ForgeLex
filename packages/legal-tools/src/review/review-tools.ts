import { z } from 'zod';
import { AgentTool, ToolExecutionContext } from '@forgelex/agent-core';
import { DraftReviewService } from './review-service.js';

const ReviewInputSchema = z.object({ draftId: z.string().uuid(), versionId: z.string().uuid().optional() });

function contextOf(context: ToolExecutionContext) {
  if (!context.matterId) throw new Error('MATTER_REQUIRED: a revisão de minuta exige matterId.');
  return { tenantId: context.tenantId, userId: context.userId, matterId: context.matterId };
}

export function createReviewTools(service: DraftReviewService): {
  verifyCitationsTool: AgentTool;
  checkFactSupportTool: AgentTool;
  adversarialReviewTool: AgentTool;
} {
  return {
    verifyCitationsTool: {
      name: 'review.verify_citations',
      description: 'Revalida as referências cadastradas no caso e registra a conferência da versão.',
      impactLevel: 'L3_INTERNAL_MUTATION',
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
      impactLevel: 'L3_INTERNAL_MUTATION',
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
      impactLevel: 'L3_INTERNAL_MUTATION',
      inputSchema: ReviewInputSchema,
      outputSchema: z.unknown(),
      execute: async (input, context) => {
        const parsed = ReviewInputSchema.parse(input);
        return { success: true, data: await service.adversarialReview(contextOf(context), parsed.draftId, parsed.versionId) };
      },
    },
  };
}
