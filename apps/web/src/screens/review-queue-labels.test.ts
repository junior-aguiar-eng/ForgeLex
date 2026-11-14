import { describe, expect, it } from 'vitest';
import { formatReviewDate, pendingCountLabel, reviewKindLabel } from './review-queue-model';

describe('textos da fila de revisão', () => {
  it('nunca mostra o identificador interno do tipo ao cliente', () => {
    expect(reviewKindLabel('RESEARCH_MEMO')).toBe('Memorando de pesquisa');
    expect(reviewKindLabel('DRAFT')).toBe('Minuta');
    expect(reviewKindLabel('QUALQUER_OUTRO')).toBe('Item para revisão');
  });

  it('usa singular e plural', () => {
    expect(pendingCountLabel(1)).toBe('1 pendente');
    expect(pendingCountLabel(2)).toBe('2 pendentes');
  });

  it('formata a data no horário local, sem o texto ISO', () => {
    const text = formatReviewDate('2026-11-13T23:30:01.122Z');
    expect(text).toMatch(/^\d{2}\/\d{2},? \d{2}:\d{2}$/);
    expect(text).not.toContain('T23');
  });

  it('devolve o valor original quando a data é inválida', () => {
    expect(formatReviewDate('sem data')).toBe('sem data');
  });
});
