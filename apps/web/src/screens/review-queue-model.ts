import type { ReviewQueueItem } from '../operations/contracts';

export type ReviewQueueViewItem = ReviewQueueItem & { busy?: boolean; error?: string };
export interface ReviewQueueState { items: ReviewQueueViewItem[] }
export type ReviewQueueAction =
  | { type: 'resolve_started'; id: string }
  | { type: 'resolve_failed'; id: string; error: string }
  | { type: 'refreshed'; items: ReviewQueueItem[] };

/** Nome que o cliente entende para o tipo interno de cada item da fila de revisão. */
export function reviewKindLabel(kind: string): string {
  if (kind === 'RESEARCH_MEMO') return 'Memorando de pesquisa';
  if (kind === 'DRAFT') return 'Minuta';
  return 'Item para revisão';
}

/** "1 pendente" ou "3 pendentes". */
export function pendingCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'pendente' : 'pendentes'}`;
}

/** Data e hora no horário local (dd/mm, hh:mm), no lugar do texto ISO que o servidor devolve. */
export function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function createReviewQueueState(items: ReviewQueueItem[]): ReviewQueueState { return { items }; }

export function reduceReviewQueue(state: ReviewQueueState, action: ReviewQueueAction): ReviewQueueState {
  if (action.type === 'refreshed') return { items: action.items };
  return {
    items: state.items.map((item) => item.id !== action.id ? item : action.type === 'resolve_started'
      ? { ...item, busy: true, error: undefined }
      : { ...item, busy: false, error: action.error }),
  };
}
