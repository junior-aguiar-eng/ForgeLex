import { describe, expect, it } from 'vitest';
import {
  APP_ROUTES,
  PUBLIC_ROUTES,
  STYLE_PROPS,
  VIEWPORTS,
  diffStyleDumps,
  normalizeVolatileText,
  parseDevMesaOutput,
  parseViewports,
  screenName,
  summarizeAxe,
} from './visual-baseline-lib.mjs';

describe('normalizeVolatileText', () => {
  it('troca data e hora por valores fixos, para a captura não depender do relógio', () => {
    expect(normalizeVolatileText('17/11, 09:07')).toBe('00/00, 00:00');
    expect(normalizeVolatileText('em 17/11/2026, 09:01:59')).toBe('em 00/00/0000, 00:00:00');
    expect(normalizeVolatileText('Criado em 17/11/2026')).toBe('Criado em 00/00/0000');
    expect(normalizeVolatileText('às 9:07')).toBe('às 00:00');
  });

  it('troca o e-mail sintético sorteado a cada subida do ambiente e os identificadores', () => {
    expect(normalizeVolatileText('link para fase7-017a4b87-36c4-41bc-8087-54847dfefacc@forgelex.test. A senha')).toBe(
      'link para usuario@forgelex.test. A senha',
    );
    expect(normalizeVolatileText('execução 3f2504e0-4f89-41d3-9a0c-0305e82c3301 concluída')).toBe(
      'execução 00000000-0000-0000-0000-000000000000 concluída',
    );
  });

  it('troca a porta do ambiente local, que muda a cada subida e aparece nos exemplos de uso da API', () => {
    expect(normalizeVolatileText('http://127.0.0.1:3401/mcp')).toBe('http://127.0.0.1:0000/mcp');
    expect(normalizeVolatileText("new URL('http://localhost:3404/api/v2/jurisprudencia')")).toBe(
      "new URL('http://localhost:0000/api/v2/jurisprudencia')",
    );
  });

  it('não mexe em números, valores e contagens que fazem parte do conteúdo', () => {
    for (const text of ['R$ 250,00', '1 de 2', 'REsp 1.234.567/SP', 'Art. 5º, inciso X', '12 resultados', 'v1']) {
      expect(normalizeVolatileText(text)).toBe(text);
    }
  });

  it('é idempotente', () => {
    const once = normalizeVolatileText('17/11/2026, 09:01:59 e 17/11, 09:07');
    expect(normalizeVolatileText(once)).toBe(once);
  });
});

describe('parseViewports', () => {
  it('sem argumento mantém os dois tamanhos de sempre, para as capturas antigas seguirem comparáveis', () => {
    expect(parseViewports(undefined)).toBe(VIEWPORTS);
    expect(parseViewports('')).toBe(VIEWPORTS);
  });

  it('360, 768 e 1440 viram w360, w768 e w1440, com altura de celular, tablet e desktop', () => {
    expect(parseViewports('360,768,1440')).toEqual({
      w360: { width: 360, height: 844 },
      w768: { width: 768, height: 1024 },
      w1440: { width: 1440, height: 1000 },
    });
    expect(screenName('w768', '/app/conta')).toBe('w768-app_conta');
  });

  it('aceita espaços e recusa larguras inválidas, fora do intervalo ou repetidas', () => {
    expect(Object.keys(parseViewports(' 360 , 768 '))).toEqual(['w360', 'w768']);
    for (const bad of ['abc', '360,', '100', '5000', '360,360', '36.5'])
      expect(() => parseViewports(bad), bad).toThrow(/--viewports/);
  });
});

describe('screenName', () => {
  it('monta o nome do arquivo por tamanho e rota', () => {
    expect(screenName('desktop', '/')).toBe('desktop-inicio');
    expect(screenName('celular', '/app/conta/seguranca')).toBe('celular-app_conta_seguranca');
    expect(screenName('desktop', '/como-funciona')).toBe('desktop-como-funciona');
  });
});

describe('roteiro de telas', () => {
  it('cobre o site público e as telas autenticadas sem repetir rota', () => {
    expect(PUBLIC_ROUTES).toContain('/');
    expect(PUBLIC_ROUTES).toContain('/entrar');
    expect(APP_ROUTES).toContain('/app/trabalho');
    expect(APP_ROUTES).toContain('/app/casos');
    const all = [...PUBLIC_ROUTES, ...APP_ROUTES];
    expect(new Set(all).size).toBe(all.length);
    expect(APP_ROUTES.every((route) => route.startsWith('/app'))).toBe(true);
  });
});

describe('diffStyleDumps', () => {
  const row = (path: string, ...values: string[]) => [path, ...values];
  const same = (value: string) => STYLE_PROPS.map(() => value);

  it('sem diferença devolve lista vazia', () => {
    const dump = { 'desktop-inicio': [row('body', ...same('x')), row('body>div:0', ...same('y'))] };
    expect(diffStyleDumps(dump, structuredClone(dump))).toEqual([]);
  });

  it('aponta a tela, o elemento, a propriedade e os dois valores', () => {
    const before = { 'desktop-inicio': [row('body>header:0', ...same('rgb(1, 2, 3)'))] };
    const changed = same('rgb(1, 2, 3)');
    changed[STYLE_PROPS.indexOf('backgroundColor')] = 'rgb(9, 9, 9)';
    const after = { 'desktop-inicio': [row('body>header:0', ...changed)] };

    expect(diffStyleDumps(before, after)).toEqual([
      {
        screen: 'desktop-inicio',
        kind: 'style',
        path: 'body>header:0',
        prop: 'backgroundColor',
        before: 'rgb(1, 2, 3)',
        after: 'rgb(9, 9, 9)',
      },
    ]);
  });

  it('aponta tela que existe só de um lado, erro de captura e árvore de tamanho diferente', () => {
    const before = {
      a: [row('body', ...same('x'))],
      b: [row('body', ...same('x'))],
      c: 'ERRO tempo esgotado',
      d: [row('body', ...same('x')), row('body>p:0', ...same('x'))],
    };
    const after = {
      a: [row('body', ...same('x'))],
      c: [row('body', ...same('x'))],
      d: [row('body', ...same('x'))],
      e: [],
    };

    const kinds = diffStyleDumps(before, after).map((d) => `${d.screen}:${d.kind}`);
    expect(kinds).toEqual(['b:missing-after', 'c:error', 'd:structure', 'e:missing-before']);
  });
});

describe('parseDevMesaOutput', () => {
  const output = `[web] ready
Ambiente de desenvolvimento da Mesa pronto.
  Site:   http://127.0.0.1:3400/entrar
  Login:  trabalho@forgelex.test  /  senha-sintetica   (Auth sintético: qualquer e-mail e senha entram)
  API:    http://127.0.0.1:3401   Auth sintético: http://127.0.0.1:3402
`;

  it('lê a origem do site e da API quando o ambiente está pronto', () => {
    expect(parseDevMesaOutput(output)).toEqual({ site: 'http://127.0.0.1:3400', api: 'http://127.0.0.1:3401' });
  });

  it('devolve nulo enquanto o ambiente não terminou de subir', () => {
    expect(parseDevMesaOutput('[web] VITE ready in 300 ms\n  Site:   http://127.0.0.1:3400/entrar\n')).toBeNull();
  });
});

describe('summarizeAxe', () => {
  const violation = (id: string, impact: string, targets: string[][]) => ({
    id,
    impact,
    help: `ajuda ${id}`,
    nodes: targets.map((target) => ({ target })),
  });

  it('resume cada violação com a regra, a gravidade, a contagem e os primeiros elementos', () => {
    const summary = summarizeAxe([
      violation('color-contrast', 'serious', [['.a'], ['.b'], ['.c'], ['.d']]),
      violation('label', 'critical', [['input']]),
    ]);
    expect(summary).toEqual([
      { id: 'color-contrast', impact: 'serious', help: 'ajuda color-contrast', count: 4, targets: ['.a', '.b', '.c'] },
      { id: 'label', impact: 'critical', help: 'ajuda label', count: 1, targets: ['input'] },
    ]);
  });

  it('une o caminho de elementos dentro de iframe ou componente com " >> "', () => {
    const [item] = summarizeAxe([violation('x', 'minor', [['iframe', '.dentro']])]);
    expect(item!.targets).toEqual(['iframe >> .dentro']);
  });

  it('sem violação, lista vazia', () => {
    expect(summarizeAxe([])).toEqual([]);
  });
});
