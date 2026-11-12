import { describe, expect, it } from 'vitest';
import { guidanceDecisionText, guidanceSummaryText, type GuidanceState } from './guidance-model';

const question = {
  id: 'area:1',
  version: 1,
  contextRevision: 1,
  prompt: 'Em qual área você precisa trabalhar?',
  selection: 'single' as const,
  options: [{ id: 'penal', label: 'Penal' }],
  allowFreeText: true,
  allowUnknown: true,
  reason: 'Delimitar o pedido',
};

function state(area: GuidanceState['decisions']['area']): GuidanceState {
  const empty = { value: null, status: 'unknown' as const };
  return {
    conversationId: 'C',
    matterId: null,
    contextRevision: 2,
    objective: '',
    decisions: { area, action: empty, documentType: empty },
    question: null,
    history: [],
  };
}

describe('texto do resumo da orientação', () => {
  it('mostra o que o usuário digitou como pendente de confirmação', () => {
    const typed = state({ value: null, status: 'unknown', question, detail: 'previdenciário' });
    expect(guidanceDecisionText(typed, 'area')).toBe('previdenciário, a confirmar');
    expect(guidanceSummaryText(typed, 'area')).toBe('Área: previdenciário, a confirmar');
  });

  it('mantém "a definir" sem texto digitado e o rótulo da opção quando escolhida', () => {
    expect(guidanceSummaryText(state({ value: null, status: 'unknown', question }), 'area')).toBe('Área a definir');
    expect(guidanceSummaryText(state({ value: 'penal', status: 'confirmed', question }), 'area')).toBe('Penal');
  });
});
