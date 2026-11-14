import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/**
 * Consulta o portal do STF (`jurisprudenciaRepercussao/tema.asp?num=N`) para cada tema de repercussão geral citado nas fichas
 * e guarda a repercussão geral e a situação. Serve à conferência de `crosscheck-precedents.mjs`. Ritmo moderado (padrão 700 ms
 * entre consultas), User-Agent de navegador, duas tentativas e retomável: o que já veio com `http: 200` não é consultado de novo.
 * Tema inexistente volta sem o campo “Situação” e fica com `existe: false`.
 */
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const clean = (value) =>
  value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Lê o HTML da página de um tema: `<div class="tema-campo">Rótulo:</div><p>valor</p>`. */
export function parseStfTemaPage(html) {
  const field = (label) => {
    const match = html.match(
      new RegExp(String.raw`<div class="tema-campo">\s*${label}:\s*</div>\s*<p>([\s\S]*?)</p>`, 'i'),
    );
    return match ? clean(match[1]) : undefined;
  };
  const situacao = field('Situa.{1,2}o');
  return {
    existe: Boolean(situacao),
    repercussao: field('Repercuss.{1,2}o geral'),
    situacao,
  };
}

async function fetchTema(number) {
  const url = `https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=${number}`;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'pt-BR,pt;q=0.9' },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status < 400) return { http: response.status, ...parseStfTemaPage(await response.text()) };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = `${error.name}: ${error.message}`;
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  return { http: 0, erro: lastError };
}

async function main() {
  const { values } = parseArgs({
    options: { numbers: { type: 'string' }, out: { type: 'string' }, 'delay-ms': { type: 'string' } },
  });
  if (!values.numbers || !values.out) {
    throw new Error(
      'Uso: fetch-stf-temas.mjs --numbers <JSON com a lista de números> --out <JSON de saída> [--delay-ms 700]',
    );
  }
  const numbers = JSON.parse(await readFile(values.numbers, 'utf8'));
  const data = existsSync(values.out) ? JSON.parse(await readFile(values.out, 'utf8')) : {};
  const delay = Number(values['delay-ms'] ?? 700);
  for (const number of numbers) {
    if (data[number]?.http === 200) continue;
    data[number] = await fetchTema(number);
    if (Object.keys(data).length % 25 === 0) await writeFile(values.out, JSON.stringify(data, null, 1));
    await new Promise((done) => setTimeout(done, delay));
  }
  await writeFile(values.out, JSON.stringify(data, null, 1));
  console.log(
    JSON.stringify({
      temas: Object.keys(data).length,
      semSituacao: Object.values(data).filter((v) => !v.existe).length,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
