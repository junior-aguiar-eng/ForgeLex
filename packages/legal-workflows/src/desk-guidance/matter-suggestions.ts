import { createHash } from 'node:crypto';
import type { SkillManifest } from '@forgelex/legal-agents';
import { rankPieces, type DeskPiece } from './piece-ranking.js';

/**
 * Matéria que a Mesa pode sugerir ao cliente como dica do pedido (U4). Vem das Matérias elegíveis do catálogo: `id` é o
 * tópico interno, `label` o rótulo legível. A lista fica no servidor; ao cliente só vão o rótulo e um código opaco.
 */
export interface DeskMatter {
  readonly id: string;
  readonly label: string;
  readonly area: string;
}

export interface MatterSuggestion {
  /** Código opaco, estável para a mesma matéria: serve para o cliente dizer "não essa" sem conhecer o id interno. */
  readonly token: string;
  readonly label: string;
}

export const matterToken = (id: string) => createHash('sha256').update(`matter:${id}`).digest('hex').slice(0, 16);

export function mattersFromManifest(manifest: SkillManifest): DeskMatter[] {
  const byTopic = new Map<string, { matter: DeskMatter; version: number }>();
  for (const entry of manifest.entries) {
    if (entry.kind !== 'MATTER' || entry.reviewState !== 'eligible' || !entry.label) continue;
    const key = `${entry.area}|${entry.topic}`;
    if ((byTopic.get(key)?.version ?? 0) >= entry.version) continue;
    byTopic.set(key, { version: entry.version, matter: { id: entry.topic, label: entry.label, area: entry.area } });
  }
  return [...byTopic.values()].map(({ matter }) => matter).sort((a, b) => (a.id < b.id ? -1 : 1));
}

const asPiece = (matter: DeskMatter): DeskPiece => ({
  id: matter.id,
  label: matter.label,
  areas: [matter.area],
  transversal: false,
  triggers: [],
});

/**
 * Sugere uma matéria por vez a partir do texto do cliente, sem provedor e sem lista exposta. `rejected` traz os códigos
 * opacos que o cliente já recusou; `area` restringe às matérias da área escolhida. Sem candidata, devolve `null`.
 */
export function suggestMatter(input: {
  readonly matters: readonly DeskMatter[];
  readonly text: string;
  readonly area?: string | null;
  readonly rejected?: readonly string[];
}): MatterSuggestion | null {
  const rejected = new Set(input.rejected ?? []);
  const [top] = rankPieces({
    pieces: input.matters.filter((matter) => !rejected.has(matterToken(matter.id))).map(asPiece),
    text: input.text,
    area: input.area ?? null,
  });
  return top ? { token: matterToken(top.piece.id), label: top.piece.label } : null;
}
