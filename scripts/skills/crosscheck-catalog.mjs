import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import JSZip from 'jszip';
import { inventoryCatalog, readCatalogEntry } from './inventory-catalog.mjs';

/**
 * M3.2 — cruzamento em massa do catálogo, sem leitura ficha a ficha (DEC-4).
 *
 * Confere as referências a artigos de código contra o texto oficial compilado do Planalto: o artigo existe e não está
 * revogado. É a parte do cruzamento que se verifica por dado. Ficam de fora, e o relatório diz isso: a existência de
 * súmulas e precedentes no índice do STJ do ForgeLex, a vigência de leis esparsas e a contradição de teor entre Forma
 * e Matéria. Ficha sem alerta nestas conferências não está "revisada": está cruzada nas conferências listadas.
 */
export const CHECKS_PERFORMED = ['norma-existencia', 'norma-vigencia'];
export const CHECKS_NOT_PERFORMED = ['precedente-indice-stj', 'lei-esparsa', 'contradicao-forma-materia'];

export const LAW_CODES = ['cpc', 'cpp', 'cc', 'cp', 'cf', 'clt', 'ctn', 'cdc'];
const LAW_PATTERN = '(CPC|CPP|CC|CP|CF|CLT|CTN|CDC)';
const NUMBER = String.raw`(?:1\.\d{3}|\d{1,4}(?![\d]|\.\d))(?:-[A-Z](?![A-Za-z]))?`;
const LIST = String.raw`${NUMBER}(?:\s*(?:,|e|ou|a|ao|–)\s*${NUMBER})*`;

const articleKey = (raw) => raw.replace(/\./g, '').replace(/\s+/g, '').toUpperCase();

/** Índice dos artigos de um texto oficial em Markdown: chave (ex.: 396-A) e se está revogado. */
export function indexLaw(markdown) {
  const articles = new Map();
  // O Markdown do Planalto traz negrito em letras soltas ("**A**rt.") e quebra o cabeçalho ("Art." numa linha e o
  // número na seguinte). As duas coisas são normalizadas antes de procurar os cabeçalhos.
  const lines = markdown
    .replace(/[*_]/g, '')
    .replace(/(^|\n)([\s\W]{0,24}Art\.?)[ \t]*\n[ \t]*(\d)/g, '$1$2 $3')
    .split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const heading = lines[i].match(
      /^[\s\W]{0,24}Art\.?\s*\.?\s*(\d{1,4}(?:\.\d{3})?)\s*(?:[º°o]|\.)?(?:-([A-Z])(?![A-Za-z]))?/,
    );
    if (!heading) continue;
    const key = articleKey(heading[1] + (heading[2] ? `-${heading[2]}` : ''));
    // "(Revogado ...)" logo depois do número vale para este artigo; o da linha seguinte pode ser de outro artigo.
    let rest = lines[i].slice(heading[0].length);
    if (rest.replace(/[\s\W]/g, '').length < 4) rest += ` ${lines[i + 1] ?? ''}`;
    const revoked = /^[\s\W\[]*(?:\(\s*)?Revogad[oa]/i.test(rest) || /^[\s\W]*~~\s*Art/.test(lines[i]);
    if (!articles.has(key) || articles.get(key).revoked) articles.set(key, { revoked });
  }
  return articles;
}

function expand(list) {
  const parts = list.split(/\s*(?:,|\be\b|\bou\b|\ba\b|\bao\b|–)\s*/).filter(Boolean);
  return parts.map((part) => articleKey(part)).filter((key) => /^\d+(?:-[A-Z])?$/.test(key));
}

/** Referências a artigos por forma "CPP, arts. 158-A a 158-F" ou "arts. 396 e 396-A do CPP". */
export function extractReferences(text) {
  const refs = new Map();
  const add = (law, list) => {
    for (const key of expand(list)) refs.set(`${law.toLowerCase()}|${key}`, { law: law.toLowerCase(), article: key });
  };
  const direct = new RegExp(
    String.raw`\b${LAW_PATTERN}(?:\/\d{2,4}(?!\d))?\s*,?\s*(?:arts?\.?\s*)?(${LIST})(?![\d.]*\s*(?:ADCT|\/\d{4}))`,
    'g',
  );
  for (const match of text.matchAll(direct)) {
    // "CPC 2015" e "CC 2020" sem "art." são ano e número de processo, não artigo.
    if (!/\barts?\b/i.test(match[0]) && /^(?:19|20)\d\d$/.test(match[2].trim())) continue;
    add(match[1], match[2]);
  }
  const trailing = new RegExp(
    String.raw`\barts?\.?\s*(${LIST})[º°o]?(?:\s*,?\s*(?:§\s*\d+[º°o]?|par[aá]grafo\s+[uú]nico|inc(?:iso)?s?\.?\s*[IVXLC]+|[IVXLC]{1,6}(?![A-Za-z])|al[ií]nea\s*\w)\s*,?)*\s*(?:d[oa]s?)\s+${LAW_PATTERN}\b(?!\s*\/?\s*ADCT)`,
    'g',
  );
  for (const match of text.matchAll(trailing)) add(match[2], match[1]);
  return [...refs.values()].sort((a, b) => (a.law + a.article < b.law + b.article ? -1 : 1));
}

const PRECEDENT =
  /\b(?:S[úu]m(?:ula|\.)?\s*(?:Vinculante\s*)?\d{1,4}|(?:REsp|AREsp|AgInt|AgRg|HC|RHC|RE|ARE|MS|RMS|ADI|ADPF|ADC|Rcl|Tema)\s*n?[º°o.]?\s*\d[\d.]*)/g;
export const precedentCount = (text) => new Set(text.match(PRECEDENT) ?? []).size;

export function crosscheckItem(item, laws) {
  const alerts = [];
  const refs = extractReferences(item.content);
  let checked = 0;
  let unresolved = 0;
  for (const { law, article } of refs) {
    const index = laws[law];
    if (!index) {
      unresolved += 1;
      continue;
    }
    checked += 1;
    const found = index.get(article);
    if (!found) alerts.push({ code: 'ARTICLE_NOT_FOUND', law, article });
    else if (found.revoked) alerts.push({ code: 'ARTICLE_REVOKED', law, article });
  }
  return {
    stableId: item.stableId,
    kind: item.category === 'forma' ? 'FORM' : 'MATTER',
    state: alerts.length ? 'alerta' : checked === 0 ? 'sem-referencia-verificavel' : 'sem-alerta',
    alerts,
    references: {
      articlesChecked: checked,
      unresolvedLaw: unresolved,
      precedentsNotChecked: precedentCount(item.content),
    },
    crossChecks: alerts.length || checked === 0 ? [] : CHECKS_PERFORMED,
  };
}

export function crosscheckCatalog(items, laws) {
  const results = items.map((item) => crosscheckItem(item, laws));
  const byCode = {};
  for (const result of results) for (const alert of result.alerts) byCode[alert.code] = (byCode[alert.code] ?? 0) + 1;
  const flagged = results.filter((result) => result.state === 'alerta');
  return {
    schemaVersion: 1,
    checksPerformed: CHECKS_PERFORMED,
    checksNotPerformed: CHECKS_NOT_PERFORMED,
    laws: Object.fromEntries(Object.entries(laws).map(([law, index]) => [law, { articles: index.size }])),
    summary: {
      items: results.length,
      crossed: results.filter((r) => r.state === 'sem-alerta').length,
      withAlert: flagged.length,
      withoutVerifiableReference: results.filter((r) => r.state === 'sem-referencia-verificavel').length,
      alertsByCode: byCode,
      articleReferencesChecked: results.reduce((sum, r) => sum + r.references.articlesChecked, 0),
      precedentsNotChecked: results.reduce((sum, r) => sum + r.references.precedentsNotChecked, 0),
    },
    results,
  };
}

async function loadItems(archiveBytes) {
  await inventoryCatalog(archiveBytes); // confere o ZIP, o manifesto, as contagens e os hashes
  const zip = await JSZip.loadAsync(archiveBytes);
  const manifest = JSON.parse(await zip.file('MANIFESTO.json').async('string'));
  const items = [];
  for (const row of manifest.files) {
    const bytes = await zip.file(row.path).async('nodebuffer');
    const { content } = readCatalogEntry(bytes, row);
    items.push({ stableId: row.stableId, category: row.category, content });
  }
  return items;
}

async function main() {
  const { values } = parseArgs({
    options: { archive: { type: 'string' }, laws: { type: 'string' }, out: { type: 'string' } },
  });
  if (!values.archive || !values.laws || !values.out) {
    throw new Error(
      'Uso: node scripts/skills/crosscheck-catalog.mjs --archive <ZIP> --laws <pasta com cpc.md, cpp.md…> --out <JSON local>',
    );
  }
  const laws = {};
  for (const law of LAW_CODES) laws[law] = indexLaw(await readFile(resolve(values.laws, `${law}.md`), 'utf8'));
  const report = crosscheckCatalog(await loadItems(await readFile(values.archive)), laws);
  await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ laws: report.laws, summary: report.summary, output: values.out }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
