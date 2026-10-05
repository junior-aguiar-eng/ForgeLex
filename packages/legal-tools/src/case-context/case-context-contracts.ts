export const CASE_CONTEXT_TOOL_NAMES = ['case.list_shared', 'case.get_context', 'case.read_item'] as const;
export function isCaseContextTool(name: string) {
  return (CASE_CONTEXT_TOOL_NAMES as readonly string[]).includes(name);
}
export function getCaseContextToolContract(name: string) {
  if (!isCaseContextTool(name)) return undefined;
  return {
    name,
    contractVersion: '1.0.0',
    operationKind: 'OBSERVATION',
    impactLevel: 'L0_OBSERVATION',
    billing: { mode: 'FREE', costCents: 0 },
    preconditions: ['Identidade OAuth autenticada.', 'Autorização explícita do caso e seleção.'],
    limits: { timeoutMs: 15000, maxResponseBytes: 24576 },
    provenance: { source: 'case_record', verified: false },
  };
}
