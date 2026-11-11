export function caseTaskResearchCapabilities(tools: readonly { name: string; impactLevel: string }[]) {
  const registered = new Set(
    tools.filter((tool) => ['L0_OBSERVATION', 'L1_ANALYSIS'].includes(tool.impactLevel)).map((tool) => tool.name),
  );
  return {
    caseLaw: registered.has('research.search_case_law'),
    legislation: registered.has('research.get_legislation'),
  };
}
