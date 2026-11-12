export function isCaseWorkspaceEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export const CASE_WORKSPACE_ENABLED = isCaseWorkspaceEnabled(import.meta.env.VITE_FORGELEX_CASE_WORKSPACE_ENABLED);
export const SAVED_RESEARCH_ENABLED = import.meta.env.VITE_FORGELEX_SAVED_RESEARCH_ENABLED === 'true';
export const AGENTIC_WORKSPACE_ENABLED = import.meta.env.VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED === 'true';

/** Existe uma só Mesa: a integrada. Ela exige a Mesa agêntica e os casos ligados; sem as duas, o app não mostra Mesa. */
export function isDeskEnabled(casesEnabled: boolean, workEnabled: boolean): boolean {
  return casesEnabled && workEnabled;
}
export const DESK_ENABLED = isDeskEnabled(CASE_WORKSPACE_ENABLED, AGENTIC_WORKSPACE_ENABLED);

/** Nova casca da Mesa (U2): atalhos no estado vazio. Desligada por padrão; ligada só com `true` exato. */
export const DESK_SHELL_ENABLED = import.meta.env.VITE_FORGELEX_DESK_SHELL === 'true';
