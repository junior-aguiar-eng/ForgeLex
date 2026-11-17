import { describe, expect, it } from 'vitest';
import {
  buildPalette,
  compositeOver,
  contrastRatio,
  evaluatePairs,
  extractPairs,
  parseThemeVariables,
  tripleToRgb,
} from './theme-contrast-lib.mjs';

describe('contrastRatio', () => {
  it('segue a fórmula da WCAG', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    // #767676 sobre branco é o limite clássico de 4,5:1 (4,54).
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
  });

  it('não depende da ordem dos argumentos', () => {
    expect(contrastRatio([16, 22, 25], [244, 247, 248])).toBe(contrastRatio([244, 247, 248], [16, 22, 25]));
  });
});

describe('compositeOver', () => {
  it('mistura a cor com o fundo conforme a transparência', () => {
    expect(compositeOver([0, 0, 0], 0.5, [255, 255, 255])).toEqual([128, 128, 128]);
    expect(compositeOver([10, 20, 30], 1, [255, 255, 255])).toEqual([10, 20, 30]);
    expect(compositeOver([10, 20, 30], 0, [255, 255, 255])).toEqual([255, 255, 255]);
  });
});

describe('parseThemeVariables', () => {
  const css = `
    :root { --fl-canvas: 251 249 245; --fl-ink: 45 39 33; }
    [data-theme="gelo"] { --fl-canvas: 244 247 248; }
    .outra { --fl-canvas: 1 1 1; }
  `;

  it('lê as variáveis do tema padrão', () => {
    expect(parseThemeVariables(css, 'classico').get('canvas')).toBe('251 249 245');
  });

  it('o tema gelo sobrepõe o que define e herda o resto do padrão', () => {
    const gelo = parseThemeVariables(css, 'gelo');
    expect(gelo.get('canvas')).toBe('244 247 248');
    expect(gelo.get('ink')).toBe('45 39 33');
  });

  it('converte "R G B" em cor', () => {
    expect(tripleToRgb('244 247 248')).toEqual([244, 247, 248]);
  });
});

describe('buildPalette', () => {
  const config = {
    cognac: { 600: 'rgb(var(--fl-cognac-600) / <alpha-value>)' },
    canvas: 'rgb(var(--fl-canvas) / <alpha-value>)',
    champagne: { border: 'rgb(var(--fl-champagne-line) / 0.22)' },
  };
  const defaults = { red: { 700: '#b91c1c' }, white: '#ffffff' };
  const variables = new Map([
    ['cognac-600', '142 93 42'],
    ['canvas', '251 249 245'],
    ['champagne-line', '180 150 110'],
  ]);

  it('resolve variáveis, mantém a paleta padrão do Tailwind e guarda a transparência fixa', () => {
    const palette = buildPalette(config, defaults, variables);
    expect(palette.get('cognac-600')).toEqual({ rgb: [142, 93, 42], alpha: 1 });
    expect(palette.get('canvas')).toEqual({ rgb: [251, 249, 245], alpha: 1 });
    expect(palette.get('red-700')).toEqual({ rgb: [185, 28, 28], alpha: 1 });
    expect(palette.get('white')).toEqual({ rgb: [255, 255, 255], alpha: 1 });
    expect(palette.get('champagne-border')).toEqual({ rgb: [180, 150, 110], alpha: 0.22 });
  });
});

describe('extractPairs', () => {
  it('forma o par texto e fundo de uma mesma lista de classes', () => {
    expect(extractPairs('<p className="text-stone-600 bg-amber-50 p-2">x</p>')).toEqual([
      { text: 'stone-600', bg: 'amber-50', bgAlpha: 1 },
    ]);
  });

  it('texto sem fundo explícito vale sobre os dois fundos de página', () => {
    expect(extractPairs('<p className="text-stone-500 text-xs">x</p>')).toEqual([
      { text: 'stone-500', bg: 'canvas', bgAlpha: 1 },
      { text: 'stone-500', bg: 'surface', bgAlpha: 1 },
    ]);
  });

  it('guarda a transparência do fundo e ignora o que não é cor', () => {
    expect(extractPairs('<b className="bg-amber-100/50 text-sm font-bold text-amber-900">x</b>')).toEqual([
      { text: 'amber-900', bg: 'amber-100', bgAlpha: 0.5 },
    ]);
  });

  it('ignora variantes (hover, foco, telas), que o script não avalia', () => {
    expect(extractPairs('<a className="hover:text-red-700 md:bg-stone-100">x</a>')).toEqual([]);
  });

  it('em um modelo com condição, combina a parte fixa com cada alternativa e nunca as alternativas entre si', () => {
    const source =
      "<i className={`p-2 text-stone-700 ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>x</i>";
    const pairs = extractPairs(source);
    expect(pairs).toContainEqual({ text: 'emerald-800', bg: 'emerald-50', bgAlpha: 1 });
    expect(pairs).toContainEqual({ text: 'red-800', bg: 'red-50', bgAlpha: 1 });
    expect(pairs).not.toContainEqual({ text: 'emerald-800', bg: 'red-50', bgAlpha: 1 });
    expect(pairs).not.toContainEqual({ text: 'red-800', bg: 'emerald-50', bgAlpha: 1 });
  });
});

describe('evaluatePairs', () => {
  const palette = (entries: Record<string, [number, number, number]>) =>
    new Map(Object.entries(entries).map(([name, rgb]) => [name, { rgb, alpha: 1 }]));

  it('calcula a razão de cada par em cada tema e conta as ocorrências', () => {
    const themes = {
      a: palette({ 'stone-900': [0, 0, 0], canvas: [255, 255, 255] }),
      b: palette({ 'stone-900': [119, 119, 119], canvas: [255, 255, 255] }),
    };
    const rows = evaluatePairs(
      [
        { text: 'stone-900', bg: 'canvas', bgAlpha: 1 },
        { text: 'stone-900', bg: 'canvas', bgAlpha: 1 },
      ],
      themes,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.count).toBe(2);
    expect(rows[0]!.ratios.a).toBeCloseTo(21, 3);
    expect(rows[0]!.ratios.b).toBeCloseTo(4.48, 1);
  });

  it('descarta par com cor que o tema não conhece', () => {
    const themes = { a: palette({ canvas: [255, 255, 255] }) };
    expect(evaluatePairs([{ text: 'stone-900', bg: 'canvas', bgAlpha: 1 }], themes)).toEqual([]);
  });

  it('com fundo translúcido, compõe sobre o branco antes de medir', () => {
    const themes = { a: palette({ 'stone-900': [0, 0, 0], 'amber-100': [0, 0, 0] }) };
    const [row] = evaluatePairs([{ text: 'stone-900', bg: 'amber-100', bgAlpha: 0.5 }], themes);
    // Fundo preto a 50% sobre branco vira cinza 128: o texto preto mede cerca de 5,3.
    expect(row!.ratios.a).toBeCloseTo(5.3, 1);
  });
});
