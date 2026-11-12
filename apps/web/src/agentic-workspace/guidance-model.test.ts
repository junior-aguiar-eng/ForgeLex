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

describe('mesa-v3 no resumo da orientação', () => {
  const empty = { value: null, status: 'unknown' as const };
  const v3 = (
    court?: GuidanceState['decisions']['court'],
    documentType: GuidanceState['decisions']['documentType'] = empty,
  ): GuidanceState => ({
    conversationId: 'C',
    matterId: null,
    contextRevision: 2,
    objective: '',
    decisions: {
      area: { value: 'processo-penal', status: 'confirmed', question, label: 'Processo penal' },
      action: empty,
      documentType: { ...documentType, question },
      ...(court ? { court } : {}),
    },
    question: null,
    history: [],
  });

  it('usa o rótulo legível da área, mesmo sem a opção na pergunta guardada', () => {
    expect(guidanceDecisionText(v3(), 'area')).toBe('Processo penal');
  });

  it('a peça só proposta espera confirmação; a confirmada aparece como peça em uso', () => {
    const proposed = { value: 'resposta-acusacao', status: 'proposed' as const, label: 'Resposta à acusação' };
    expect(guidanceDecisionText(v3(undefined, proposed), 'documentType')).toBe('Resposta à acusação, a confirmar');
    const confirmed = { ...proposed, status: 'confirmed' as const };
    expect(guidanceDecisionText(v3(undefined, confirmed), 'documentType')).toBe('Resposta à acusação');
  });

  it('o tribunal aparece só quando a conversa o traz', () => {
    expect(guidanceDecisionText(v3(), 'court')).toBeUndefined();
    const court = { value: 'tj-al', status: 'confirmed' as const, question, label: 'TJ-AL' };
    expect(guidanceDecisionText(v3(court), 'court')).toBe('TJ-AL');
    expect(guidanceSummaryText(v3({ ...court, value: null, status: 'unknown', label: undefined }), 'court')).toBe(
      'Tribunal a definir',
    );
  });
});
