export function isCaseWorkspaceEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export const CASE_WORKSPACE_ENABLED = isCaseWorkspaceEnabled(import.meta.env.VITE_FORGELEX_CASE_WORKSPACE_ENABLED);
export const SAVED_RESEARCH_ENABLED = import.meta.env.VITE_FORGELEX_SAVED_RESEARCH_ENABLED === 'true';
export const AGENTIC_WORKSPACE_ENABLED = import.meta.env.VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED === 'true';
