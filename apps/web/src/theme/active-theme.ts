/**
 * Tema ativo da página (V1). O script do `index.html` escreve `data-theme` no `<html>` antes da primeira pintura e o
 * valor não muda até a página recarregar, então ler o atributo basta. Só `gelo` liga o tema gelo; sem documento, sem
 * atributo ou com qualquer outro valor, vale o clássico. A casca nova da V2 existe só no gelo: o clássico fica como está.
 */

export type Theme = 'classico' | 'gelo';

export function themeFromAttribute(value: string | null | undefined): Theme {
  return value === 'gelo' ? 'gelo' : 'classico';
}

export function activeTheme(): Theme {
  if (typeof document === 'undefined') return 'classico';
  return themeFromAttribute(document.documentElement?.getAttribute?.('data-theme'));
}
