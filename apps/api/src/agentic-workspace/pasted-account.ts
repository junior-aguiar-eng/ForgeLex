/**
 * E1b: no modo Automático (sem ação escolhida), um relato colado num caso vai para "Analisar fatos e provas",
 * que alimenta a aba Estrutura. Sem isso o orquestrador escolhe a ação sozinho e pode não analisar os fatos.
 * Só atua quando todas as condições valem; o usuário que escolheu uma ação nunca é sobrescrito.
 */
import { hasAttachmentText } from '@forgelex/domain';

export const PASTED_ACCOUNT_MIN_CHARS = 600;

interface StartLike {
  objective: string;
  actionId?: string | undefined;
  matterId?: string | undefined;
  conversationId?: string | undefined;
  context?: { text?: string | undefined; draft?: unknown; deskEdit?: unknown } | undefined;
}

/** E4: o pedido traz ao menos um anexo com texto extraído no contexto escrito. */
export const startHasAttachmentText = (input: StartLike) => hasAttachmentText(input.context?.text);

/**
 * Relato colado (E1b) ou anexo com texto (E4): em Automático, num caso, sem conversa anterior nem peça aberta, e sem
 * pergunta no fim, o pedido vira análise de fatos e provas. O anexo dispensa o tamanho mínimo do objetivo.
 */
export function routeCaseInput<T extends StartLike>(input: T): T {
  if (input.actionId || !input.matterId || input.conversationId) return input;
  if (input.context?.draft || input.context?.deskEdit) return input;
  const text = input.objective.trim();
  if (text.endsWith('?')) return input;
  if (text.length < PASTED_ACCOUNT_MIN_CHARS && !startHasAttachmentText(input)) return input;
  return { ...input, actionId: 'analyze_evidence' };
}

export const routePastedAccount = routeCaseInput;
