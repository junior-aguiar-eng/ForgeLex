import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { buildPalette, evaluatePairs, extractPairs, parseThemeVariables } from './theme-contrast-lib.mjs';

// Mede o contraste de todos os pares de cor de texto e fundo que o código usa, em cada tema (plano, V1):
//
//   node scripts/theme-contrast.mjs [--themes classico,gelo] [--min 4.5] [--markdown] [--all]
//
// Sai com código 1 quando um par que o primeiro tema atende (>= --min) deixa de ser atendido em outro tema: o tema novo
// nunca pode piorar uma combinação que o atual já cumpre. Os pares que já falham no primeiro tema só são listados.

const { values } = parseArgs({
  options: {
    themes: { type: 'string', default: 'classico,gelo' },
    min: { type: 'string', default: '4.5' },
    markdown: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
  },
});
const themeNames = values.themes.split(',');
const minimum = Number(values.min);
const webRoot = resolve(import.meta.dirname, '../apps/web');
const css = readFileSync(join(webRoot, 'src/index.css'), 'utf8');
const allColors = createRequire(join(webRoot, 'package.json'))('tailwindcss/colors');
// Só as paletas atuais: ler as antigas (lightBlue, warmGray...) faz o Tailwind imprimir avisos de renomeação.
const colors = Object.fromEntries(
  [
    'white',
    'black',
    'slate',
    'gray',
    'zinc',
    'neutral',
    'stone',
    'red',
    'orange',
    'amber',
    'yellow',
    'lime',
    'green',
    'emerald',
    'teal',
    'cyan',
    'sky',
    'blue',
    'indigo',
    'violet',
    'purple',
    'fuchsia',
    'pink',
    'rose',
  ].map((name) => [name, allColors[name]]),
);
const config = (await import(pathToFileURL(join(webRoot, 'tailwind.config.js')).href)).default;

const themes = Object.fromEntries(
  themeNames.map((name) => [name, buildPalette(config.theme.extend.colors, colors, parseThemeVariables(css, name))]),
);

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry) && !/\.test\./.test(entry) ? [path] : [];
  });
}

const pairs = sourceFiles(join(webRoot, 'src')).flatMap((file) => extractPairs(readFileSync(file, 'utf8')));
// Pares das primitivas de `index.css` (botões, campo, eyebrow), que não aparecem como classes no código.
const primitives = [
  ['white', 'accent'],
  ['accent-strong', 'surface'],
  ['accent-strong', 'accent-soft'],
  ['muted', 'canvas'],
  ['ink', 'surface-muted'],
  ['placeholder', 'surface-muted'],
  ['accent', 'canvas'],
  ['accent', 'surface'],
  ['ok', 'surface'],
  ['warn', 'surface'],
  ['danger', 'surface'],
  ['ink', 'canvas'],
  ['ink', 'surface'],
  ['ink-soft', 'accent-soft'],
  ['subtle', 'canvas'],
  ['subtle', 'surface'],
].map(([text, bg]) => ({ text, bg, bgAlpha: 1 }));
// `placeholder` não é uma classe de cor do projeto; entra pela variável, para as primitivas.
for (const name of themeNames) {
  const triple = parseThemeVariables(css, name).get('placeholder');
  if (triple) themes[name].set('placeholder', { rgb: triple.split(' ').map(Number), alpha: 1 });
}

const rows = evaluatePairs([...pairs, ...primitives], themes);
const [base, ...others] = themeNames;
const fails = (row, name) => row.ratios[name] < minimum;
const regressions = rows.filter((row) => !fails(row, base) && others.some((name) => fails(row, name)));
const failing = (name) => rows.filter((row) => fails(row, name));

const label = (row) => `${row.text} sobre ${row.bg}${row.bgAlpha < 1 ? `/${Math.round(row.bgAlpha * 100)}` : ''}`;
const fmt = (n) => n.toFixed(2).replace('.', ',');
console.log(`${rows.length} pares distintos medidos; mínimo ${fmt(minimum)}:1`);
for (const name of themeNames) console.log(`  ${name}: ${failing(name).length} abaixo do mínimo`);
console.log(`  piora em relação a ${base}: ${regressions.length}`);

const table = values.markdown || values.all;
const show = values.all
  ? rows
  : values.markdown
    ? rows.filter((row) => themeNames.some((name) => fails(row, name)))
    : regressions;
if (show.length) {
  console.log(table ? '\n| Par | Usos | ' + themeNames.join(' | ') + ' |' : '\nPiora:');
  if (table) console.log('| --- | ---: | ' + themeNames.map(() => '---:').join(' | ') + ' |');
  for (const row of show) {
    const cells = themeNames.map((name) => `${fmt(row.ratios[name])}${fails(row, name) ? ' ✗' : ''}`);
    console.log(
      table
        ? `| ${label(row)} | ${row.count} | ${cells.join(' | ')} |`
        : `  ${label(row)} (${row.count} usos): ${cells.join(' → ')}`,
    );
  }
}
process.exit(regressions.length ? 1 : 0);
