import { open, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  manifestToCatalog,
  mattersFromManifest,
  parseSkillManifest,
  piecesFromManifest,
  type DeskMatter,
  type DeskPiece,
} from '@forgelex/legal-workflows';
import type { NativeCaseTaskOptions } from '../agentic-workspace/case-task-driver.js';

/**
 * Catálogo de habilidades incorporado (M3.1), lido de um diretório privado do servidor, fora dos assets públicos e do
 * bundle do navegador:
 *
 *   <diretório>/catalog.json                 manifesto: metadados, proveniência e estado de revisão
 *   <diretório>/content/<id>@<versão>.md     o texto de cada versão de cada ficha
 *
 * Versões convivem lado a lado, então uma execução já iniciada continua lendo a versão e o hash que fixou, mesmo
 * depois de o catálogo ganhar uma versão nova. O hash é conferido pelo vínculo (`bindDeskSkills`), não aqui.
 */
export type FileSkillCatalog = NonNullable<NativeCaseTaskOptions['skills']>;
/** O catálogo de habilidades mais a lista interna de peças que a Mesa pode propor (U3); a lista não vai ao navegador. */
export type LoadedSkillCatalog = FileSkillCatalog & {
  readonly pieces: readonly DeskPiece[];
  readonly matters: readonly DeskMatter[];
};

const MANIFEST_LIMIT_BYTES = 16 * 1024 * 1024;
// Valores propostos a partir das fichas reais (mediana de 7,5 KB, máximo de 27 KB); o servidor pode trocá-los.
export const DEFAULT_SKILL_BUDGET = Object.freeze({ maxBytesPerRole: 64 * 1024, maxBytesTotal: 96 * 1024 });

const contentPath = (directory: string, id: string, version: number) =>
  join(directory, 'content', `${id}@${version}.md`);

export async function loadFileSkillCatalog(
  directory: string,
  budget: FileSkillCatalog['budget'] = DEFAULT_SKILL_BUDGET,
): Promise<LoadedSkillCatalog> {
  const manifestFile = join(directory, 'catalog.json');
  if ((await stat(manifestFile)).size > MANIFEST_LIMIT_BYTES) throw new Error('SKILL_MANIFEST_TOO_LARGE');
  const manifest = parseSkillManifest(JSON.parse(await readFile(manifestFile, 'utf8')));
  // Falha na subida, não no primeiro pedido: toda ficha elegível precisa ter o arquivo com o tamanho declarado.
  for (const entry of manifest.entries) {
    if (entry.reviewState !== 'eligible') continue;
    const size = (await stat(contentPath(directory, entry.id, entry.version)).catch(() => undefined))?.size;
    if (size !== entry.byteLength) throw new Error(`SKILL_CONTENT_MISSING:${entry.id}@${entry.version}`);
  }
  return Object.freeze({
    catalog: manifestToCatalog(manifest),
    pieces: Object.freeze(piecesFromManifest(manifest)),
    matters: Object.freeze(mattersFromManifest(manifest)),
    budget,
    loadContent: async ({ id, version, byteLength }: Parameters<FileSkillCatalog['loadContent']>[0]) => {
      const file = await open(contentPath(directory, id, version), 'r');
      try {
        const buffer = Buffer.alloc(byteLength + 1);
        const { bytesRead } = await file.read(buffer, 0, byteLength + 1, 0);
        if (bytesRead !== byteLength) throw new Error('SKILL_CONTENT_SIZE_MISMATCH');
        return buffer.toString('utf8', 0, bytesRead);
      } finally {
        await file.close();
      }
    },
  });
}

/** Lê as variáveis do servidor. Sem `FORGELEX_SKILL_CATALOG_DIR` não há catálogo e nenhuma habilidade é aplicada. */
export async function skillCatalogFromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Promise<LoadedSkillCatalog | undefined> {
  const directory = environment.FORGELEX_SKILL_CATALOG_DIR?.trim();
  if (!directory) return undefined;
  const number = (name: string, fallback: number) => {
    const raw = environment[name]?.trim();
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`INVALID_${name}`);
    return value;
  };
  return loadFileSkillCatalog(directory, {
    maxBytesPerRole: number('FORGELEX_SKILL_BUDGET_ROLE_BYTES', DEFAULT_SKILL_BUDGET.maxBytesPerRole),
    maxBytesTotal: number('FORGELEX_SKILL_BUDGET_TOTAL_BYTES', DEFAULT_SKILL_BUDGET.maxBytesTotal),
  });
}
