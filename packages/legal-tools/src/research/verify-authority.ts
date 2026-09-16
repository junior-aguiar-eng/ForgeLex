import { z } from 'zod';
import { AgentTool, ToolExecutionContext, ToolExecutionResult } from '@forgelex/agent-core';
import { CaseLawSchema } from '@forgelex/domain';
import { ResearchService, createFixtureResearchService } from './research-service.js';

export const VerifyAuthorityInputSchema = z.object({
  court: z.string().min(2),
  processNumber: z.string().min(5),
  judgmentDate: z.string().optional(),
});

export type VerifyAuthorityInput = z.infer<typeof VerifyAuthorityInputSchema>;

export const VerifyAuthorityOutputSchema = z.object({
  status: z.enum([
    'VERIFIED_OFFICIAL',
    'VERIFIED_PROVIDER',
    'UNVERIFIED',
    'CONFLICTING_METADATA',
    'NOT_FOUND',
  ]),
  providerId: z.string().optional(),
  checkedAt: z.string().datetime(),
  authority: CaseLawSchema.optional(),
  reason: z.string().optional(),
});

export type VerifyAuthorityOutput = z.infer<typeof VerifyAuthorityOutputSchema>;

export function createVerifyAuthorityTool(
  researchService: ResearchService
): AgentTool<VerifyAuthorityInput, VerifyAuthorityOutput> {
  return {
    name: 'research.verify_authority',
    description: 'Confere a existência, a proveniência e a consistência dos metadados de uma autoridade judicial.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: VerifyAuthorityInputSchema,
    outputSchema: VerifyAuthorityOutputSchema,
    timeoutMs: 15000,
    execute: async (
      input: VerifyAuthorityInput,
      _context: ToolExecutionContext
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
export const verifyAuthorityTool = createVerifyAuthorityTool(createFixtureResearchService());
