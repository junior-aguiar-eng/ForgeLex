import { z } from 'zod';
import { AgentTool, ToolExecutionContext } from '@forgelex/agent-core';
import { StrategyService } from './strategy-service.js';

const EmptyInputSchema = z.object({});
const CreateThesisInputSchema = z.object({
  title: z.string().min(3),
  statement: z.string().min(10),
  rationale: z.string().max(4000).optional(),
  issueIds: z.array(z.string().uuid()).default([]),
  factIds: z.array(z.string().uuid()).default([]),
  evidenceIds: z.array(z.string().uuid()).default([]),
  authorityIds: z.array(z.string().uuid()).default([]),
  status: z.enum(['PROPOSED', 'REVIEWED', 'REJECTED']).default('PROPOSED'),
});
type CreateThesisInput = z.infer<typeof CreateThesisInputSchema>;

function contextOf(context: ToolExecutionContext) {
  if (!context.matterId) throw new Error('MATTER_REQUIRED: a estratégia exige matterId.');
  return { tenantId: context.tenantId, userId: context.userId, matterId: context.matterId };
}

export function createStrategyTools(service: StrategyService): {
  identifyIssuesTool: AgentTool;
  buildThesisMapTool: AgentTool;
  createThesisTool: AgentTool;
} {
  return {
    identifyIssuesTool: {
      name: 'strategy.identify_issues',
      description: 'Retorna as questões jurídicas delimitadas para o matter autenticado.',
      impactLevel: 'L1_ANALYSIS',
      inputSchema: EmptyInputSchema,
      outputSchema: z.unknown(),
      execute: async (_input, context) => ({ success: true, data: await service.identifyIssues(contextOf(context)) }),
    },
    buildThesisMapTool: {
      name: 'strategy.build_thesis_map',
      description: 'Monta o mapa de teses do matter a partir das questões e teses persistidas.',
      impactLevel: 'L1_ANALYSIS',
      inputSchema: EmptyInputSchema,
      outputSchema: z.unknown(),
      execute: async (_input, context) => ({ success: true, data: await service.buildThesisMap(contextOf(context)) }),
    },
    createThesisTool: {
      name: 'strategy.create_thesis',
      description: 'Registra uma tese jurídica com vínculos explícitos às fontes do matter.',
      impactLevel: 'L3_INTERNAL_MUTATION',
      inputSchema: CreateThesisInputSchema,
      outputSchema: z.unknown(),
      execute: async (input, context) => {
        const parsed = CreateThesisInputSchema.parse(input) as CreateThesisInput;
        return { success: true, data: await service.createThesis(contextOf(context), parsed) };
      },
    },
  };
}
