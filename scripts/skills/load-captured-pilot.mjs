import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { inventoryCatalog, readCatalogEntry } from './inventory-catalog.mjs';
import { prepareCatalogLot } from './prepare-catalog-lot.mjs';

export async function loadCapturedPilot(path) {
  if (!path) throw new Error('Defina FORGELEX_E2E_SKILL_ARCHIVE com o caminho do ZIP verificado.');
  const bytes = await readFile(path);
  const inventory = await inventoryCatalog(bytes);
  const zip = await JSZip.loadAsync(bytes);
  return Promise.all(
    prepareCatalogLot(inventory).candidates.map(async (candidate) => {
      const row = inventory.items.find(
        (item) => item.stableId === candidate.stableId && item.version === candidate.version,
      );
      const { content } = readCatalogEntry(await zip.file(row.path).async('nodebuffer'), row);
      return { ...candidate, id: row.id, content };
    }),
  );
}

export async function loadRevisedPilot(path) {
  const captured = await loadCapturedPilot(path);
  return Promise.all(
    captured.map(async ({ content: _original, ...candidate }) => {
      const content = await readFile(
        new URL(`../../tests/fixtures/desk-pilot-revised/${candidate.stableId}.md`, import.meta.url),
        'utf8',
      );
      return {
        ...candidate,
        derivedFrom: { version: candidate.version, sha256Content: candidate.sha256Content },
        version: candidate.version + 1,
        sha256Content: createHash('sha256').update(content).digest('hex'),
        contentBytes: Buffer.byteLength(content),
        content,
      };
    }),
  );
}
