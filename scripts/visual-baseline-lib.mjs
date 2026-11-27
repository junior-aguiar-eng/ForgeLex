// Parte pura da ferramenta de referência visual (scripts/visual-baseline.mjs): roteiro de telas, normalização de dados
// que mudam a cada execução, comparação de estilos e leitura da saída do ambiente de desenvolvimento. Sem navegador,
// para poder ser testada.

/** Site público no modelo novo (27/11): Início, Como funciona, Preços e as telas de entrada. */
export const PUBLIC_ROUTES = ['/', '/como-funciona', '/creditos', '/cadastro', '/entrar'];

/** Telas autenticadas que existem no produto atual (gelo, regra do mínimo); as removidas levam à Mesa ou à Conta. */
export const APP_ROUTES = [
  '/app/trabalho',
  '/app/conectar',
  '/app/conta',
  '/app/conta/atividade',
  '/app/conta/seguranca',
];

export const VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  celular: { width: 390, height: 844 },
};

/**
 * Tamanhos pedidos em `--viewports 360,768,1440` (largura em pixels, de 320 a 3840). Cada um vira `w<largura>` nos
 * nomes das telas; a altura é a de um celular até 480 px, a de um tablet até 1024 e a do desktop acima disso. Sem o
 * argumento valem os dois tamanhos de sempre (`VIEWPORTS`), para que as capturas antigas continuem comparáveis.
 */
export function parseViewports(spec) {
  if (!spec) return VIEWPORTS;
  const widths = spec.split(',').map((part) => part.trim());
  const result = {};
  for (const part of widths) {
    if (!/^\d{3,4}$/.test(part)) throw new Error(`Largura inválida em --viewports: "${part}".`);
    const width = Number(part);
    if (width < 320 || width > 3840) throw new Error(`Largura fora de 320 a 3840 em --viewports: ${width}.`);
    result[`w${width}`] = { width, height: width <= 480 ? 844 : width <= 1024 ? 1024 : 1000 };
  }
  if (Object.keys(result).length !== widths.length) throw new Error('Larguras repetidas em --viewports.');
  return result;
}

/** Propriedades de estilo gravadas para cada elemento: cor em todas as formas em que ela aparece, tipografia e raio. */
export const STYLE_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'boxShadow',
  'textDecorationColor',
  'caretColor',
  'fill',
  'stroke',
  'accentColor',
  'backgroundImage',
  'fontFamily',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'borderTopLeftRadius',
];

const SYNTHETIC_EMAIL = /fase7-[0-9a-f-]+@forgelex\.test/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const FULL_DATE = /\b\d{2}\/\d{2}\/\d{4}\b/g;
const SHORT_DATE_BEFORE_TIME = /\b\d{2}\/\d{2}(?=,?\s+\d{1,2}:\d{2})/g;
const CLOCK = /\b\d{1,2}:\d{2}(:\d{2})?\b/g;
const LOCAL_PORT = /(127\.0\.0\.1|localhost|\[::1\]):\d{2,5}\b/g;

/**
 * Troca o que muda a cada execução (data, hora, e-mail sintético sorteado, identificadores, porta do ambiente local) por valores fixos, para que
 * duas capturas do mesmo código saiam iguais, byte a byte. Não toca em números que são conteúdo.
 */
export function normalizeVolatileText(text) {
  return text
    .replace(SYNTHETIC_EMAIL, 'usuario@forgelex.test')
    .replace(UUID, '00000000-0000-0000-0000-000000000000')
    .replace(FULL_DATE, '00/00/0000')
    .replace(SHORT_DATE_BEFORE_TIME, '00/00')
    .replace(CLOCK, (_, seconds) => (seconds ? '00:00:00' : '00:00'))
    .replace(LOCAL_PORT, '$1:0000');
}

/** Nome do arquivo de uma captura: tamanho e rota. */
export function screenName(size, route) {
  const slug = route === '/' ? 'inicio' : route.slice(1).replace(/\//g, '_');
  return `${size}-${slug}`;
}

/**
 * Compara dois despejos de estilo (`{ tela: [[caminho, ...valores]] }`, ou `'ERRO ...'` quando a captura falhou).
 * Devolve uma lista de diferenças; vazia quer dizer que as telas são iguais.
 */
export function diffStyleDumps(before, after) {
  const diffs = [];
  for (const screen of Object.keys(before)) {
    if (!(screen in after)) {
      diffs.push({ screen, kind: 'missing-after' });
      continue;
    }
    const a = before[screen];
    const b = after[screen];
    if (typeof a === 'string' || typeof b === 'string') {
      if (a !== b)
        diffs.push({ screen, kind: 'error', before: String(a).slice(0, 120), after: String(b).slice(0, 120) });
      continue;
    }
    if (a.length !== b.length) {
      diffs.push({ screen, kind: 'structure', before: `${a.length} elementos`, after: `${b.length} elementos` });
      continue;
    }
    for (let index = 0; index < a.length; index++) {
      const [path, ...beforeValues] = a[index];
      const [otherPath, ...afterValues] = b[index];
      if (path !== otherPath) {
        diffs.push({ screen, kind: 'structure', before: path, after: otherPath });
        break;
      }
      STYLE_PROPS.forEach((prop, column) => {
        if (beforeValues[column] !== afterValues[column]) {
          diffs.push({
            screen,
            kind: 'style',
            path,
            prop,
            before: beforeValues[column],
            after: afterValues[column],
          });
        }
      });
    }
  }
  for (const screen of Object.keys(after)) if (!(screen in before)) diffs.push({ screen, kind: 'missing-before' });
  return diffs;
}

/** Lê a origem do site e da API na saída de `scripts/dev-mesa.mjs`; `null` enquanto o ambiente não está pronto. */
export function parseDevMesaOutput(output) {
  if (!output.includes('pronto')) return null;
  const site = /Site:\s+(https?:\/\/[^\s/]+)/.exec(output)?.[1];
  const api = /API:\s+(https?:\/\/[^\s/]+)/.exec(output)?.[1];
  return site && api ? { site, api } : null;
}

/** Resumo de violações do axe: regra, gravidade, quantos elementos e os três primeiros (caminho de iframe unido por " >> "). */
export function summarizeAxe(violations) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    count: violation.nodes.length,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' >> ')),
  }));
}
