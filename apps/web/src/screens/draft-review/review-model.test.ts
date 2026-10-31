import { describe, expect, it } from 'vitest';
import { reviewSummary, reviewCheckLabel, groupReviewChecks } from './review-model';
describe('Linguagem da conferência', () => {
  it('prioriza pendências preservando cada destino e as confirmações', () => {
    const checks = [
      { state: 'CONFIRMED', targetId: 'doc1' },
      { state: 'ATTENTION', targetId: 'fact1' },
      { state: 'ATTENTION', targetId: 'fact2' },
      { state: 'UNAVAILABLE', targetId: 'doc2' },
    ] as never;
    const groups = groupReviewChecks(checks);
    expect(groups.attention.map((c) => c.targetId)).toEqual(['fact1', 'fact2', 'doc2']);
    expect(groups.confirmed.map((c) => c.targetId)).toEqual(['doc1']);
  });
  it('distingue pendência, indisponibilidade e conclusão sem códigos internos', () => {
    expect(reviewSummary()).toBe('Conferência pendente');
    expect(reviewSummary({ state: 'INCOMPLETE', status: 'INCOMPLETE' } as never)).toBe(
      'Não foi possível concluir a conferência',
    );
    expect(reviewSummary({ state: 'COMPLETE', status: 'PASSED' } as never)).toBe('Conferência concluída');
    expect(reviewCheckLabel({ code: 'AUTHORITY_NOT_FOUND', state: 'ATTENTION' } as never)).toBe(
      'Não localizada no acervo',
    );
  });
});
