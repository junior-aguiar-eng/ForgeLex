import { describe, expect, it } from 'vitest';
import { matchesSearch } from './option-search';

describe('busca nas opções', () => {
  it('ignora acento, caixa e espaços nas pontas', () => {
    expect(matchesSearch('Família e sucessões', ' familia ')).toBe(true);
    expect(matchesSearch('Diversidade e direitos humanos', 'DIREITOS')).toBe(true);
    expect(matchesSearch('Penal', 'processo')).toBe(false);
    expect(matchesSearch('Penal', '')).toBe(true);
  });
});
