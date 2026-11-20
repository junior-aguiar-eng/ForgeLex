import type { PresentedBlock } from '../agentic-workspace/present-delivery';

/** Um item da estrutura do caso: o texto, a classificação (alegação, inferência…) e as fontes que o sustentam. */
export interface StructureEntry {
  kind: 'item' | 'paragraph';
  text: string;
  tag?: string;
  citations: number[];
}

/** Uma parte da estrutura, como "Questões", "Afirmações", "Cronologia" ou "Contradições". */
export interface StructureSection {
  title: string;
  entries: StructureEntry[];
}

/** Título das linhas que a análise emite antes de qualquer cabeçalho, para não ficarem soltas. */
export const STRUCTURE_LEAD_TITLE = 'Em síntese';

/**
 * Agrupa os blocos que a Mesa já sabe apresentar (cabeçalho, parágrafo, item) em partes com título. Os blocos que vêm
 * antes de qualquer cabeçalho formam a primeira parte; cabeçalho sem nada embaixo não vira parte.
 */
export function structureSections(blocks: readonly PresentedBlock[]): StructureSection[] {
  const sections: StructureSection[] = [];
  let current: StructureSection | undefined;
  for (const block of blocks) {
    if (block.kind === 'heading') {
      current = { title: block.text, entries: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: STRUCTURE_LEAD_TITLE, entries: [] };
      sections.push(current);
    }
    current.entries.push({
      kind: block.kind,
      text: block.text,
      ...(block.tag ? { tag: block.tag } : {}),
      citations: block.citations,
    });
  }
  return sections.filter((section) => section.entries.length > 0);
}

/** Quantos itens a estrutura tem no total (cabeçalhos não contam). */
export function structureSize(sections: readonly StructureSection[]): number {
  return sections.reduce((total, section) => total + section.entries.length, 0);
}
