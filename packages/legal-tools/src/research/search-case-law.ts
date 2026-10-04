import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '@forgelex/agent-core';
import { CaseLawSchema } from '@forgelex/domain';
import { ResearchService, createFixtureResearchService } from './research-service.js';

export const SearchCaseLawInputSchema = z.object({
  query: z.string().min(2, 'Termo de busca deve conter pelo menos 2 caracteres')
    .describe('Tema, tese ou processo. Sem aspas exige todos os termos relevantes; preposições comuns são ignoradas. Use aspas para frase exata e OR explícito para alternativas. Informe o ano do julgamento em judgmentYear, separado do texto.'),
  court: z.string().optional(),
  judgmentYear: z.number().int().min(1989).refine((year) => year <= new Date().getUTCFullYear(), 'Ano do julgamento não pode estar no futuro').optional()
    .describe('Ano da data de julgamento. Por exemplo, 2026 limita o julgamento a 2026; omitido pesquisa todos os anos. Não substitua este filtro por um ano no texto de query.'),
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
export const CASE_LAW_SEARCH_TIMEOUT_MS = 45_000;

export function createSearchCaseLawTool(researchService: ResearchService): AgentTool<SearchCaseLawInput, SearchCaseLawOutput> {
  return {
    name: 'research.search_case_law',
    description:
      'Pesquisa jurisprudência oficial e precedentes qualificados em tribunais superiores com proveniência ancorada. Sem aspas exige todos os termos relevantes; use aspas para frase exata ou OR explícito para alternativas. Para restringir o ano do julgamento, envie judgmentYear separado de query.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: SearchCaseLawInputSchema,
    outputSchema: SearchCaseLawOutputSchema,
    timeoutMs: CASE_LAW_SEARCH_TIMEOUT_MS,
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
