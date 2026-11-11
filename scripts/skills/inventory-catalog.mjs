import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, TextDecoder } from 'node:util';
import JSZip from 'jszip';

const capture = {
  archiveSha256: '2a0efbbc301e53c357d5fe6baac1a896c84669fc1646a62c2aec410550543d01',
  counts: { forma: 303, materia: 1774 },
};
const folders = { forma: 'Forma', materia: 'Matéria' };
const sha = (value) => createHash('sha256').update(value).digest('hex');
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

function assertValid(condition, message) {
  if (!condition) throw new Error(message);
}

function validateManifest(manifest, counts) {
  const total = counts.forma + counts.materia;
  assertValid(
    manifest?.scope?.isOfficial === true &&
      manifest.scope.isActive === true &&
      manifest.errors === 0 &&
      manifest.expected === total &&
      manifest.counts?.Forma === counts.forma &&
      manifest.counts?.Matéria === counts.materia &&
      Array.isArray(manifest.files) &&
      manifest.files.length === total,
    'Escopo ou contagem divergente no manifesto',
  );
}

function validateEntries(zip, entries) {
  const paths = new Set();
  const ids = new Set();
  const stableIds = new Set();
  const allowed = new Set(['MANIFESTO.json', 'LEIA-ME.md']);
  for (const row of entries) {
    assertValid(row && Object.hasOwn(folders, row.category), 'Categoria inválida no manifesto');
    assertValid(nonempty(row.id) && nonempty(row.stableId), 'Identidade ausente no manifesto');
    const filename = /^[a-z0-9_-]+$/i.test(row.stableId)
      ? row.stableId
      : encodeURIComponent(row.stableId).replace(/\./g, '%2E');
    assertValid(row.path === folders[row.category] + '/' + filename + '.md', 'Caminho inseguro no manifesto');
    const key = row.path.toLowerCase();
    const stableKey = row.category + '/' + row.stableId.toLowerCase();
    assertValid(!paths.has(key) && !ids.has(row.id) && !stableIds.has(stableKey), 'Registro duplicado no manifesto');
    paths.add(key);
    ids.add(row.id);
    stableIds.add(stableKey);
    allowed.add(row.path);
  }
  for (const entry of Object.values(zip.files)) {
    assertValid(
      !entry.dir && allowed.has(entry.name) && (!entry.unsafeOriginalName || entry.unsafeOriginalName === entry.name),
      'Entrada não inventariada ou insegura no ZIP',
    );
  }
  assertValid(Object.keys(zip.files).length === allowed.size, 'Arquivo esperado ausente no ZIP');
}

function readMarkdown(bytes, row) {
  assertValid(sha(bytes) === row.sha256File, 'Hash do Markdown divergente: ' + row.path);
  const text = utf8.decode(bytes);
  const cut = text.indexOf('\n---\n\n', 4);
  assertValid(text.startsWith('---\n') && cut >= 0, 'Cabeçalho inválido: ' + row.path);
  const metadata = Object.create(null);
  for (const line of text.slice(4, cut).split('\n')) {
    const split = line.indexOf(': ');
    const name = line.slice(0, split);
    assertValid(
      split > 0 && /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !Object.hasOwn(metadata, name),
      'Metadados inválidos ou duplicados: ' + row.path,
    );
    metadata[name] = JSON.parse(line.slice(split + 2));
  }
  const content = text.slice(cut + '\n---\n\n'.length);
  assertValid(
    content.length === row.contentLength &&
      Buffer.byteLength(content) === row.contentBytes &&
      sha(content) === row.sha256Content,
    'Conteúdo divergente: ' + row.path,
  );
  assertValid(
    ['id', 'stableId', 'title', 'category', 'version', 'contentLength'].every((key) => metadata[key] === row[key]) &&
      nonempty(row.title) &&
      Number.isInteger(row.version) &&
      row.version > 0 &&
      metadata.isOfficial === true &&
      metadata.isActive === true,
    'Metadados divergentes: ' + row.path,
  );
  return metadata;
}

function indexItem(row, metadata) {
  const reviewReasons = [];
  let area = null;
  let subarea = null;
  const sourcePath = nonempty(metadata.sourcePath) ? metadata.sourcePath : null;
  const documentType = nonempty(metadata.documentType) ? metadata.documentType : null;
  if (row.category === 'materia') {
    const parts = sourcePath?.match(/^lib\/skills\/official\/materia\/([^/]+)\/(.+)\/[^/]+\.md$/);
    const declared = nonempty(metadata.materia) ? metadata.materia.trim().toLowerCase() : null;
    const fromPath = parts?.[1].toLowerCase();
    if (declared && fromPath && declared !== fromPath) {
      reviewReasons.push('AREA_CONFLICT');
    } else {
      area = declared ?? fromPath ?? null;
      subarea = parts?.[2] ?? null;
      if (!area || !subarea) reviewReasons.push('AREA_OR_SUBAREA_UNDECLARED');
    }
  } else if (!documentType) {
    reviewReasons.push('DOCUMENT_TYPE_UNDECLARED');
  }
  const description = nonempty(metadata.description) ? metadata.description.trim() : null;
  if (!description) reviewReasons.push('DESCRIPTION_MISSING');
  return {
    ...row,
    sourcePath,
    documentType,
    area,
    subarea,
    description,
    triggers: Array.isArray(metadata.triggers)
      ? [...new Set(metadata.triggers.filter(nonempty).map((value) => value.trim()))]
      : [],
    updatedAt: metadata.updated_at ?? null,
    reviewStatus: 'pending',
    reviewReasons,
  };
}

function group(items, fields) {
  const groups = new Map();
  for (const item of items) {
    const key = JSON.stringify(fields.map((field) => item[field]));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function coverage(items, fields) {
  return [...group(items, fields).values()].map((entries) => ({
    ...Object.fromEntries(fields.map((field) => [field, entries[0][field]])),
    count: entries.length,
  }));
}

function overlaps(items, fields) {
  return [...group(items, fields).values()]
    .filter((entries) => entries.length > 1)
    .map((entries) => entries.map((item) => item.path));
}

export async function inventoryCatalog(bytes, { archiveSha256, counts } = capture) {
  assertValid(sha(bytes) === archiveSha256, 'SHA-256 do ZIP diverge da captura esperada');
  const zip = await JSZip.loadAsync(bytes);
  const manifestFile = zip.file('MANIFESTO.json');
  assertValid(manifestFile, 'Manifesto ausente');
  const manifest = JSON.parse(await manifestFile.async('string'));
  validateManifest(manifest, counts);
  validateEntries(zip, manifest.files);
  const items = [];
  for (const row of manifest.files) {
    const bytes = await zip.file(row.path).async('nodebuffer');
    items.push(indexItem(row, readMarkdown(bytes, row)));
  }
  items.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const forms = items.filter((item) => item.category === 'forma');
  const matters = items.filter((item) => item.category === 'materia');
  assertValid(
    forms.length === counts.forma && matters.length === counts.materia,
    'Contagem real por categoria divergente',
  );
  return {
    schemaVersion: 1,
    source: manifest.source,
    capturedOn: manifest.capturedOn,
    archiveSha256,
    counts: { forma: forms.length, materia: matters.length },
    coverage: {
      forms: coverage(forms, ['documentType']),
      matters: coverage(matters, ['area', 'subarea']),
    },
    overlaps: {
      sameTitle: overlaps(items, ['category', 'title']),
      sameContent: overlaps(items, ['sha256Content']),
    },
    items,
  };
}

async function main() {
  const { values } = parseArgs({
    options: { archive: { type: 'string' }, out: { type: 'string' } },
  });
  assertValid(
    values.archive && values.out,
    'Uso: node scripts/skills/inventory-catalog.mjs --archive <ZIP> --out <JSON local>',
  );
  const result = await inventoryCatalog(await readFile(values.archive));
  await writeFile(values.out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ counts: result.counts, archiveSha256: result.archiveSha256, output: values.out }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
