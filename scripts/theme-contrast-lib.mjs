// Parte pura do medidor de contraste dos temas (scripts/theme-contrast.mjs): fórmula da WCAG, leitura das variáveis de
// cada tema, paleta do Tailwind e extração dos pares texto e fundo que o código realmente usa. Sem acesso a arquivos.

const WHITE = [255, 255, 255];

const channel = (value) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** Razão de contraste da WCAG 2.x entre duas cores [r, g, b]; de 1 a 21, igual nos dois sentidos. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Cor com transparência `alpha` sobre um fundo opaco. */
export function compositeOver(rgb, alpha, backdrop) {
  return rgb.map((value, index) => Math.round(value * alpha + backdrop[index] * (1 - alpha)));
}

export const tripleToRgb = (triple) => triple.split(' ').map(Number);

function variablesIn(block) {
  const found = new Map();
  for (const [, name, value] of block.matchAll(/--fl-([a-z0-9-]+):\s*(\d+ \d+ \d+)\s*;/g)) found.set(name, value);
  return found;
}

/** Variáveis `--fl-*` de um tema: o tema padrão vem de `:root`; os outros sobrepõem e herdam o que não definem. */
export function parseThemeVariables(css, theme) {
  const variables = new Map();
  for (const [, block] of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const [name, value] of variablesIn(block)) variables.set(name, value);
  }
  if (theme !== 'classico') {
    const selector = new RegExp(`\\[data-theme=["']${theme}["']\\]\\s*\\{([^}]*)\\}`, 'g');
    for (const [, block] of css.matchAll(selector)) {
      for (const [name, value] of variablesIn(block)) variables.set(name, value);
    }
  }
  return variables;
}

function hexToRgb(hex) {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16));
}

function flatten(colors) {
  const flat = new Map();
  for (const [group, value] of Object.entries(colors)) {
    if (typeof value === 'string') flat.set(group, value);
    else
      for (const [tone, color] of Object.entries(value))
        flat.set(tone === 'DEFAULT' ? group : `${group}-${tone}`, color);
  }
  return flat;
}

/**
 * Mapa nome da classe para cor e transparência: a paleta padrão do Tailwind com a configuração do projeto por cima, as
 * variáveis `--fl-*` já resolvidas para o tema pedido.
 */
export function buildPalette(config, defaults, variables) {
  const palette = new Map();
  for (const [name, value] of flatten(defaults)) {
    const rgb = hexToRgb(value);
    if (rgb) palette.set(name, { rgb, alpha: 1 });
  }
  for (const [name, value] of flatten(config)) {
    const match = /^rgb\(var\(--fl-([a-z0-9-]+)\) \/ (<alpha-value>|[\d.]+)\)$/.exec(value);
    if (match) {
      const triple = variables.get(match[1]);
      if (triple)
        palette.set(name, { rgb: tripleToRgb(triple), alpha: match[2] === '<alpha-value>' ? 1 : Number(match[2]) });
      continue;
    }
    const rgb = hexToRgb(value);
    if (rgb) palette.set(name, { rgb, alpha: 1 });
  }
  return palette;
}

const SEMANTIC = [
  'canvas',
  'canvas-deep',
  'surface',
  'surface-muted',
  'ink',
  'ink-soft',
  'muted',
  'subtle',
  'accent',
  'accent-strong',
  'accent-soft',
  'accent-tint',
  'ok',
  'ok-tint',
  'warn',
  'danger',
  'champagne-light',
  'champagne-border',
  'champagne-border-subtle',
];
const COLOR_NAME = new RegExp(`^(?:white|black|[a-z]+-\\d{2,3}|${SEMANTIC.join('|')})$`);
const COLOR_TOKEN = /^(text|bg)-([a-z0-9-]+?)(?:\/(\d{1,3}))?$/;

const EXPRESSION = /\$\{((?:[^{}]|\{[^{}]*\})*)\}/g;

/** Listas de classes que formam um mesmo elemento. Em modelo com condição, a parte fixa mais cada alternativa. */
function classLists(source) {
  const lists = [];
  const literal = /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;
  for (const [text] of source.matchAll(literal)) {
    const body = text.slice(1, -1);
    if (text.startsWith('`')) {
      const fixed = body.replace(EXPRESSION, ' ');
      lists.push(fixed);
      for (const [, expression] of body.matchAll(EXPRESSION)) {
        for (const [, single, double] of expression.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
          lists.push(`${fixed} ${single ?? double}`);
        }
      }
    } else lists.push(body);
  }
  return lists;
}

/**
 * Pares texto e fundo usados no código, por lista de classes. Texto sem fundo explícito vale sobre os dois fundos de
 * página. Classes com variante (hover, foco, largura de tela) não entram.
 */
export function extractPairs(source) {
  const pairs = [];
  for (const list of classLists(source)) {
    const texts = [];
    const backgrounds = [];
    for (const token of list.split(/\s+/)) {
      if (!token || token.includes(':')) continue;
      const match = COLOR_TOKEN.exec(token);
      if (!match || !COLOR_NAME.test(match[2])) continue;
      if (match[1] === 'text') {
        if (!match[3]) texts.push(match[2]);
      } else backgrounds.push({ bg: match[2], bgAlpha: match[3] ? Number(match[3]) / 100 : 1 });
    }
    if (!texts.length) continue;
    const targets = backgrounds.length
      ? backgrounds
      : [
          { bg: 'canvas', bgAlpha: 1 },
          { bg: 'surface', bgAlpha: 1 },
        ];
    for (const text of texts) for (const target of targets) pairs.push({ text, ...target });
  }
  return pairs;
}

/** Razão de contraste de cada par distinto em cada tema, com a contagem de usos; mais usados primeiro. */
export function evaluatePairs(pairs, themes) {
  const rows = new Map();
  for (const { text, bg, bgAlpha } of pairs) {
    const key = `${text}|${bg}|${bgAlpha}`;
    const row = rows.get(key);
    if (row) row.count++;
    else rows.set(key, { text, bg, bgAlpha, count: 1 });
  }
  const result = [];
  for (const row of rows.values()) {
    const ratios = {};
    let known = true;
    for (const [theme, palette] of Object.entries(themes)) {
      const foreground = palette.get(row.text);
      const background = palette.get(row.bg);
      if (!foreground || !background) {
        known = false;
        break;
      }
      const fill = compositeOver(background.rgb, row.bgAlpha * background.alpha, WHITE);
      ratios[theme] = contrastRatio(foreground.rgb, fill);
    }
    if (known) result.push({ ...row, ratios });
  }
  return result.sort((a, b) => b.count - a.count);
}
