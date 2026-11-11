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
    }
  >;
  question: Question | null;
  history: { id: string; prompt: string; text: string }[];
}

export interface GuidanceStart {
  objective?: string;
  matterId?: string;
}

export function guidanceDecisionText(state: GuidanceState, field: GuidanceField): string | undefined {
  const { value, question } = state.decisions[field];
  if (!question) return;
  if (!value) return field === 'area' ? 'Área a definir' : field === 'action' ? 'Tarefa a definir' : 'Peça a definir';
  return question.options.find((option) => option.id === value)?.label;
}
