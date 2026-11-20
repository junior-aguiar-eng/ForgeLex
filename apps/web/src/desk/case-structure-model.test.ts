import { describe, expect, it } from 'vitest';
import type { PresentedBlock } from '../agentic-workspace/present-delivery';
import { STRUCTURE_LEAD_TITLE, structureSections, structureSize } from './case-structure-model';

const block = (kind: PresentedBlock['kind'], text: string, extra: Partial<PresentedBlock> = {}): PresentedBlock => ({
  kind,
  text,
  citations: [],
  ...extra,
});

describe('structureSections', () => {
  it('agrupa os itens sob o cabeçalho que os antecede e mantém a classificação e as fontes', () => {
    const sections = structureSections([
      block('heading', 'Questões'),
      block('item', 'Há dano moral?', { citations: [1] }),
      block('heading', 'Afirmações'),
      block('item', 'O autor foi cobrado duas vezes.', { tag: 'Alegação', citations: [1, 2] }),
      block('item', 'A cobrança foi indevida.', { tag: 'Inferência', citations: [] }),
    ]);
    expect(sections.map((section) => section.title)).toEqual(['Questões', 'Afirmações']);
    expect(sections[1]?.entries).toEqual([
      { kind: 'item', text: 'O autor foi cobrado duas vezes.', tag: 'Alegação', citations: [1, 2] },
      { kind: 'item', text: 'A cobrança foi indevida.', tag: 'Inferência', citations: [] },
    ]);
  });

  it('o que vem antes de qualquer cabeçalho forma a primeira parte', () => {
    const sections = structureSections([
      block('paragraph', 'Resumo solto.'),
      block('heading', 'Cronologia'),
      block('item', '2021 — fato.'),
    ]);
    expect(sections.map((section) => section.title)).toEqual([STRUCTURE_LEAD_TITLE, 'Cronologia']);
  });

  it('cabeçalho sem itens embaixo não vira parte, e entrada vazia dá lista vazia', () => {
    expect(structureSections([block('heading', 'Contradições')])).toEqual([]);
    expect(structureSections([])).toEqual([]);
  });
});

describe('structureSize', () => {
  it('conta os itens, não os cabeçalhos', () => {
    const sections = structureSections([
      block('heading', 'A'),
      block('item', '1'),
      block('item', '2'),
      block('heading', 'B'),
      block('item', '3'),
    ]);
    expect(structureSize(sections)).toBe(3);
  });
});
