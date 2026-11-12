import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * M3.4 — baixa o texto oficial das normas esparsas citadas pelas fichas. Para cada código (`lei9430`, `lc214`,
 * `decreto13095`, `mp1359`, `ec132`), pergunta ao Senado o ano da norma, tenta as URLs possíveis do Planalto e guarda a
 * primeira cujo texto traz o número da norma. Usa `fetch_oficial.py` (User-Agent de navegador e decodificação
 * correta), nunca o WebFetch. O resultado vai para `<pasta>/<código>.md` e a URL confirmada para `law-sources.json`.
 */
const FETCH = join(homedir(), '.claude', 'scripts', 'fetch_oficial.py');
const SENADO = 'https://legis.senado.leg.br/dadosabertos/legislacao/lista';
const PLANALTO = 'https://www.planalto.gov.br/ccivil_03';
const SENADO_TYPE = { lei: 'LEI', lc: 'LCP', dl: 'DEL', decreto: 'DEC', mp: 'MPV', ec: 'EMC' };

export function parseCode(code) {
  const match = code.match(/^(lei|lc|dl|decreto|mp|ec)(\d+)$/);
  if (!match) throw new Error(`código de norma inválido: ${code}`);
  return { kind: match[1], number: match[2] };
}

const RANGES = [
  [2023, 2026],
  [2019, 2022],
  [2015, 2018],
  [2011, 2014],
  [2007, 2010],
  [2004, 2006],
];
const range = (year) => RANGES.find(([from, to]) => year >= from && year <= to);

/** URLs candidatas no Planalto, da mais provável para a menos provável. */
export function candidateUrls(kind, number, year) {
  const n = number;
  const r = range(year);
  const span = r ? `_ato${r[0]}-${r[1]}/${year}` : null;
  const urls = [];
  if (kind === 'lei') {
    if (span) urls.push(`${PLANALTO}/${span}/lei/l${n}.htm`, `${PLANALTO}/${span}/lei/L${n}.htm`);
    else {
      urls.push(
        `${PLANALTO}/leis/l${n}cons.htm`,
        `${PLANALTO}/leis/l${n}compilado.htm`,
        `${PLANALTO}/leis/L${n}.htm`,
        `${PLANALTO}/leis/l${n}.htm`,
      );
      for (const folder of [`leis_${year}`, String(year), `${year}`]) {
        urls.push(`${PLANALTO}/leis/${folder}/l${n}.htm`, `${PLANALTO}/leis/${folder}/L${n}.htm`);
      }
      const dotted = n.length > 3 ? `${n.slice(0, -3)}.${n.slice(-3)}` : n;
      urls.push(`${PLANALTO}/leis/${year}/l${dotted}.htm`, `${PLANALTO}/leis/${year}/L${dotted}.htm`);
    }
  } else if (kind === 'lc') {
    if (span) urls.push(`${PLANALTO}/${span}/lei/lcp${n}.htm`);
    urls.push(
      `${PLANALTO}/leis/lcp/lcp${n}.htm`,
      `${PLANALTO}/leis/lcp/Lcp${n}.htm`,
      `${PLANALTO}/leis/lcp/lcp${n}compilado.htm`,
    );
    urls.push(`${PLANALTO}/leis/lcp/Lcp${n}compilado.htm`, `${PLANALTO}/leis/Lcp/Lcp${n}.htm`);
  } else if (kind === 'decreto') {
    if (span) urls.push(`${PLANALTO}/${span}/decreto/D${n}.htm`, `${PLANALTO}/${span}/decreto/d${n}.htm`);
    const decade =
      year < 1950
        ? '1930-1949'
        : year < 1960
          ? '1950-1959'
          : year < 1970
            ? '1960-1969'
            : year < 1980
              ? '1970-1979'
              : year < 1990
                ? '1980-1989'
                : null;
    if (decade) urls.push(`${PLANALTO}/decreto/${decade}/d${n}.htm`, `${PLANALTO}/decreto/${decade}/D${n}.htm`);
    urls.push(
      `${PLANALTO}/decreto/D${n}.htm`,
      `${PLANALTO}/decreto/d${n}.htm`,
      `${PLANALTO}/decreto/D${n}compilado.htm`,
    );
    if (year >= 1990 && year < 2004)
      urls.push(`${PLANALTO}/decreto/${year}/d${n}.htm`, `${PLANALTO}/decreto/${year}/D${n}.htm`);
  } else if (kind === 'dl') {
    urls.push(
      `${PLANALTO}/decreto-lei/Del${n}.htm`,
      `${PLANALTO}/decreto-lei/Del${n}compilado.htm`,
      `${PLANALTO}/decreto-lei/del${n}.htm`,
    );
  } else if (kind === 'mp') {
    if (span) urls.push(`${PLANALTO}/${span}/mpv/mpv${n}.htm`, `${PLANALTO}/${span}/mpv/Mpv${n}.htm`);
    urls.push(`${PLANALTO}/mpv/mp${n}.htm`, `${PLANALTO}/mpv/Mpv${n}.htm`);
  } else if (kind === 'ec') {
    urls.push(`${PLANALTO}/constituicao/Emendas/Emc/emc${n}.htm`, `${PLANALTO}/constituicao/emendas/emc/emc${n}.htm`);
  }
  return urls;
}

function download(url, out) {
  try {
    execFileSync('python', ['-I', FETCH, url, out], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000 });
    return existsSync(out) ? readFileSync(out, 'utf8') : null;
  } catch {
    return null;
  }
}

function yearOf(kind, number, scratch) {
  const out = join(scratch, `senado-${kind}${number}.md`);
  const text = download(`${SENADO}?tipo=${SENADO_TYPE[kind]}&numero=${number}`, out);
  // "Lei nº 9.430 de 27/12/1996": a data da norma vem depois de "de"; o carimbo do serviço não tem esse "de".
  const match = text?.match(/\bde (\d{2})\/(\d{2})\/(\d{4})/);
  return match ? Number(match[3]) : null;
}

export async function fetchNorm(code, lawsDir, scratch) {
  const { kind, number } = parseCode(code);
  const year = yearOf(kind, number, scratch);
  if (!year) return { code, ok: false, reason: 'ano não encontrado no Senado' };
  const numeral = Number(number).toLocaleString('pt-BR');
  const label = {
    lei: 'Lei',
    lc: 'Lei Complementar',
    dl: 'Decreto-Lei',
    decreto: 'Decreto',
    mp: 'Medida Provis',
    ec: 'Emenda Constitucional',
  }[kind];
  for (const url of candidateUrls(kind, number, year)) {
    const out = join(lawsDir, `${code}.md`);
    rmSync(out, { force: true });
    const text = download(url, out);
    if (!text) continue;
    const head = text.slice(0, 4000);
    if (
      new RegExp(`${label}[^\\n]{0,40}${numeral.replace('.', '\\.?')}|${number}`, 'i').test(head) &&
      /Art\.?\s*1/i.test(text)
    ) {
      return { code, ok: true, year, url, bytes: text.length };
    }
    rmSync(out, { force: true });
  }
  return { code, ok: false, year, reason: 'nenhuma URL candidata do Planalto trouxe o texto' };
}

async function main() {
  const { values } = parseArgs({
    options: { laws: { type: 'string' }, codes: { type: 'string' }, report: { type: 'string' } },
  });
  if (!values.laws || !values.codes) {
    throw new Error(
      'Uso: node scripts/skills/fetch-laws.mjs --laws <pasta> --codes lei9430,lc214 [--report <JSON local>]',
    );
  }
  const lawsDir = resolve(values.laws);
  mkdirSync(lawsDir, { recursive: true });
  const scratch = join(lawsDir, '.senado');
  mkdirSync(scratch, { recursive: true });
  const results = [];
  for (const code of values.codes.split(',').filter(Boolean)) {
    if (existsSync(join(lawsDir, `${code}.md`))) {
      results.push({ code, ok: true, cached: true });
      continue;
    }
    const result = await fetchNorm(code, lawsDir, scratch);
    results.push(result);
    console.log(JSON.stringify(result));
  }
  if (values.report) writeFileSync(values.report, JSON.stringify(results, null, 2) + '\n');
  console.log(
    JSON.stringify({ ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).map((r) => r.code) }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
