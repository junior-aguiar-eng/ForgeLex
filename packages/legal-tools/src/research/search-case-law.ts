import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '@forgelex/agent-core';
import { CaseLawSchema } from '@forgelex/domain';
import { ResearchService, createFixtureResearchService } from './research-service.js';

export const SearchCaseLawInputSchema = z.object({
  query: z.string().min(2, 'Termo de busca deve conter pelo menos 2 caracteres'),
  court: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(10),
});

export type SearchCaseLawInput = z.infer<typeof SearchCaseLawInputSchema>;

export const SearchCaseLawOutputSchema = z.object({
  items: z.array(CaseLawSchema),
  total: z.number().int().nonnegative(),
  queryExecuted: z.string(),
  courtFilter: z.string().optional(),
});

export type SearchCaseLawOutput = z.infer<typeof SearchCaseLawOutputSchema>;

export function createSearchCaseLawTool(researchService: ResearchService): AgentTool<SearchCaseLawInput, SearchCaseLawOutput> {
  return {
    name: 'research.search_case_law',
    description:
      'Pesquisa jurisprudência oficial e precedentes qualificados em tribunais superiores com proveniência ancorada.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: SearchCaseLawInputSchema,
    outputSchema: SearchCaseLawOutputSchema,
    timeoutMs: 15000,
    execute: async (
      input: SearchCaseLawInput,
      _context: ToolExecutionContext
    ): Promise<ToolExecutionResult<SearchCaseLawOutput>> => {
      const data = await researchService.searchCaseLaw(input);
      return {
        success: true,
        data,
        provenance: data.items.map((item) => item.provenance),
      };
    },
  };
}

/** Provider de fixtures mantido para testes e workflows determinísticos. */
export const searchCaseLawTool = createSearchCaseLawTool(createFixtureResearchService());
