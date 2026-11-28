import type { EvidenceReviewDecision, EvidenceReviewItem } from '../../../../packages/domain/src/index';

/** O que a linha de leitura usa da revisão da análise (`GET /api/agentic/deliveries/:id/evidence-review`). */
export type StructureReviewItem = Pick<EvidenceReviewItem, 'id' | 'kind' | 'text' | 'originIds' | 'eventDate'> & {
  references: { sourceId: string; start: number; quote?: string }[];
};
export interface StructureReview {
  items: StructureReviewItem[];
  decisions: Record<string, Pick<EvidenceReviewDecision, 'action' | 'text' | 'eventDate'>>;
}

/**
 * Linha de leitura da estrutura para a orientação guiada ("Estrutura do caso: 5 fatos, 2 itens a confirmar"). Conta os
 * fatos que o usuário não retirou e os itens (exceto lacunas) ainda sem decisão. Sem itens, não há linha.
 */
export function structureReadingLine(review?: StructureReview): string | undefined {
  const kept = (review?.items ?? []).filter((item) => review?.decisions[item.id]?.action !== 'DISCARD');
  const facts = kept.filter((item) => item.kind === 'FACT').length;
  const unchecked = kept.filter((item) => item.kind !== 'GAP' && !review?.decisions[item.id]).length;
  if (!facts && !unchecked) return undefined;
  const parts = [
    ...(facts ? [`${facts} ${facts === 1 ? 'fato' : 'fatos'}`] : []),
    unchecked ? `${unchecked} ${unchecked === 1 ? 'item a confirmar' : 'itens a confirmar'}` : 'tudo conferido',
  ];
  return `Estrutura do caso: ${parts.join(', ')}`;
}
