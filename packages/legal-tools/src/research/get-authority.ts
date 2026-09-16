import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '@forgelex/agent-core';
import { ResearchService, createFixtureResearchService } from './research-service.js';
import {
  VerifyAuthorityInput,
  VerifyAuthorityInputSchema,
  VerifyAuthorityOutput,
  VerifyAuthorityOutputSchema,
} from './verify-authority.js';

export function createGetAuthorityTool(
  researchService: ResearchService,
): AgentTool<VerifyAuthorityInput, VerifyAuthorityOutput> {
  return {
    name: 'research.get_authority',
    description: 'Obtém uma autoridade judicial identificada e devolve seu status de verificação e proveniência.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: VerifyAuthorityInputSchema,
    outputSchema: VerifyAuthorityOutputSchema,
    timeoutMs: 15000,
    execute: async (
      input: VerifyAuthorityInput,
      _context: ToolExecutionContext,
    ): Promise<ToolExecutionResult<VerifyAuthorityOutput>> => {
      const data = await researchService.verifyAuthority(input);
      return {
        success: true,
        data,
        provenance: data.authority ? [data.authority.provenance] : undefined,
      };
    },
  };
}

/** Provider de fixtures mantido para testes e workflows determinísticos. */
export const getAuthorityTool = createGetAuthorityTool(createFixtureResearchService());
