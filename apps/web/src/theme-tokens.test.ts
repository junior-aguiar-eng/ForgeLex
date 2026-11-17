import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * V0 e V1: toda cor, fonte e raio do app vêm de variáveis CSS (`--fl-*`). O tema `classico` guarda os valores de sempre e
 * o tema `gelo` (seção 7.1 do plano) os troca. Este arquivo trava os dois temas e impede que literais de cor voltem.
 */

const webRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(webRoot, 'src');
const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');

const config = (await import(pathToFileURL(join(webRoot, 'tailwind.config.js')).href)).default as {
  theme: {
    extend: {
      colors: Record<string, unknown>;
      boxShadow: Record<string, string>;
      fontFamily: Record<string, string[]>;
    };
  };
};
const colors = config.theme.extend.colors;

type Theme = 'classico' | 'gelo';

function blockOf(selector: RegExp): string {
  const match = selector.exec(css);
  expect(match, `bloco não encontrado: ${selector}`).not.toBeNull();
  return match![1]!;
}
const rootBlock = () => blockOf(/:root\s*\{([^}]*)\}/);
const geloBlock = () => blockOf(/\[data-theme="gelo"\]\s*\{([^}]*)\}/);

/** Todas as variáveis `--fl-*` de um bloco, com o valor como está escrito. */
function declared(block: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/--fl-([a-z0-9-]+):\s*([^;]+);/g)) found.set(name!, value!.trim());
  return found;
}

/** O tema clássico é o bloco `:root`; o gelo sobrepõe o que define e herda o resto. */
function variablesFor(theme: Theme): Map<string, string> {
  const variables = declared(rootBlock());
  if (theme === 'gelo') for (const [name, value] of declared(geloBlock())) variables.set(name, value);
  return variables;
}

const toHex = (triple: string) =>
  `#${triple
    .split(' ')
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')}`;

/** `rgb(var(--fl-x) / <alpha-value>)` vira `#rrggbb`; com alpha fixo, `#rrggbb/0.22`. */
function resolveColor(value: unknown, theme: Theme): string {
  expect(typeof value).toBe('string');
  const match = /^rgb\(var\(--fl-([a-z0-9-]+)\) \/ (<alpha-value>|[\d.]+)\)$/.exec(value as string);
  expect(match, `valor fora do padrão: ${String(value)}`).not.toBeNull();
  const triple = variablesFor(theme).get(match![1]!);
  expect(triple, `variável --fl-${match![1]} sem definição em index.css`).toBeDefined();
  expect(triple, `--fl-${match![1]} não é "R G B"`).toMatch(/^\d+ \d+ \d+$/);
  return match![2] === '<alpha-value>' ? toHex(triple!) : `${toHex(triple!)}/${match![2]}`;
}

const resolveGroup = (group: unknown, theme: Theme) =>
  Object.fromEntries(
    Object.entries(group as Record<string, unknown>).map(([tone, value]) => [tone, resolveColor(value, theme)]),
  );

const STONE_CLASSICO = {
  50: '#fafaf9',
  100: '#f5f5f4',
  200: '#e7e5e4',
  300: '#d6d3d1',
  400: '#a8a29e',
  500: '#78716c',
  600: '#57534e',
  700: '#44403c',
  800: '#292524',
  900: '#1c1917',
  950: '#0c0a09',
};
const AMBER = {
  50: '#fffbeb',
  100: '#fef3c7',
  200: '#fde68a',
  300: '#fcd34d',
  600: '#d97706',
  700: '#b45309',
  800: '#92400e',
  900: '#78350f',
};

describe('tema clássico: valores iguais aos de antes da migração', () => {
  it('ivory', () => {
    expect(resolveGroup(colors.ivory, 'classico')).toEqual({
      50: '#fcfbf8',
      100: '#f8f6f0',
      200: '#f2efe8',
      300: '#e7e2d6',
    });
  });

  it('cognac', () => {
    expect(resolveGroup(colors.cognac, 'classico')).toEqual({
      50: '#fdf8f3',
      100: '#f9ede0',
      200: '#f2d7bf',
      400: '#b87a3e',
      500: '#9c6a36',
      600: '#8e5d2a',
      700: '#73481d',
      800: '#5a3716',
      900: '#3d240e',
    });
  });

  it('champagne mantém a transparência de cada borda', () => {
    expect(resolveGroup(colors.champagne, 'classico')).toEqual({
      border: '#b4966e/0.22',
      'border-subtle': '#b4966e/0.12',
      light: '#f4ede2',
    });
  });

  it('stone, amber e emerald seguem a paleta padrão do Tailwind', () => {
    expect(resolveGroup(colors.stone, 'classico')).toEqual(STONE_CLASSICO);
    expect(resolveGroup(colors.amber, 'classico')).toEqual(AMBER);
    expect(resolveGroup(colors.emerald, 'classico')).toEqual({
      50: '#ecfdf5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      600: '#059669',
      700: '#047857',
      800: '#065f46',
    });
  });

  it('as sombras de cartão mantêm a cor e a transparência', () => {
    expect(config.theme.extend.boxShadow.card).toBe(
      '0 2px 12px rgb(var(--fl-accent) / 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)',
    );
    expect(config.theme.extend.boxShadow['card-hover']).toBe(
      '0 8px 24px rgb(var(--fl-accent) / 0.09), 0 2px 6px rgba(0, 0, 0, 0.03)',
    );
  });

  it('as famílias de fonte são as de sempre', () => {
    const variables = variablesFor('classico');
    expect(variables.get('font-body')).toBe("'Inter', system-ui, -apple-system, sans-serif");
    expect(variables.get('font-heading')).toBe("'Merriweather', 'Playfair Display', Georgia, serif");
    expect(variables.get('font-sans')).toBe('Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    expect(variables.get('font-serif')).toBe('Georgia, Cambria, "Times New Roman", serif');
  });

  it('raios e foco são os de sempre', () => {
    const variables = variablesFor('classico');
    expect(variables.get('radius-control')).toBe('0.75rem');
    expect(variables.get('radius-card')).toBe('1rem');
    expect(variables.get('radius-card-subtle')).toBe('0.875rem');
    expect(variables.get('focus-width')).toBe('3px');
    expect(variables.get('focus-offset')).toBe('2px');
  });
});

const SEMANTIC = [
  'canvas',
  'canvas-deep',
  'surface',
  'surface-muted',
  'line',
  'line-control',
  'ink',
  'ink-soft',
  'muted',
  'subtle',
  'accent',
  'accent-strong',
  'accent-soft',
  'ok',
  'warn',
  'danger',
];
const semanticOf = (theme: Theme) =>
  Object.fromEntries(SEMANTIC.map((name) => [name, resolveColor(colors[name], theme)]));

describe('nomes semânticos (7.1 do plano)', () => {
  it('no tema clássico apontam para a cor que a interface já usa nesse papel', () => {
    expect(semanticOf('classico')).toEqual({
      canvas: '#fbf9f5',
      'canvas-deep': '#f1eee8',
      surface: '#ffffff',
      'surface-muted': '#fdfbf7',
      line: '#b4966e/0.22',
      // A borda de campo é sólida: o clássico usa o equivalente da borda translúcida sobre o branco.
      'line-control': '#efe8df',
      ink: '#2d2721',
      'ink-soft': '#44403c',
      muted: '#71695f',
      subtle: '#78716c',
      accent: '#8e5d2a',
      'accent-strong': '#73481d',
      'accent-soft': '#f9ede0',
      ok: '#047857',
      warn: '#b45309',
      danger: '#b91c1c',
    });
  });

  it('no tema gelo têm os valores da tabela 7.1', () => {
    expect(semanticOf('gelo')).toEqual({
      canvas: '#f4f7f8',
      'canvas-deep': '#ecf1f3',
      surface: '#ffffff',
      'surface-muted': '#f7fafb',
      // A borda decorativa é a cor E2E8EB da tabela depois de composta sobre o branco a 22%.
      line: '#7b96a4/0.22',
      'line-control': '#7e8b92',
      ink: '#101619',
      'ink-soft': '#2a363c',
      muted: '#4c585f',
      subtle: '#67727a',
      accent: '#0f5c6e',
      'accent-strong': '#0b4552',
      'accent-soft': '#f0f6f7',
      ok: '#1f6b4c',
      warn: '#b45309',
      danger: '#b91c1c',
    });
  });

  it('a borda decorativa do gelo, composta sobre o branco, dá E2E8EB', () => {
    const [r, g, b] = variablesFor('gelo').get('line')!.split(' ').map(Number) as [number, number, number];
    const over = (channel: number) => Math.round(channel * 0.22 + 255 * 0.78);
    const hex = `#${[r, g, b].map((c) => over(c).toString(16).padStart(2, '0')).join('')}`;
    expect(hex).toBe('#e2e8eb');
  });
});

describe('tema gelo: tons legados mapeados para o gelo', () => {
  it('ivory, cognac e champagne ficam na família do gelo', () => {
    expect(resolveGroup(colors.ivory, 'gelo')).toEqual({
      50: '#f7fafb',
      100: '#f4f7f8',
      200: '#edf2f4',
      300: '#e2e8eb',
    });
    expect(resolveGroup(colors.cognac, 'gelo')).toEqual({
      50: '#f5f9fa',
      100: '#f0f6f7',
      200: '#d2e3e7',
      400: '#2f7a8e',
      500: '#1f7085',
      600: '#0f5c6e',
      700: '#0b4552',
      800: '#083642',
      900: '#05252e',
    });
    expect(resolveGroup(colors.champagne, 'gelo')).toEqual({
      border: '#7b96a4/0.22',
      'border-subtle': '#7b96a4/0.12',
      light: '#edf3f5',
    });
  });

  it('stone vira cinza frio e emerald segue o selo "verificada"', () => {
    expect(resolveGroup(colors.stone, 'gelo')).toEqual({
      50: '#f7fafb',
      100: '#eef2f4',
      200: '#e2e8eb',
      300: '#c9d2d7',
      400: '#96a2a9',
      500: '#67727a',
      600: '#4c585f',
      700: '#2a363c',
      800: '#1a2428',
      900: '#101619',
      950: '#080c0e',
    });
    expect(resolveGroup(colors.emerald, 'gelo')).toEqual({
      50: '#eef7f2',
      200: '#bde0cd',
      300: '#8fcaac',
      600: '#287759',
      700: '#1f6b4c',
      800: '#175439',
    });
  });

  it('amber (avisos) não muda de tema', () => {
    expect(resolveGroup(colors.amber, 'gelo')).toEqual(AMBER);
  });

  it('o gelo redefine toda variável do tema clássico, sem deixar nenhuma por herança', () => {
    const root = [...declared(rootBlock()).keys()].sort();
    const gelo = [...declared(geloBlock()).keys()].sort();
    expect(gelo).toEqual(root.filter((name) => !name.startsWith('forgelex-')));
  });

  it('fontes, raios e foco do gelo', () => {
    const variables = variablesFor('gelo');
    expect(variables.get('font-body')).toBe("'ForgeLex Inter', system-ui, -apple-system, sans-serif");
    expect(variables.get('font-heading')).toBe("'ForgeLex Spectral', Georgia, serif");
    expect(variables.get('font-sans')).toBe(
      '\'ForgeLex Inter\', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    );
    expect(variables.get('font-serif')).toBe('\'ForgeLex Spectral\', Georgia, Cambria, "Times New Roman", serif');
    expect(variables.get('radius-control')).toBe('10px');
    expect(variables.get('radius-card')).toBe('1.125rem');
    expect(variables.get('radius-card-subtle')).toBe('1rem');
    expect(variables.get('focus-width')).toBe('2px');
    expect(variables.get('focus-offset')).toBe('2px');
  });
});

describe('fontes hospedadas no próprio site (DEC-3)', () => {
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => body!);
  const FILES = [
    'inter-latin-400-normal.woff2',
    'inter-latin-500-normal.woff2',
    'inter-latin-600-normal.woff2',
    'spectral-latin-400-normal.woff2',
    'spectral-latin-500-normal.woff2',
    'spectral-latin-600-normal.woff2',
  ];

  it('há uma face por arquivo, com nome próprio para não tocar nas fontes do tema clássico', () => {
    expect(faces).toHaveLength(FILES.length);
    const families = new Set(faces.map((face) => /font-family:\s*'([^']+)'/.exec(face)?.[1]));
    expect(families).toEqual(new Set(['ForgeLex Inter', 'ForgeLex Spectral']));
  });

  it('cada face usa swap, subconjunto latino e um arquivo que existe em public/fonts', () => {
    for (const face of faces) {
      expect(face).toMatch(/font-display:\s*swap/);
      expect(face).toMatch(/unicode-range:\s*U\+0000-00FF/);
      const file = /url\(\/fonts\/([^)]+)\)\s*format\('woff2'\)/.exec(face)?.[1];
      expect(file, 'src com /fonts/*.woff2').toBeDefined();
      expect(existsSync(join(webRoot, 'public/fonts', file!)), `${file} em public/fonts`).toBe(true);
    }
    expect(faces.map((face) => /url\(\/fonts\/([^)]+)\)/.exec(face)![1]).sort()).toEqual([...FILES].sort());
  });

  it('as três espessuras de cada família estão declaradas', () => {
    for (const family of ['ForgeLex Inter', 'ForgeLex Spectral']) {
      const weights = faces
        .filter((face) => face.includes(`'${family}'`))
        .map((face) => /font-weight:\s*(\d+)/.exec(face)?.[1])
        .sort();
      expect(weights).toEqual(['400', '500', '600']);
    }
  });

  it('as licenças das duas famílias acompanham os arquivos', () => {
    for (const file of ['LICENSE-inter.txt', 'LICENSE-spectral.txt']) {
      const text = readFileSync(join(webRoot, 'public/fonts', file), 'utf8');
      expect(text).toContain('SIL OPEN FONT LICENSE Version 1.1');
    }
  });

  it('nenhuma fonte vem de fora', () => {
    expect(css).not.toMatch(/https?:\/\//);
  });

  it('os arquivos não passam de 40 KB cada, para o tema gelo ficar leve', () => {
    for (const file of FILES) expect(statSync(join(webRoot, 'public/fonts', file)).size).toBeLessThan(40 * 1024);
  });
});

describe('primitivos só usam tokens semânticos', () => {
  const ALLOWED = new Set([
    'canvas',
    'surface',
    'surface-muted',
    'ink',
    'muted',
    'line',
    'accent',
    'accent-strong',
    'accent-soft',
    'ok',
    'warn',
    'placeholder',
    'field-border',
    'btn-border',
    'btn-border-hover',
    'shadow-ink',
    'shadow-cta',
    'scrollbar-track',
    'scrollbar-thumb',
    'scrollbar-thumb-hover',
    'font-body',
    'font-heading',
    'radius-control',
    'radius-card',
    'radius-card-subtle',
    'focus-width',
    'focus-offset',
  ]);
  const outsideThemes = css
    .replace(/:root\s*\{[^}]*\}/g, '')
    .replace(/\[data-theme="gelo"\]\s*\{[^}]*\}/g, '')
    .replace(/@font-face\s*\{[^}]*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('index.css fora dos blocos de tema não cita tom legado (ivory, cognac, stone, amber, emerald, champagne)', () => {
    const used = [...outsideThemes.matchAll(/var\(--fl-([a-z0-9-]+)\)/g)].map(([, name]) => name!);
    expect(used.filter((name) => !ALLOWED.has(name))).toEqual([]);
    expect(used.length).toBeGreaterThan(20);
  });

  it('existem o selo de verificação e o de lacuna, com as cores semânticas', () => {
    expect(outsideThemes).toMatch(/\.seal\s*\{[^}]*var\(--fl-ok\)/);
    expect(outsideThemes).toMatch(/\.seal-gap\s*\{[^}]*var\(--fl-warn\)/);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry) ? [path] : [];
  });
}

describe('sem literais de cor no código', () => {
  const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;
  // O leitor de decisão e o do MCP têm tema próprio por variáveis `--reader-*` (claro e escuro); a V3 os revisa.
  // `draft-print.ts` monta a página de impressão, um documento à parte que não carrega o CSS do app.
  const EXCEPTIONS = new Set(['components/decision-reader.css', 'mcp/mcp-reader.css', 'documents/draft-print.ts']);

  it('nenhum arquivo de interface usa hexadecimal literal', () => {
    const offenders = sourceFiles(sourceRoot)
      .map((path) => relative(sourceRoot, path).replaceAll('\\', '/'))
      .filter((path) => !EXCEPTIONS.has(path) && !/\.test\.tsx?$/.test(path))
      .filter((path) => HEX.test(readFileSync(join(sourceRoot, path), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('index.css só escreve cor como variável ou palavra-chave, fora dos blocos de tema', () => {
    expect(css).not.toMatch(HEX);
    const outsideThemes = css.replace(/:root\s*\{[^}]*\}/g, '').replace(/\[data-theme="gelo"\]\s*\{[^}]*\}/g, '');
    expect(outsideThemes).not.toMatch(/rgba?\(\s*\d/);
  });

  it('index.html não escreve cor literal nas classes do corpo', () => {
    expect(readFileSync(join(webRoot, 'index.html'), 'utf8')).not.toMatch(/bg-\[#|text-\[#/);
  });
});

describe('tailwind: fontes por variável', () => {
  it('font-sans e font-serif leem as variáveis do tema', () => {
    expect(config.theme.extend.fontFamily.sans).toEqual(['var(--fl-font-sans)']);
    expect(config.theme.extend.fontFamily.serif).toEqual(['var(--fl-font-serif)']);
  });
});
