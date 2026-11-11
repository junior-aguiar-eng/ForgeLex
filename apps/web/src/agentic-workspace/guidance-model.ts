import type { Question } from './execution-model';

export const guidanceFields = ['area', 'action', 'documentType'] as const;
export type GuidanceField = (typeof guidanceFields)[number];
export const guidanceLabels: Record<GuidanceField, string> = {
  area: 'Área',
  action: 'Tarefa',
  documentType: 'Peça',
};

export interface GuidanceState {
  conversationId: string;
  matterId: string | null;
  contextRevision: number;
  objective: string;
  description?: string;
  decisions: Record<
    GuidanceField,
    {
      value: string | null;
      status: 'known' | 'confirmed' | 'unknown' | 'proposed';
      question?: Question | null;
      /** Texto digitado pelo usuário em vez de uma opção; só exibição, o estado segue `unknown`. */
      detail?: string;
    }
  >;
  question: Question | null;
  history: { id: string; prompt: string; text: string }[];
}

export interface GuidanceStart {
  objective?: string;
  matterId?: string;
}

/** Texto da linha recolhida do resumo: com o rótulo do campo quando só há o que o usuário digitou. */
export function guidanceSummaryText(state: GuidanceState, field: GuidanceField): string | undefined {
  const text = guidanceDecisionText(state, field);
  const { value, detail } = state.decisions[field];
  return text && !value && detail ? `${guidanceLabels[field]}: ${text}` : text;
}

export function guidanceDecisionText(state: GuidanceState, field: GuidanceField): string | undefined {
  const { value, question, detail } = state.decisions[field];
  if (!question) return;
  if (!value && detail) return `${detail}, a confirmar`;
  if (!value) return field === 'area' ? 'Área a definir' : field === 'action' ? 'Tarefa a definir' : 'Peça a definir';
  return question.options.find((option) => option.id === value)?.label;
}
