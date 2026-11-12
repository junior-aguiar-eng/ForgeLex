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
export const CHECKS_NOT_PERFORMED = ['precedente-indice-stj', 'contradicao-forma-materia'];

export const LAW_CODES = ['cpc', 'cpp', 'cc', 'cp', 'cf', 'clt', 'ctn', 'cdc'];
const LAW_PATTERN = '(CPC|CPP|CC|CP|CF|CLT|CTN|CDC)';

/** Leis esparsas conferidas, pelo número oficial (a chave do índice é `lei<número>`). */
export const SPARSE_LAWS = [
  '6385',
  '6404',
  '8112',
  '8213',
  '8429',
  '9099',
  '9605',
  '9784',
  '11101',
  '11343',
  '12016',
  '12529',
  '12846',
  '13303',
  '13709',
  '14133',
];
export const SPARSE_CODES = SPARSE_LAWS.map((number) => `lei${number}`);
const SPARSE_NUMBER = String.raw`(\d{1,2}(?:\.\d{3}|\d{3}))\s*(?:\/\s*\d{2,4}|,\s*de\s*\d{1,2}[º°]?\s*de\s*\w+\s*de\s*\d{4})?`;
const SPARSE_LAW = String.raw`Lei(?:\s+(?:Federal|Ordin[aá]ria))?\s*(?:n[º°o.]*\s*)?${SPARSE_NUMBER}`;
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
    .replace(/(^|\n)([\s\W]{0,24}Art\.?[ \t.]*)\n[\s>]*(\d)/g, '$1$2 $3')
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
    // Lei que revogou, quando o texto oficial a nomeia: serve para saber se a ficha conhece a revogação.
    const revokedBy = revoked
      ? [
          ...`${rest} ${lines[i + 1] ?? ''} ${lines[i + 2] ?? ''}`.matchAll(
            /(?:Lei|Decreto-Lei|Emenda)\s*(?:Complementar\s*)?n[º°o.]*\s*([\d.]+)/gi,
          ),
        ].map((m) => m[1].replace(/\./g, ''))
      : [];
    if (!articles.has(key) || articles.get(key).revoked) articles.set(key, { revoked, revokedBy });
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
    // "CPC 04", "CPC 15": pronunciamentos do Comitê de Pronunciamentos Contábeis, não o Código de Processo Civil.
    if (match[1] === 'CPC' && !/\barts?\b/i.test(match[0]) && /IFRS|Pronunciamento|cont[aá]bil|balan[cç]o/i.test(text))
      continue;
    add(match[1], match[2]);
  }
  // Leis esparsas: "Lei 8.213/91, art. 59" e "art. 59 da Lei 8.213/91" (somente as que o cruzamento tem em mãos).
  const sparseKnown = (number) => SPARSE_LAWS.includes(number.replace(/\./g, ''));
  const sparseDirect = new RegExp(
    String.raw`${SPARSE_LAW}\s*(?:\([^)]{0,80}\))?\s*,?\s*(?:arts?\.?\s*)(${LIST})`,
    'gi',
  );
  for (const match of text.matchAll(sparseDirect)) {
    if (sparseKnown(match[1])) add(`lei${match[1].replace(/\./g, '')}`, match[2]);
  }
  const sparseTrailing = new RegExp(
    String.raw`\barts?\.?\s*(${LIST})[º°o]?(?:\s*,?\s*(?:§\s*\d+[º°o]?|par[aá]grafo\s+[uú]nico|inc(?:iso)?s?\.?\s*[IVXLC]+|[IVXLC]{1,6}(?![A-Za-z])|al[ií]nea\s*\w)\s*,?)*\s*(?:d[oa]s?)\s+${SPARSE_LAW}`,
    'gi',
  );
  for (const match of text.matchAll(sparseTrailing)) {
    if (sparseKnown(match[2])) add(`lei${match[2].replace(/\./g, '')}`, match[1]);
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

// A ficha que diz "revogado", "regime anterior", "CPC/73", "vetado" ou "inexistente" junto da citação, ou que nomeia a lei
// que revogou o artigo, conhece o estado dele: a citação é histórica ou de comparação, não erro.
const ACKNOWLEDGES =
  /revogad|ab-?rogad|regime anterior|antigo|anterior|CPC\/?\s*(?:19)?73|5\.869|vetad|inexistent|n[aã]o existe|n[aã]o h[aá] |insere|inser[ií]d|inclu[ií]d|acrescent|nova lei|revogou|sucede|substitu|cit(?:ar|e) um/i;

function occurrences(text, law, article) {
  const digits = article.replace('-', '\\s*-?\\s*');
  if (article.includes('-'))
    return [...text.matchAll(new RegExp(String.raw`(?<![\d-])${digits}\b`, 'gi'))].map((m) => m.index);
  const number = digits.length > 4 ? digits : digits.replace(/^(\d)(\d{3})$/, '$1\\.?$2');
  return [
    ...text.matchAll(new RegExp(String.raw`(?:${law}\s*,?\s*(?:arts?\.?\s*)?|arts?\.?\s*)${number}\b`, 'gi')),
  ].map((m) => m.index);
}

function acknowledged(text, law, article, found) {
  const plain = text.replace(/\./g, '');
  if (found?.revokedBy?.some((number) => plain.includes(number))) return true;
  const spots = occurrences(text, law, article);
  if (!spots.length) return false;
  return spots.every((at) => ACKNOWLEDGES.test(text.slice(Math.max(0, at - 160), at + 200)));
}

/**
 * Suplementos curados (`crosscheck-supplements.json`): o que o texto oficial consultado ainda não mostra, ou que o
 * extrator lê errado. Cada linha traz a fonte ou o motivo; nada aqui apaga um alerta sem dizer por quê.
 *   exists:  artigo inserido por lei recente que o texto compilado consultado ainda não incorporou;
 *   literal: citação que transcreve o próprio texto de outro artigo (por exemplo, o intervalo do CPP 394, § 4º);
 *   notCode: artigo de outra lei que o extrator atribuiu a um código.
 */
function supplemented(supplements, item, law, article) {
  const hit = (list, byFicha) =>
    (list ?? []).find(
      (row) => row.law === law && row.article === article && (!byFicha || row.stableId === item.stableId),
    );
  return hit(supplements.exists, false) ?? hit(supplements.literal, true) ?? hit(supplements.notCode, true);
}

// Por que uma ficha sem artigo verificável ficou sem conferência: orienta o tratamento (ampliar leis, conferir precedente, ler).
const OTHER_NORM =
  /\b(?:Lei(?: Complementar)?|Decreto(?:-Lei)?|Medida Provis[óo]ria|Emenda Constitucional|EC|Resolu[çc][ãa]o|Portaria)\s*(?:n[º°o.]*\s*)?\d[\d.]*/;
export function unverifiedKind(content) {
  if (OTHER_NORM.test(content)) return 'norma-nao-carregada';
  return precedentCount(content) ? 'so-precedente' : 'sem-citacao';
}

export function crosscheckItem(item, laws, supplements = {}) {
  const alerts = [];
  const historical = [];
  const supplementedHits = [];
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
    if (!found || found.revoked) {
      const mention = { code: found ? 'ARTICLE_REVOKED' : 'ARTICLE_NOT_FOUND', law, article };
      const resolved = supplemented(supplements, item, law, article);
      if (resolved) supplementedHits.push({ ...mention, reason: resolved.source ?? resolved.reason });
      else if (acknowledged(item.content, law, article, found)) historical.push(mention);
      else alerts.push(mention);
    }
  }
  return {
    stableId: item.stableId,
    kind: item.category === 'forma' ? 'FORM' : 'MATTER',
    state: alerts.length ? 'alerta' : checked === 0 ? 'sem-referencia-verificavel' : 'sem-alerta',
    alerts,
    unverifiedKind: !alerts.length && checked === 0 ? unverifiedKind(item.content) : undefined,
    historicalReferences: historical,
    resolvedBySupplement: supplementedHits,
    references: {
      articlesChecked: checked,
      unresolvedLaw: unresolved,
      precedentsNotChecked: precedentCount(item.content),
    },
    crossChecks: alerts.length || checked === 0 ? [] : CHECKS_PERFORMED,
  };
}

export function crosscheckCatalog(items, laws, supplements = {}) {
  const results = items.map((item) => crosscheckItem(item, laws, supplements));
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
      withHistoricalReference: results.filter((r) => r.historicalReferences.length).length,
      withSupplementResolved: results.filter((r) => r.resolvedBySupplement.length).length,
      withoutVerifiableReference: results.filter((r) => r.state === 'sem-referencia-verificavel').length,
      withoutVerifiableByKind: results.reduce(
        (acc, r) => (r.unverifiedKind ? { ...acc, [r.unverifiedKind]: (acc[r.unverifiedKind] ?? 0) + 1 } : acc),
        {},
      ),
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
    options: {
      archive: { type: 'string' },
      laws: { type: 'string' },
      out: { type: 'string' },
      supplements: { type: 'string' },
    },
  });
  if (!values.archive || !values.laws || !values.out) {
    throw new Error(
      'Uso: node scripts/skills/crosscheck-catalog.mjs --archive <ZIP> --laws <pasta com cpc.md, cpp.md…> --out <JSON local>',
    );
  }
  const laws = {};
  for (const law of [...LAW_CODES, ...SPARSE_CODES])
    laws[law] = indexLaw(await readFile(resolve(values.laws, `${law}.md`), 'utf8'));
  const supplements = values.supplements ? JSON.parse(await readFile(values.supplements, 'utf8')) : {};
  const report = crosscheckCatalog(await loadItems(await readFile(values.archive)), laws, supplements);
  await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ laws: report.laws, summary: report.summary, output: values.out }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
