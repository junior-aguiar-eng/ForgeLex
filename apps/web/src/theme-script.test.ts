import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * V1: o tema é escolhido por um script no `<head>` do `index.html`, antes da primeira pintura. Estes testes executam o
 * script de verdade, com um documento e um armazenamento de mentira, para cada valor de `VITE_FORGELEX_THEME`.
 */

const html = readFileSync(join(resolve(import.meta.dirname, '..'), 'index.html'), 'utf8');
const script = /<script data-theme-script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function memory(initial: Record<string, string> = {}): Storage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => void (data[key] = value) };
}
const broken: Storage = {
  getItem() {
    throw new Error('armazenamento bloqueado');
  },
  setItem() {
    throw new Error('armazenamento bloqueado');
  },
};

/** `configured` é o valor que o Vite escreve no lugar de `%VITE_FORGELEX_THEME%`. */
function run(configured: string, options: { search?: string; storage?: Storage | undefined } = {}) {
  const attributes: Record<string, string> = {};
  const appended: Record<string, unknown>[] = [];
  const iconAttributes: Record<string, string> = {};
  const queries: string[] = [];
  const document = {
    documentElement: { setAttribute: (name: string, value: string) => void (attributes[name] = value) },
    head: { appendChild: (element: Record<string, unknown>) => void appended.push(element) },
    createElement: () => ({}) as Record<string, unknown>,
    // O `<link rel="icon">` do index.html: o script só troca o `href` dele.
    querySelector: (selector: string) => {
      queries.push(selector);
      return { setAttribute: (name: string, value: string) => void (iconAttributes[name] = value) };
    },
  };
  runInNewContext(script.replace('%VITE_FORGELEX_THEME%', configured), {
    document,
    location: { search: options.search ?? '' },
    ...('storage' in options ? { localStorage: options.storage } : { localStorage: memory() }),
  });
  return {
    theme: attributes['data-theme'],
    preloads: appended.filter((element) => element.rel === 'preload'),
    themeColors: appended.filter((element) => element.name === 'theme-color'),
    iconHref: iconAttributes.href,
    queries,
  };
}

describe('script de tema do index.html', () => {
  it('existe uma vez, antes do script da aplicação, e lê a variável do build', () => {
    expect(script.length).toBeGreaterThan(0);
    expect(html.match(/%VITE_FORGELEX_THEME%/g)).toHaveLength(1);
    expect(html.indexOf('data-theme-script')).toBeLessThan(html.indexOf('type="module"'));
  });

  it('padrão (classico, ou variável sem valor no desenvolvimento): tema clássico e nada a mais', () => {
    for (const configured of ['classico', '%VITE_FORGELEX_THEME%', '', 'qualquer-coisa']) {
      const result = run(configured);
      expect(result.theme, configured).toBe('classico');
      expect(result.preloads, configured).toEqual([]);
    }
  });

  it('em produção (classico) o parâmetro e o armazenamento não mudam o tema', () => {
    const storage = memory({ 'forgelex.tema': 'gelo' });
    expect(run('classico', { search: '?tema=gelo', storage }).theme).toBe('classico');
    // E nada é gravado: a prévia está desligada.
    expect(storage.data).toEqual({ 'forgelex.tema': 'gelo' });
  });

  it('gelo: tema gelo fixo e a Inter 400 pré-carregada', () => {
    const result = run('gelo', { search: '?tema=classico' });
    expect(result.theme).toBe('gelo');
    expect(result.preloads).toEqual([
      {
        rel: 'preload',
        as: 'font',
        type: 'font/woff2',
        href: '/fonts/inter-latin-400-normal.woff2',
        crossOrigin: 'anonymous',
      },
    ]);
  });

  it('gelo: troca o favicon e define a cor da barra do navegador; o clássico não mexe em nenhum dos dois', () => {
    const gelo = run('gelo');
    expect(gelo.queries).toEqual(['link[rel="icon"]']);
    expect(gelo.iconHref).toContain("fill='%230F5C6E'");
    expect(gelo.themeColors).toEqual([{ name: 'theme-color', content: '#F4F7F8' }]);
    for (const configured of ['classico', '', 'qualquer-coisa']) {
      const classic = run(configured);
      expect(classic.queries, configured).toEqual([]);
      expect(classic.iconHref, configured).toBeUndefined();
      expect(classic.themeColors, configured).toEqual([]);
    }
    // A prévia só troca quando o parâmetro escolhe o gelo.
    expect(run('previa').themeColors).toEqual([]);
    expect(run('previa', { search: '?tema=gelo' }).themeColors).toHaveLength(1);
  });

  it('gelo: as duas cores são as do bloco do tema (acento e fundo), sem repetir à mão um valor que mudou', () => {
    const css = readFileSync(join(resolve(import.meta.dirname), 'index.css'), 'utf8');
    const block = /\[data-theme="gelo"\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    const hex = (name: string) => {
      const channels = new RegExp(`${name}:\\s*(\\d+) (\\d+) (\\d+);`).exec(block)?.slice(1).map(Number) ?? [];
      return (
        '#' +
        channels
          .map((channel) => channel.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()
      );
    };
    expect(hex('--fl-canvas')).toBe('#F4F7F8');
    expect(hex('--fl-accent')).toBe('#0F5C6E');
    expect(run('gelo').iconHref).toContain(`%23${hex('--fl-accent').slice(1)}`);
    expect(run('gelo').themeColors[0]).toEqual({ name: 'theme-color', content: hex('--fl-canvas') });
  });

  it('falha sem quebrar a página se o documento não tiver querySelector', () => {
    const document = {
      documentElement: { setAttribute() {} },
      head: { appendChild() {} },
      createElement: () => ({}) as Record<string, unknown>,
    };
    expect(() =>
      runInNewContext(script.replace('%VITE_FORGELEX_THEME%', 'gelo'), { document, location: { search: '' } }),
    ).not.toThrow();
  });

  it('prévia: começa no clássico e o parâmetro escolhe e guarda o tema', () => {
    expect(run('previa').theme).toBe('classico');

    const storage = memory();
    const gelo = run('previa', { search: '?tema=gelo', storage });
    expect(gelo.theme).toBe('gelo');
    expect(gelo.preloads).toHaveLength(1);
    expect(storage.data).toEqual({ 'forgelex.tema': 'gelo' });

    // Sem o parâmetro, o tema guardado volta; com `?tema=classico`, a prévia termina.
    expect(run('previa', { storage }).theme).toBe('gelo');
    expect(run('previa', { search: '?x=1&tema=classico', storage }).theme).toBe('classico');
    expect(storage.data).toEqual({ 'forgelex.tema': 'classico' });
    expect(run('previa', { storage }).theme).toBe('classico');
  });

  it('prévia: valor de parâmetro desconhecido é ignorado', () => {
    const storage = memory();
    expect(run('previa', { search: '?tema=roxo', storage }).theme).toBe('classico');
    expect(run('previa', { search: '?tema=gelo-escuro', storage }).theme).toBe('classico');
    expect(storage.data).toEqual({});
  });

  it('prévia: armazenamento bloqueado ou ausente não quebra a página', () => {
    expect(run('previa', { search: '?tema=gelo', storage: broken }).theme).toBe('gelo');
    expect(run('previa', { storage: broken }).theme).toBe('classico');
    expect(run('previa', { search: '?tema=gelo', storage: undefined }).theme).toBe('gelo');
  });
});
