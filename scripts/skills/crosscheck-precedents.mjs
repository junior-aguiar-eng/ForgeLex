import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * M3.2 (complemento) — conferência em massa de súmulas e temas citados nas fichas do catálogo, sem leitura ficha a ficha.
 *
 * Confere, contra listas oficiais lidas em arquivo, a EXISTÊNCIA e a SITUAÇÃO de:
 *   - Súmulas do STJ (PDF oficial de enunciados, `VerbetesSTJ_asc`, convertido em texto);
 *   - Súmulas e Súmulas Vinculantes do STF (página do portal, em Markdown, com “superada” e “cancelada”);
 *   - Temas do STJ (dados abertos, `temas.csv`, tipo “Tema”).
 * Não confere a TESE: se a ficha atribui à súmula o conteúdo certo é leitura dirigida. Citação sem tribunal declarado,
 * de tribunais sem lista carregada (TST, TSE, TNU, TRF) e números de processo não entram: o relatório os conta à parte.
 * Citação com contexto histórico (“cancelada”, “superada”, “revogada”, “antiga”) não gera alerta.
 */
export const CHECKS_PERFORMED = ['sumula-stj', 'sumula-stf', 'sumula-vinculante', 'sumula-tst', 'tema-stj'];
export const CHECKS_NOT_PERFORMED = ['tese-da-sumula', 'sumula-tse-tnu-trf', 'tema-stf', 'processo-numerado'];

const HISTORICAL =
  /cancel|supera|superou|revog|hist[óo]ric|antig[ao]|anterior|ultrapassad|abandon|n[ãa]o mais|inconstitucional|\bex-[\s*_]*S[úu]m/i;
const COURT = /\b(STJ|STF|TST|TSE|TNU|TRF)\b/;

/**
 * Súmulas do STJ, no PDF oficial de enunciados (`VerbetesSTJ_asc`): cada súmula abre com “SÚMULA N [(SÚMULA ALTERADA)]
 * VEJA MAIS”. Os títulos com “(SÚMULA CANCELADA)” ou “(SÚMULA REVOGADA)” marcam as que saíram de vigor; “alterada”
 * continua em vigor com a redação nova.
 */
export function parseStjSumulas(text) {
  const result = new Map();
  for (const match of text.matchAll(/S.MULA\s+(\d{1,4})\s*(\([^)]*\))?\s*VEJA MAIS/gi)) {
    const out = /CANCELAD|REVOGAD/i.test(match[2] ?? '');
    const number = Number(match[1]);
    if (out || !result.has(number)) result.set(number, { status: out ? 'cancelada' : 'vigente' });
  }
  return result;
}

/**
 * Súmulas do TST, no PDF “Súmulas da Jurisprudência Uniforme”: cada uma abre com “SUM-N TÍTULO (situação) - Res. …”. Vale a
 * primeira ocorrência de “SUM-N” e o primeiro parêntese depois do título: “cancelada” ou “cancelamento mantido” saíram de vigor;
 * “mantida”, “nova redação” e “alterada” seguem em vigor.
 */
export function parseTstSumulas(text) {
  const flat = text.replace(/\s+/g, ' ');
  const result = new Map();
  for (const match of flat.matchAll(/SUM-(\d{1,4})\s/g)) {
    const number = Number(match[1]);
    if (result.has(number)) continue;
    const head = flat.slice(match.index, match.index + 260);
    // A situação abre o primeiro parêntese, que pode ser longo. “Cancelada”, “cancelada por …” e “cancelamento mantido” tiram a
    // súmula de vigor; “cancelado o item II” e “cancelada a parte final da antiga redação” são parciais e ela segue em vigor.
    const status = head.match(/\(\s*([^)]{0,60})/)?.[1] ?? '';
    result.set(number, {
      status: /^cancel(?:ad[ao]|amento)\b(?!\s+(?:o|a|os|as)\s)/i.test(status) ? 'cancelada' : 'vigente',
    });
  }
  return result;
}

/** Lista do portal do STF: `[Súmula 3 *(superada)*](...)` ou `[Súmula Vinculante 1](...)`. */
export function parseStfList(markdown, vinculante) {
  const result = new Map();
  const pattern = vinculante
    ? /\[S.{1,2}mula Vinculante (\d{1,3})(?: \*\((\w+)\)\*)?\]/g
    : /\[S.{1,2}mula (\d{1,4})(?: \*\((\w+)\)\*)?\]/g;
  for (const match of markdown.matchAll(pattern)) result.set(Number(match[1]), { status: match[2] ?? 'vigente' });
  return result;
}

/** CSV com aspas e quebras de linha dentro do campo. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Temas do STJ (tipo “Tema”, não “Controvérsia”): número → situação. */
export function parseStjTemas(csv) {
  const [header, ...rows] = parseCsv(csv);
  const type = header.indexOf('tipoPrecedente');
  const number = header.indexOf('numeroPrecedente');
  const situation = header.indexOf('situacao');
  const result = new Map();
  for (const row of rows) {
    if (!/^Tema$/i.test(row[type] ?? '') || !/^\d+$/.test(row[number] ?? '')) continue;
    result.set(Number(row[number]), { status: /^Cancelad/i.test(row[situation] ?? '') ? 'cancelado' : 'vigente' });
  }
  return result;
}

/** Trecho da mesma frase: do limite anterior (. ; quebra de linha) ao seguinte, com no máximo 110 caracteres de cada lado. */
const sentenceAround = (text, start, end) => {
  const left = text.slice(Math.max(0, start - 110), start);
  const right = text.slice(end, end + 110);
  // O ponto de uma abreviação (“Súm.”, “art.”, “nº”, “cf.”, “Min.”) não encerra a frase: palavra de até 3 letras antes do ponto.
  const isEnd = (source, dotAt) => !/(?:^|[^\p{L}])\p{L}{1,3}$/u.test(source.slice(0, dotAt));
  let cutLeft = Math.max(left.lastIndexOf(';'), left.lastIndexOf('\n'));
  for (const m of left.matchAll(/\.\s/g)) if (isEnd(left, m.index) && m.index > cutLeft) cutLeft = m.index;
  let cutRight = -1;
  for (const m of right.matchAll(/\.(?:\s|$)|;|\n/g)) {
    // “;” dentro de um parêntese aberto depois da citação (“Súm. 294 (total …; parcial …) foi cancelada”) não encerra a frase.
    const inParentheses =
      m[0] === ';' &&
      (right.slice(0, m.index).match(/\(/g) ?? []).length > (right.slice(0, m.index).match(/\)/g) ?? []).length;
    if (inParentheses) continue;
    if (m[0][0] !== '.' || isEnd(right, m.index)) {
      cutRight = m.index;
      break;
    }
  }
  return {
    before: cutLeft >= 0 ? left.slice(cutLeft + 1) : left,
    after: cutRight >= 0 ? right.slice(0, cutRight) : right,
  };
};

/**
 * Tribunal da citação, por proximidade e sem herdar o de outra citação da mesma frase. Em ordem: (1) tribunal colado antes
 * (“STF (Tema 810”, “STF Tema 815”); (2) colado depois (“Súmula 7 do STJ”); (3) nenhum dos dois junto com o outro tribunal
 * perto, “STF/STJ”, é ambíguo; (4) um tribunal um pouco mais adiante vale só se não houver outro número no meio (“Tema 745
 * (…) com Tema 986 STJ” é do 986); (5) um tribunal um pouco antes vale só se não vier colado a um número (“Tema 1.129 STJ e
 * fixou no Tema 386” é do 1.129). Na dúvida devolve “?”, e a citação fica “não conferida”.
 */
const courtAround = (text, start, end) => {
  const { before, after } = sentenceAround(text, start, end);
  // Vírgula não cola: em “Temas 687-689 STJ, Súm. 688 e Temas 20/985 STF”, o STJ fecha o item anterior.
  const glued = before.slice(-16).match(new RegExp(`${COURT.source}[\\s(/:-]*$`));
  if (glued) return /(?:STJ|STF)\s*\/\s*(?:STJ|STF)\s*$/.test(before.slice(-20)) ? '?' : glued[1];
  if (/(?:STJ|STF)\s*\/\s*(?:STJ|STF)/.test(before.slice(-44))) return '?';
  const gluedAfter = after.slice(0, 24).match(new RegExp(`^[\\s(,/-]*(?:d[oa]s?\\s+|n[oa]s?\\s+)?${COURT.source}`));
  if (gluedAfter) return gluedAfter[1];
  const farAfter = after.slice(0, 60).match(COURT);
  if (farAfter && !/\d|S[úu]m|Tema/i.test(after.slice(0, farAfter.index))) return farAfter[1];
  const farBefore = [...before.slice(-50).matchAll(new RegExp(COURT.source, 'g'))].pop();
  if (farBefore && !/\d\s*$/.test(before.slice(-50).slice(0, farBefore.index))) return farBefore[1];
  return '?';
};

/** Referências a súmulas e temas de um texto: { kind, court, number, historical }. */
export function extractReferences(text) {
  const refs = [];
  const historicalAt = (start, end) => {
    const { before, after } = sentenceAround(text, start, end);
    return HISTORICAL.test(`${before}${text.slice(start, end)}${after}`);
  };
  const sumula = /S[úu]m(?:ulas?|\.)\s*(Vinculante\s*)?(?:n[º°o.]*\s*)?(\d{1,4}(?:\s*(?:,|e|a|ao|ou)\s*\d{1,4})*)/gi;
  for (const match of text.matchAll(sumula)) {
    const end = match.index + match[0].length;
    const vinculante = Boolean(match[1]);
    const court = vinculante ? 'STF' : courtAround(text, match.index, end);
    for (const number of match[2].match(/\d{1,4}/g)) {
      refs.push({
        kind: vinculante ? 'sv' : 'sumula',
        court,
        number: Number(number),
        historical: historicalAt(match.index, end),
        start: match.index,
        end,
      });
    }
  }
  const tema = /\bTemas?\s*(?:Repetitivo\s*)?(?:n[º°o.]*\s*)?(\d[\d.]*)/gi;
  for (const match of text.matchAll(tema)) {
    const end = match.index + match[0].length;
    const court = /repetitivo/i.test(match[0]) ? 'STJ' : courtAround(text, match.index, end);
    refs.push({
      kind: 'tema',
      court,
      number: Number(match[1].replace(/\./g, '')),
      historical: historicalAt(match.index, end),
      start: match.index,
      end,
    });
  }
  return refs;
}

/** Situação de uma referência: ok, alert (inexistente/cancelada), historical, not-checked. */
export function verifyReference(ref, sources) {
  const table =
    ref.kind === 'sv'
      ? sources.stfSv
      : ref.kind === 'sumula' && ref.court === 'STJ'
        ? sources.stjSumulas
        : ref.kind === 'sumula' && ref.court === 'STF'
          ? sources.stfSumulas
          : ref.kind === 'sumula' && ref.court === 'TST'
            ? sources.tstSumulas
            : ref.kind === 'tema' && ref.court === 'STJ'
              ? sources.stjTemas
              : undefined;
  if (!table && ref.kind === 'sumula' && ref.court === '?') {
    // Sem tribunal: não dá para conferir a tese, mas um número que não existe nem no STJ nem no STF é suspeito.
    return sources.stjSumulas.has(ref.number) || sources.stfSumulas.has(ref.number)
      ? { state: 'not-checked', reason: 'tribunal-nao-declarado' }
      : { state: ref.historical ? 'historical' : 'warning', reason: 'inexistente-no-stj-e-no-stf' };
  }
  if (!table)
    return { state: 'not-checked', reason: ref.court === '?' ? 'tribunal-nao-declarado' : 'tribunal-sem-lista' };
  const found = table.get(ref.number);
  if (!found) return { state: ref.historical ? 'historical' : 'alert', reason: 'inexistente' };
  // “Alterada”: a súmula segue em vigor com outra redação; a ficha deve citar a redação atual (aviso, não alerta).
  if (found.status === 'alterada') return { state: ref.historical ? 'historical' : 'warning', reason: 'alterada' };
  if (found.status !== 'vigente') return { state: ref.historical ? 'historical' : 'alert', reason: found.status };
  return { state: 'ok' };
}

async function listMarkdown(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...(await listMarkdown(path)));
    else if (entry.name.endsWith('.md')) out.push({ id: entry.name.replace(/\.md$/, ''), path });
  }
  return out;
}

// Do mais grave ao menos grave, para a situação resumida de uma citação que aparece em várias fichas.
const SEVERITY = ['alert', 'warning', 'not-checked', 'historical', 'ok'];

export async function crosscheckPrecedents(files, sources, { withContext = false } = {}) {
  // chave da citação → { ...citação, porEstado: Map(estado → { motivo, fichas, contexto }) }
  const byKey = new Map();
  for (const file of files) {
    const refs = extractReferences(file.text);
    // Se a própria ficha declara a súmula ou o tema cancelado, superado etc. em algum trecho, as demais menções dela na
    // mesma ficha (por exemplo, a lista de gatilhos de busca) são históricas: a ficha existe para avisar.
    const declared = new Set(
      refs.filter((ref) => ref.historical).map((ref) => `${ref.kind}|${ref.court}|${ref.number}`),
    );
    for (const ref of refs) {
      const key = `${ref.kind}|${ref.court}|${ref.number}`;
      const result = verifyReference({ ...ref, historical: ref.historical || declared.has(key) }, sources);
      const row = byKey.get(key) ?? { kind: ref.kind, court: ref.court, number: ref.number, byState: new Map() };
      const entry = row.byState.get(result.state) ?? { reason: result.reason, fichas: new Set() };
      if (withContext && !entry.context)
        entry.context = file.text.slice(Math.max(0, ref.start - 90), ref.end + 130).replace(/\s+/g, ' ');
      entry.fichas.add(file.id);
      row.byState.set(result.state, entry);
      byKey.set(key, row);
    }
  }
  const rows = [...byKey.values()].map((row) => ({
    ...row,
    state: SEVERITY.find((state) => row.byState.has(state)),
  }));
  const count = (state) => rows.filter((row) => row.state === state).length;
  const notChecked = {};
  for (const row of rows.filter((item) => item.state === 'not-checked')) {
    const reason = row.byState.get('not-checked').reason;
    notChecked[reason] = (notChecked[reason] ?? 0) + 1;
  }
  const listFor = (state) =>
    rows
      .filter((row) => row.byState.has(state))
      .map((row) => {
        const entry = row.byState.get(state);
        return {
          kind: row.kind,
          court: row.court,
          number: row.number,
          reason: entry.reason,
          fichas: [...entry.fichas].sort(),
          ...(entry.context ? { context: entry.context } : {}),
        };
      })
      .sort((a, b) => b.fichas.length - a.fichas.length || a.number - b.number);
  const alerts = listFor('alert');
  const warnings = listFor('warning');
  return {
    checksPerformed: CHECKS_PERFORMED,
    checksNotPerformed: CHECKS_NOT_PERFORMED,
    summary: {
      fichas: files.length,
      referenciasDistintas: rows.length,
      ok: count('ok'),
      alerta: count('alert'),
      aviso: count('warning'),
      historicas: count('historical'),
      naoConferidas: count('not-checked'),
      naoConferidasPorMotivo: notChecked,
      fichasComAlerta: new Set(alerts.flatMap((alert) => alert.fichas)).size,
    },
    alerts,
    warnings,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      catalog: { type: 'string' },
      'stj-sumulas': { type: 'string' },
      'stf-sumulas': { type: 'string' },
      'stf-sv': { type: 'string' },
      'stj-temas': { type: 'string' },
      'tst-sumulas': { type: 'string' },
      out: { type: 'string' },
      'with-context': { type: 'boolean' },
    },
  });
  for (const name of ['catalog', 'stj-sumulas', 'stf-sumulas', 'stf-sv', 'stj-temas', 'out']) {
    if (!values[name])
      throw new Error(
        `Uso: crosscheck-precedents.mjs --catalog <pasta> --stj-sumulas <txt> --stf-sumulas <md> --stf-sv <md> --stj-temas <csv> --out <json novo> (falta --${name})`,
      );
  }
  const sources = {
    stjSumulas: parseStjSumulas(await readFile(values['stj-sumulas'], 'latin1')),
    stfSumulas: parseStfList(await readFile(values['stf-sumulas'], 'utf8'), false),
    stfSv: parseStfList(await readFile(values['stf-sv'], 'utf8'), true),
    stjTemas: parseStjTemas(await readFile(values['stj-temas'], 'utf8')),
    // Opcional: sem a lista do TST, as citações do TST ficam “tribunal sem lista”.
    ...(values['tst-sumulas'] ? { tstSumulas: parseTstSumulas(await readFile(values['tst-sumulas'], 'latin1')) } : {}),
  };
  const files = [];
  // Só as fichas (pastas Forma e Matéria); LEIA-ME e manifesto ficam de fora.
  for (const folder of ['Forma', 'Matéria']) {
    for (const entry of await listMarkdown(join(values.catalog, folder))) {
      files.push({ id: entry.id, text: await readFile(entry.path, 'utf8') });
    }
  }
  const report = await crosscheckPrecedents(files, sources, { withContext: Boolean(values['with-context']) });
  report.sources = Object.fromEntries(Object.entries(sources).map(([name, map]) => [name, map.size]));
  await writeFile(values.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ sources: report.sources, summary: report.summary, output: values.out }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
