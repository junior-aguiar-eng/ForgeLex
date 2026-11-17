import { describe, expect, it } from 'vitest';
import { formatBRL } from './format';

describe('formatBRL', () => {
  it('formata centavos em reais, com vírgula e o símbolo', () => {
    // O espaço entre o símbolo e o valor não quebra a linha; troco por espaço comum para comparar.
    const text = (cents: number) => formatBRL(cents).replace(/\u00a0/g, ' ');
    expect(text(8460)).toBe('R$ 84,60');
    expect(text(20)).toBe('R$ 0,20');
    expect(text(0)).toBe('R$ 0,00');
    expect(text(123456)).toBe('R$ 1.234,56');
  });
});
