import { describe, expect, it } from 'vitest';
import { reviewSummary, reviewCheckLabel } from './review-model';
describe('Linguagem da conferência', () => {
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
