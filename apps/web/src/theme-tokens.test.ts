import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * V0: as cores do app passam a vir de variáveis CSS (`--fl-*`), sem mudar nada na tela. Este arquivo trava o tema
 * `classico` no valor que as cores tinham antes da migração e impede que literais de cor voltem para o código.
 */

const webRoot = resolve(import.meta.dirname, '..');
const sourceRoot = join(webRoot, 'src');
const css = readFileSync(join(sourceRoot, 'index.css'), 'utf8');

const config = (await import(pathToFileURL(join(webRoot, 'tailwind.config.js')).href)).default as {
  theme: { extend: { colors: Record<string, unknown>; boxShadow: Record<string, string> } };
};
const colors = config.theme.extend.colors;

/** Variáveis `--fl-*: R G B;` do bloco do tema. */
function themeVariables(): Map<string, string> {
  const variables = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/--fl-([a-z0-9-]+):\s*(\d+ \d+ \d+)\s*;/g)) variables.set(name!, value!);
  return variables;
}

const toHex = (triple: string) =>
  `#${triple
    .split(' ')
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')}`;

/** `rgb(var(--fl-x) / <alpha-value>)` vira `#rrggbb`; com alpha fixo, `#rrggbb/0.22`. */
function resolveColor(value: unknown): string {
  expect(typeof value).toBe('string');
  const match = /^rgb\(var\(--fl-([a-z0-9-]+)\) \/ (<alpha-value>|[\d.]+)\)$/.exec(value as string);
  expect(match, `valor fora do padrão: ${String(value)}`).not.toBeNull();
  const triple = themeVariables().get(match![1]!);
  expect(triple, `variável --fl-${match![1]} sem definição em index.css`).toBeDefined();
  return match![2] === '<alpha-value>' ? toHex(triple!) : `${toHex(triple!)}/${match![2]}`;
}

const resolveGroup = (group: unknown) =>
  Object.fromEntries(
    Object.entries(group as Record<string, unknown>).map(([tone, value]) => [tone, resolveColor(value)]),
  );

describe('tema clássico: valores iguais aos de antes da migração', () => {
  it('ivory', () => {
    expect(resolveGroup(colors.ivory)).toEqual({ 50: '#fcfbf8', 100: '#f8f6f0', 200: '#f2efe8', 300: '#e7e2d6' });
  });

  it('cognac', () => {
    expect(resolveGroup(colors.cognac)).toEqual({
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
    expect(resolveGroup(colors.champagne)).toEqual({
      border: '#b4966e/0.22',
      'border-subtle': '#b4966e/0.12',
      light: '#f4ede2',
    });
  });

  it('stone, amber e emerald seguem a paleta padrão do Tailwind', () => {
    expect(resolveGroup(colors.stone)).toEqual({
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
    });
    expect(resolveGroup(colors.amber)).toEqual({
      50: '#fffbeb',
      100: '#fef3c7',
      200: '#fde68a',
      300: '#fcd34d',
      600: '#d97706',
      700: '#b45309',
      800: '#92400e',
      900: '#78350f',
    });
    expect(resolveGroup(colors.emerald)).toEqual({
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
      '0 2px 12px rgb(var(--fl-cognac-600) / 0.05), 0 1px 3px rgba(0, 0, 0, 0.02)',
    );
    expect(config.theme.extend.boxShadow['card-hover']).toBe(
      '0 8px 24px rgb(var(--fl-cognac-600) / 0.09), 0 2px 6px rgba(0, 0, 0, 0.03)',
    );
  });
});

describe('nomes semânticos (7.1 do plano)', () => {
  it('existem todos e, no tema clássico, apontam para a cor que a interface já usa nesse papel', () => {
    const semantic = Object.fromEntries(
      [
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
      ].map((name) => [name, resolveColor(colors[name])]),
    );
    expect(semantic).toEqual({
      canvas: '#fbf9f5',
      'canvas-deep': '#f1eee8',
      surface: '#ffffff',
      'surface-muted': '#fdfbf7',
      line: '#b4966e/0.22',
      'line-control': '#b4966e/0.22',
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

  it('index.css só escreve cor como variável ou palavra-chave', () => {
    expect(css).not.toMatch(HEX);
    expect(css).not.toMatch(/rgba?\(\s*\d/);
  });
});
