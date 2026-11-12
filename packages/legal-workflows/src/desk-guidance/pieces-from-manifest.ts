import type { SkillManifest } from '@forgelex/legal-agents';
import type { DeskPiece } from './piece-ranking.js';

/**
 * Lista interna de peças que a Mesa pode propor, tirada das Formas elegíveis do catálogo incorporado. Forma sem rótulo
 * não entra: a Mesa não promete o que não sabe nomear. A lista fica no servidor; o cliente só vê a peça em uso.
 */
export function piecesFromManifest(manifest: SkillManifest): DeskPiece[] {
  const byType = new Map<string, { piece: DeskPiece; version: number }>();
  for (const entry of manifest.entries) {
    if (entry.kind !== 'FORM' || entry.reviewState !== 'eligible' || !entry.label) continue;
    // Uma peça por tipo; se duas versões elegíveis coexistirem, vale a de maior versão.
    if ((byType.get(entry.documentType)?.version ?? 0) >= entry.version) continue;
    byType.set(entry.documentType, {
      version: entry.version,
      piece: {
        id: entry.documentType,
        label: entry.label,
        areas: [...entry.areas],
        transversal: Boolean(entry.transversal),
        triggers: [...(entry.triggers ?? [])],
      },
    });
  }
  return [...byType.values()].map(({ piece }) => piece).sort((a, b) => (a.id < b.id ? -1 : 1));
}
