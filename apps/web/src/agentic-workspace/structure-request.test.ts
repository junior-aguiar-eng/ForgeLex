import { describe, expect, it } from 'vitest';
import { adjustsStructure, structureAdjustInput } from './structure-request';

const MATTER = '00000000-0000-4000-8000-000000000001';

describe('adjustsStructure', () => {
  it('com a aba Estrutura ativa e o modo Automático, o pedido é um ajuste da estrutura', () => {
    expect(adjustsStructure({ structureTabActive: true, guided: false, matterId: MATTER })).toBe(true);
  });

  it('com a aba inativa (ou sem a informação), nada muda', () => {
    expect(adjustsStructure({ structureTabActive: false, guided: false, matterId: MATTER })).toBe(false);
    expect(adjustsStructure({ guided: false, matterId: MATTER })).toBe(false);
  });

  it('a ação que o usuário escolheu no seletor nunca é sobrescrita', () => {
    for (const chosenAction of ['analyze_evidence', 'create_document', 'research_question'] as const)
      expect(adjustsStructure({ structureTabActive: true, guided: false, matterId: MATTER, chosenAction })).toBe(false);
  });

  it('sem caso ou dentro da orientação guiada, não vira ajuste', () => {
    expect(adjustsStructure({ structureTabActive: true, guided: false, matterId: '' })).toBe(false);
    expect(adjustsStructure({ structureTabActive: true, guided: true, matterId: MATTER })).toBe(false);
  });
});

describe('structureAdjustInput', () => {
  it('envia adjust_structure com o caso da peça, numa conversa nova (sem conversa nem revisão de contexto)', () => {
    const input = structureAdjustInput({
      objective: 'o fato 2 foi em 2021',
      matterId: MATTER,
      text: 'o fato 2 foi em 2021',
    });
    expect(input).toEqual({
      objective: 'o fato 2 foi em 2021',
      actionId: 'adjust_structure',
      matterId: MATTER,
      context: { text: 'o fato 2 foi em 2021', origin: 'USER', documents: [] },
    });
    expect(input).not.toHaveProperty('conversationId');
    expect(input).not.toHaveProperty('contextRevision');
    expect(input).not.toHaveProperty('useGuidance');
  });

  it('correção longa (700 caracteres) continua indo como ajuste explícito, nunca como relato colado', () => {
    const correction =
      `Corrija a estrutura: ${'o fato 2 aconteceu em 2021, não em 2020, e a prova 1 não serve. '.repeat(11)}`.slice(
        0,
        700,
      );
    expect(correction).toHaveLength(700);
    const input = structureAdjustInput({ objective: correction, matterId: MATTER, text: correction });
    expect(input.actionId).toBe('adjust_structure');
    expect(input.matterId).toBe(MATTER);
    expect(input.conversationId).toBeUndefined();
  });
});
