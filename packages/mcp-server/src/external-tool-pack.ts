/**
 * Superfície MCP externa mínima. Tools internas só entram no pacote quando
 * forem adicionadas explicitamente a esta lista e registradas pelo gateway.
 * A lista representa capabilities realmente registradas no gateway, não um
 * catálogo aspiracional de ferramentas ainda sem provider.
 */
export const EXTERNAL_MCP_TOOL_NAMES = [
  'research.search_case_law',
  'research.get_authority',
  'research.verify_authority',
  'workflow.legal_research_memo',
] as const;

export type ExternalMcpToolName = (typeof EXTERNAL_MCP_TOOL_NAMES)[number];
