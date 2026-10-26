import type { AgentTool } from '@forgelex/agent-core';
import {
  LegislationRequestSchema,
  LegislationResultSchema,
  type LegislationRequest,
  type LegislationResult,
} from '@forgelex/legal-data';
import type { IndexedLegislationProvider } from '@forgelex/source-providers';

/** Factory only; never automatically registered in REST/MCP or the STJ gateway. */
export function createGetLegislationTool(
  provider: IndexedLegislationProvider,
): AgentTool<LegislationRequest, LegislationResult> {
  return {
    name: 'research.get_legislation',
    description:
      'Recupera dispositivo e versão de snapshot normativo delimitado. CURRENT é a versão indicada pelo catálogo; ON_DATE compara períodos registrados. Não determina aplicabilidade jurídica nem atualidade online.',
    impactLevel: 'L0_OBSERVATION',
    inputSchema: LegislationRequestSchema,
    outputSchema: LegislationResultSchema,
    timeoutMs: 15000,
    execute: async (input) => ({ success: true, data: await provider.retrieve(input) }),
  };
}
