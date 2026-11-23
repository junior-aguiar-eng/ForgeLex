import type { EvidenceReviewItem } from './evidence-review.js';

/**
 * Public reference the user can use for an item: facts F1, F2..., evidence P1, P2..., in review order. No runtime
 * imports: the Estrutura tab (browser) numbers with this same function, so the agent and the tab always agree.
 */
export function structureItemLabels(items: readonly Pick<EvidenceReviewItem, 'id' | 'kind'>[]): Map<string, string> {
  const labels = new Map<string, string>();
  let facts = 0,
    evidence = 0;
  for (const item of items) {
    if (item.kind === 'FACT') labels.set(item.id, `F${++facts}`);
    else if (item.kind === 'EVIDENCE') labels.set(item.id, `P${++evidence}`);
  }
  return labels;
}
