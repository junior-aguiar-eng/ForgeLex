import { describe, expect, it } from 'vitest';
import { structureReadingLine, type StructureReview, type StructureReviewItem } from './case-structure-model';

describe('structureReadingLine (E3)', () => {
  const it0 = (id: string, kind: StructureReviewItem['kind']): StructureReviewItem => ({
    id: id.repeat(64),
    kind,
    text: 'Texto sintético.',
    originIds: [],
    references: [],
  });
  const decision = (action: 'ADOPT' | 'DISCARD') => ({ action, text: 'x' });
  it('conta fatos não retirados e itens ainda sem decisão, sem contar lacunas', () => {
    const review: StructureReview = {
      items: [it0('a', 'FACT'), it0('b', 'FACT'), it0('c', 'FACT'), it0('d', 'EVIDENCE'), it0('e', 'GAP')],
      decisions: { ['a'.repeat(64)]: decision('ADOPT'), ['c'.repeat(64)]: decision('DISCARD') },
    };
    expect(structureReadingLine(review)).toBe('Estrutura do caso: 2 fatos, 2 itens a confirmar');
  });
  it('tudo decidido vira "tudo conferido"; singular em fato e item', () => {
    expect(
      structureReadingLine({ items: [it0('a', 'FACT')], decisions: { ['a'.repeat(64)]: decision('ADOPT') } }),
    ).toBe('Estrutura do caso: 1 fato, tudo conferido');
    expect(structureReadingLine({ items: [it0('a', 'EVIDENCE')], decisions: {} })).toBe(
      'Estrutura do caso: 1 item a confirmar',
    );
  });
  it('sem itens, ou só com lacunas ou itens retirados, não há linha', () => {
    expect(structureReadingLine(undefined)).toBeUndefined();
    expect(structureReadingLine({ items: [], decisions: {} })).toBeUndefined();
    expect(structureReadingLine({ items: [it0('a', 'GAP')], decisions: {} })).toBeUndefined();
    expect(
      structureReadingLine({ items: [it0('a', 'FACT')], decisions: { ['a'.repeat(64)]: decision('DISCARD') } }),
    ).toBeUndefined();
  });
});
