/** Valor em reais a partir de centavos, no formato do Brasil (R$ 84,60). */
export const formatBRL = (cents: number): string =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
