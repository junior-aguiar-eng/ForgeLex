import type { Question } from './execution-model';

export const guidanceFields = ['area', 'action', 'documentType', 'court'] as const;
export type GuidanceField = (typeof guidanceFields)[number];
export const guidanceLabels: Record<GuidanceField, string> = {
  area: 'Área',
  action: 'Tarefa',
  documentType: 'Peça',
  court: 'Tribunal',
};

export interface GuidanceDecision {
  value: string | null;
  status: 'known' | 'confirmed' | 'unknown' | 'proposed';
  question?: Question | null;
  /** Rótulo legível do valor (área, peça ou tribunal em uso). Nunca traz conteúdo, id interno ou hash de ficha. */
  label?: string;
  /** Texto digitado pelo usuário em vez de uma opção; só exibição, o estado segue `unknown`. */
  detail?: string;
}

export interface GuidanceState {
  conversationId: string;
  matterId: string | null;
  contextRevision: number;
  objective: string;
  description?: string;
  /** O tribunal só existe nas conversas com as regras mais novas (mesa-v3). */
  decisions: Record<Exclude<GuidanceField, 'court'>, GuidanceDecision> & { court?: GuidanceDecision };
  question: Question | null;
  history: { id: string; prompt: string; text: string }[];
}

export interface GuidanceStart {
  objective?: string;
  matterId?: string;
}

/** Campos que a conversa trouxe e que já tiveram pergunta: base do resumo e do "Alterar". */
export function askedGuidanceFields(state: GuidanceState): GuidanceField[] {
  return guidanceFields.filter((field) => Boolean(state.decisions[field]?.question));
}

/** Texto da linha recolhida do resumo: com o rótulo do campo quando só há o que o usuário digitou. */
export function guidanceSummaryText(state: GuidanceState, field: GuidanceField): string | undefined {
  const text = guidanceDecisionText(state, field);
  const decision = state.decisions[field];
  return text && decision && !decision.value && decision.detail ? `${guidanceLabels[field]}: ${text}` : text;
}

const pending: Record<GuidanceField, string> = {
  area: 'Área a definir',
  action: 'Tarefa a definir',
  documentType: 'Peça a definir',
  court: 'Tribunal a definir',
};

export function guidanceDecisionText(state: GuidanceState, field: GuidanceField): string | undefined {
  const decision = state.decisions[field];
  if (!decision?.question) return;
  const { value, question, detail, label, status } = decision;
  if (!value && detail) return `${detail}, a confirmar`;
  if (!value) return pending[field];
  const shown = label ?? question.options.find((option) => option.id === value)?.label;
  // A peça que a Mesa só propôs ainda não está em uso: espera a confirmação do cliente.
  return shown && status === 'proposed' ? `${shown}, a confirmar` : shown;
}
