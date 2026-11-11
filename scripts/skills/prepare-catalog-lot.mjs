import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { inventoryCatalog } from './inventory-catalog.mjs';

const targets = [
  { stableId: 'resposta-acusacao', version: 3, category: 'forma', area: 'penal', cases: ['custodia', 'incidental'] },
  {
    stableId: 'cadeia-custodia-cpp-158',
    version: 3,
    category: 'materia',
    area: 'penal',
    sourceArea: 'processo-penal',
    cases: ['custodia'],
  },
  { stableId: 'contestacao-civel', version: 3, category: 'forma', area: 'civel', cases: ['civel'] },
  {
    stableId: 'adimplemento-pagamento-cc-304',
    version: 2,
    category: 'materia',
    area: 'civel',
    sourceArea: 'civil',
    cases: ['civel'],
  },
];

/** Derives a review queue from the verified inventory. */
export function prepareCatalogLot(inventory) {
  const candidates = targets.map(({ stableId, version, category, sourceArea, ...target }) => {
    const matches = inventory.items.filter((item) => item.stableId === stableId && item.version === version);
    const [item] = matches;
    if (
      matches.length !== 1 ||
      item.category !== category ||
      (category === 'forma' ? item.documentType !== stableId : item.area !== sourceArea)
    )
      throw new Error(`Candidato divergente no inventário: ${stableId} v${version}`);
    return {
      ...target,
      stableId,
      version,
      category,
      documentType: item.documentType ?? null,
      sourceArea: sourceArea ?? null,
      sourceSubarea: item.subarea ?? null,
      sha256Content: item.sha256Content,
      contentBytes: item.contentBytes,
      reviewReasons: item.reviewReasons,
      eligibility: 'pending',
    };
  });
  return {
    lotVersion: 'penal-civel-r15-v1',
    inventory: {
      source: inventory.source,
      archiveSha256: inventory.archiveSha256,
      counts: inventory.counts,
      total: inventory.counts.forma + inventory.counts.materia,
    },
    candidates,
  };
}

async function main() {
  const { values } = parseArgs({
    options: { archive: { type: 'string' }, out: { type: 'string' } },
  });
  if (!values.archive || !values.out)
    throw new Error('Uso: node scripts/skills/prepare-catalog-lot.mjs --archive <ZIP> --out <JSON local>');
  const lot = prepareCatalogLot(await inventoryCatalog(await readFile(values.archive)));
  await writeFile(values.out, JSON.stringify(lot, null, 2) + '\n', { flag: 'wx' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
