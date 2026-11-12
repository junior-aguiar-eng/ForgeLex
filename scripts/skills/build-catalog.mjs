import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import JSZip from 'jszip';
import { LAW_CODES, SPARSE_CODES, crosscheckItem, indexLaw } from './crosscheck-catalog.mjs';
import { inventoryCatalog, readCatalogEntry } from './inventory-catalog.mjs';

/**
 * M3.1 e M3.3 — monta o diretório do catálogo incorporado a partir do ZIP verificado, do mapa (M3.0), do cruzamento
 * (M3.2) e das redações ajustadas do Lote 0:
 *
 *   <saída>/catalog.json                 manifesto (metadados, proveniência e estado de revisão)
 *   <saída>/content/<id>@<versão>.md     texto de cada versão
 *
 * A saída é privada (nunca no repositório nem nos assets do navegador). Estado de cada ficha:
 *   elegível   mapeada sem ambiguidade e cruzada sem alerta, ou redação ajustada do Lote 0;
 *   ajustada   versão original que ganhou uma redação ajustada;
 *   pendente   na fila de ambíguas, com alerta, ou sem referência verificável. Segue no catálogo, nunca é selecionada.
 */
const sha = (value) => createHash('sha256').update(value).digest('hex');
const ROLES = { FORM: ['legal-drafter'], MATTER: ['matter-analyst'] };
const SOURCE = { origin: 'MinutaIA', decision: { id: 'DEC-4' } };
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

function aliasAreas(areas, aliases) {
  const out = new Set(areas);
  for (const area of areas) if (aliases.has(area)) out.add(aliases.get(area));
  return [...out];
}

/** Núcleo puro: recebe as fichas com conteúdo e devolve o manifesto e os arquivos de conteúdo. */
export function buildCatalog({
  rows,
  map,
  crosscheck,
  lot0 = new Map(),
  lot1 = new Map(),
  lot1Checks = new Map(),
  version,
  date,
  areaAliases = new Map(),
}) {
  const mapped = new Map(map.results.map((result) => [result.stableId, result]));
  const crossed = new Map(crosscheck.results.map((result) => [result.stableId, result]));
  const entries = [];
  const files = new Map();
  const counts = {};
  const count = (state) => (counts[state] = (counts[state] ?? 0) + 1);

  for (const row of rows) {
    const place = mapped.get(row.stableId);
    const check = crossed.get(row.stableId);
    if (!place || !check) throw new Error(`Ficha sem mapa ou sem cruzamento: ${row.stableId}`);
    const kind = place.kind;
    const id = place.catalogId ?? row.stableId;
    if (!ID.test(id)) throw new Error(`identificador fora do formato aceito: ${row.stableId}`);
    // Lote 0: redação ajustada após revisão amostral. Lote 1: redação atualizada para a norma equivalente à revogada;
    // o texto novo passa pelo mesmo cruzamento antes de entrar (ver `main`).
    const adjusted = lot0.get(row.stableId) ?? lot1.get(row.stableId);
    const lot1Checked = lot1.has(row.stableId);
    const base = {
      id,
      version: row.version,
      kind,
      roles: ROLES[kind],
      contentHash: row.sha256Content,
      byteLength: row.contentBytes,
      provenance: {
        ...SOURCE,
        originalVersion: row.version,
        originalHash: row.sha256Content,
        decision: { ...SOURCE.decision, date },
      },
    };
    const placement =
      kind === 'FORM'
        ? place.transversal
          ? { areas: [], transversal: true, documentType: place.documentType }
          : { areas: place.areas.length ? place.areas : ['sem-area'], documentType: place.documentType }
        : { area: place.area, topic: place.topic };
    // Rótulo legível (o título da ficha) e, nas Formas, as expressões que anunciam a peça: servem à Mesa (U3) no servidor.
    const label = typeof row.title === 'string' ? row.title.trim().slice(0, 160) : '';
    const triggers =
      kind === 'FORM'
        ? [
            ...new Set(
              (row.triggers ?? []).map((value) => String(value).trim()).filter((v) => v.length >= 2 && v.length <= 120),
            ),
          ].slice(0, 30)
        : [];
    Object.assign(base, label ? { label } : {}, triggers.length ? { triggers } : {});

    let reviewState;
    let alerts = [];
    let crossChecks = [];
    if (adjusted) {
      reviewState = 'adjusted';
      // A original superada guarda os alertas que motivaram o ajuste.
      if (check.state === 'alerta') {
        alerts = check.alerts.slice(0, 50).map((alert) => `${alert.code}:${alert.law}:${alert.article}`);
      }
    } else if (place.status === 'queue') {
      reviewState = 'pending';
      alerts = [`MAP:${place.queueReason}`];
    } else if (check.state === 'alerta') {
      reviewState = 'pending';
      alerts = check.alerts.slice(0, 50).map((alert) => `${alert.code}:${alert.law}:${alert.article}`);
    } else if (check.state === 'precedente-nao-verificado') {
      reviewState = 'pending';
      alerts = ['PRECEDENT_UNVERIFIED'];
    } else if (check.state !== 'sem-alerta') {
      reviewState = 'pending';
    } else {
      reviewState = 'eligible';
      crossChecks = check.crossChecks;
    }
    count(reviewState);
    entries.push({ ...base, ...placement, reviewState, crossChecks, alerts });
    files.set(`${id}@${row.version}.md`, row.content);

    if (adjusted) {
      const hash = sha(adjusted);
      const aliased =
        kind === 'FORM'
          ? {
              areas: aliasAreas(placement.areas, areaAliases),
              ...(placement.transversal ? { transversal: true } : {}),
              documentType: placement.documentType,
            }
          : { area: areaAliases.get(placement.area) ?? placement.area, topic: placement.topic };
      entries.push({
        ...base,
        ...aliased,
        version: row.version + 1,
        contentHash: hash,
        byteLength: Buffer.byteLength(adjusted),
        provenance: { ...base.provenance, adjustedFrom: { version: row.version, hash: row.sha256Content } },
        reviewState: 'eligible',
        crossChecks: lot1Checked ? lot1Checks.get(row.stableId) : ['conferencia-amostral'],
        alerts: [],
      });
      count(lot1Checked ? 'eligible-lote-1' : 'eligible-lote-0');
      files.set(`${id}@${row.version + 1}.md`, adjusted);
    }
  }
  return { manifest: { schemaVersion: 1, version, createdAt: date, entries }, files, counts };
}

async function readRows(archiveBytes) {
  await inventoryCatalog(archiveBytes);
  const zip = await JSZip.loadAsync(archiveBytes);
  const manifest = JSON.parse(await zip.file('MANIFESTO.json').async('string'));
  const rows = [];
  for (const row of manifest.files) {
    const { content, metadata } = readCatalogEntry(await zip.file(row.path).async('nodebuffer'), row);
    rows.push({ ...row, content, triggers: metadata.triggers });
  }
  return rows;
}

async function main() {
  const { values } = parseArgs({
    options: {
      archive: { type: 'string' },
      map: { type: 'string' },
      crosscheck: { type: 'string' },
      lot0: { type: 'string' },
      lot1: { type: 'string' },
      laws: { type: 'string' },
      supplements: { type: 'string' },
      out: { type: 'string' },
      version: { type: 'string' },
      date: { type: 'string' },
      'area-alias': { type: 'string' },
    },
  });
  for (const name of ['archive', 'map', 'crosscheck', 'out', 'version', 'date']) {
    if (!values[name]) {
      throw new Error(
        'Uso: node scripts/skills/build-catalog.mjs --archive <ZIP> --map <JSON> --crosscheck <JSON> --out <pasta nova> --version <id> --date <AAAA-MM-DD> [--lot0 <pasta com <stableId>.md>] [--area-alias civil=civel,...]',
      );
    }
  }
  const lot0 = new Map();
  if (values.lot0) {
    for (const name of await readdir(values.lot0)) {
      if (name.endsWith('.md')) lot0.set(name.slice(0, -3), await readFile(join(values.lot0, name), 'utf8'));
    }
  }
  // Lote 1: cada texto atualizado passa pelo cruzamento contra as normas carregadas e só entra sem alerta.
  const lot1 = new Map();
  const lot1Checks = new Map();
  if (values.lot1) {
    if (!values.laws) throw new Error('--lot1 exige --laws <pasta com os textos das normas>');
    const laws = {};
    for (const code of [...LAW_CODES, ...SPARSE_CODES]) {
      try {
        laws[code] = indexLaw(await readFile(join(values.laws, `${code}.md`), 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    const supplements = values.supplements ? JSON.parse(await readFile(values.supplements, 'utf8')) : {};
    for (const name of await readdir(values.lot1)) {
      if (!name.endsWith('.md')) continue;
      const stableId = name.slice(0, -3);
      const content = await readFile(join(values.lot1, name), 'utf8');
      const result = crosscheckItem({ stableId, category: 'materia', content }, laws, supplements);
      if (result.state !== 'sem-alerta') {
        throw new Error(`Texto atualizado ainda com pendência (${result.state}): ${stableId}`);
      }
      lot1.set(stableId, content);
      lot1Checks.set(stableId, [...result.crossChecks, 'norma-atualizada']);
    }
  }
  const areaAliases = new Map(
    (values['area-alias'] ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => pair.split('=')),
  );
  const built = buildCatalog({
    rows: await readRows(await readFile(values.archive)),
    map: JSON.parse(await readFile(values.map, 'utf8')),
    crosscheck: JSON.parse(await readFile(values.crosscheck, 'utf8')),
    lot0,
    lot1,
    lot1Checks,
    version: values.version,
    date: values.date,
    areaAliases,
  });
  await mkdir(join(values.out, 'content'), { recursive: true });
  if ((await readdir(join(values.out, 'content'))).length) throw new Error('A pasta de saída precisa estar vazia');
  for (const [name, content] of built.files)
    await writeFile(join(values.out, 'content', name), content, { flag: 'wx' });
  await writeFile(join(values.out, 'catalog.json'), JSON.stringify(built.manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      version: values.version,
      entries: built.manifest.entries.length,
      byState: built.counts,
      output: values.out,
    }),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
