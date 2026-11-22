import { describe, expect, it } from 'vitest';
import {
  GUIDANCE_NO_SUPPORT_NOTE,
  guidanceDecisionText,
  guidanceSummaryText,
  guidanceSupportNote,
  type GuidanceState,
} from './guidance-model';

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

describe('aviso de que não há apoio específico para a peça (U3/U4)', () => {
  const empty = { value: null, status: 'unknown' as const };
  const court = { value: null, status: 'unknown' as const, question };
  const withPiece = (
    documentType: GuidanceState['decisions']['documentType'],
    extra: Partial<GuidanceState['decisions']> = { court },
  ): GuidanceState => ({
    conversationId: 'C',
    matterId: null,
    contextRevision: 2,
    objective: '',
    decisions: {
      area: { value: 'penal', status: 'confirmed', question, label: 'Penal' },
      action: { value: 'create_document', status: 'confirmed', question },
      documentType,
      ...extra,
    },
    question: null,
    history: [],
  });

  it('avisa quando o cliente explicou a peça em texto e nenhuma do catálogo serviu', () => {
    const typed = withPiece({ ...empty, question, detail: 'moção de congratulações' });
    expect(guidanceSupportNote(typed)).toBe(GUIDANCE_NO_SUPPORT_NOTE);
  });

  it('o texto do aviso diz que o pedido segue e que o resultado deve ser conferido', () => {
    expect(GUIDANCE_NO_SUPPORT_NOTE).toMatch(/orientação específica/);
    expect(GUIDANCE_NO_SUPPORT_NOTE).toMatch(/seguir/);
    expect(GUIDANCE_NO_SUPPORT_NOTE).toMatch(/confira/i);
  });

  it('não avisa quando o cliente disse que não sabe a peça: ainda não há o que dizer sobre apoio', () => {
    expect(guidanceSupportNote(withPiece({ ...empty, question }))).toBeUndefined();
  });

  it('não avisa quando há peça proposta ou confirmada, mesmo com texto digitado antes', () => {
    const proposed = { value: 'resposta-acusacao', status: 'proposed' as const, question, detail: 'resposta' };
    expect(guidanceSupportNote(withPiece(proposed))).toBeUndefined();
    expect(guidanceSupportNote(withPiece({ ...proposed, status: 'confirmed' }))).toBeUndefined();
  });

  it('não avisa se a peça nunca foi perguntada', () => {
    expect(guidanceSupportNote(withPiece({ ...empty, detail: 'texto' }))).toBeUndefined();
  });

  it('só vale na mesa-v3, a única que propõe peças do catálogo (o tribunal só existe nela)', () => {
    const typed = { ...empty, question, detail: 'moção de congratulações' };
    expect(guidanceSupportNote(withPiece(typed, {}))).toBeUndefined();
  });
});
