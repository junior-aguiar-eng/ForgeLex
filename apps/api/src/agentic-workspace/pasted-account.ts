/**
 * E1b: no modo Automático (sem ação escolhida), um relato colado num caso vai para "Analisar fatos e provas",
 * que alimenta a aba Estrutura. Sem isso o orquestrador escolhe a ação sozinho e pode não analisar os fatos.
 * Só atua quando todas as condições valem; o usuário que escolheu uma ação nunca é sobrescrito.
 */
export const PASTED_ACCOUNT_MIN_CHARS = 600;

interface StartLike {
  objective: string;
  actionId?: string | undefined;
  matterId?: string | undefined;
  conversationId?: string | undefined;
  context?: { draft?: unknown; deskEdit?: unknown } | undefined;
}

export function routePastedAccount<T extends StartLike>(input: T): T {
  if (input.actionId || !input.matterId || input.conversationId) return input;
  if (input.context?.draft || input.context?.deskEdit) return input;
  const text = input.objective.trim();
  if (text.length < PASTED_ACCOUNT_MIN_CHARS || text.endsWith('?')) return input;
  return { ...input, actionId: 'analyze_evidence' };
}
