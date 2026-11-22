import { describe, expect, it } from 'vitest';
import {
  STRUCTURE_COMPOSER_PLACEHOLDER,
  adjustsStructure,
  pieceStructureTabActive,
  structureAdjustInput,
  structureRefreshKey,
} from './structure-request';

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
    const input = structureAdjustInput({ objective: correction, matterId: MATTER });
    expect(input.actionId).toBe('adjust_structure');
    expect(input.matterId).toBe(MATTER);
    expect(input.conversationId).toBeUndefined();
  });
});

describe('pieceStructureTabActive', () => {
  const base = { ice: true, tab: 'estrutura', matterId: MATTER, ready: true };
  it('só vale com a aba Estrutura aberta e uma estrutura já carregada', () => {
    expect(pieceStructureTabActive(base)).toBe(true);
  });
  it('aba vazia, carregando ou com falha não ativa o ajuste: o pedido segue o fluxo normal (E1/E1b)', () => {
    expect(pieceStructureTabActive({ ...base, ready: false })).toBe(false);
  });
  it('outra aba, sem caso ou fora do tema gelo também não', () => {
    expect(pieceStructureTabActive({ ...base, tab: 'texto' })).toBe(false);
    expect(pieceStructureTabActive({ ...base, matterId: null })).toBe(false);
    expect(pieceStructureTabActive({ ...base, ice: false })).toBe(false);
  });
});

describe('o ajuste leva só as palavras do usuário', () => {
  it('o contexto é o próprio pedido, sem anexos nem matérias indicadas', () => {
    const input = structureAdjustInput({ objective: 'tire a P2', matterId: MATTER });
    expect(input.context).toEqual({ text: 'tire a P2', origin: 'USER', documents: [] });
  });
});

describe('structureRefreshKey', () => {
  const run = { id: 'run-1', actionId: 'adjust_structure', status: 'COMPLETED', matterId: MATTER } as const;
  it('um ajuste concluído pede para recarregar a aba', () => {
    expect(structureRefreshKey(run)).toBe('run-1');
  });
  it('ajuste em andamento, outra ação ou sem caso não', () => {
    expect(structureRefreshKey({ ...run, status: 'RUNNING' })).toBeUndefined();
    expect(structureRefreshKey({ ...run, actionId: 'analyze_evidence' })).toBeUndefined();
    expect(structureRefreshKey({ ...run, matterId: null })).toBeUndefined();
  });
});

describe('dica do campo de pedido', () => {
  it('diz, em texto, que o pedido corrige a estrutura do caso', () => {
    expect(STRUCTURE_COMPOSER_PLACEHOLDER).toMatch(/^Corrija a estrutura do caso/);
    expect(STRUCTURE_COMPOSER_PLACEHOLDER).not.toMatch(/[A-Z_]{6,}/);
  });
});
