import type { ReviewQueueItem } from '../operations/contracts';

export type ReviewQueueViewItem = ReviewQueueItem & { busy?: boolean; error?: string };
export interface ReviewQueueState { items: ReviewQueueViewItem[] }
export type ReviewQueueAction =
  | { type: 'resolve_started'; id: string }
  | { type: 'resolve_failed'; id: string; error: string }
  | { type: 'refreshed'; items: ReviewQueueItem[] };

export function createReviewQueueState(items: ReviewQueueItem[]): ReviewQueueState { return { items }; }

export function reduceReviewQueue(state: ReviewQueueState, action: ReviewQueueAction): ReviewQueueState {
  if (action.type === 'refreshed') return { items: action.items };
  return {
    items: state.items.map((item) => item.id !== action.id ? item : action.type === 'resolve_started'
      ? { ...item, busy: true, error: undefined }
      : { ...item, busy: false, error: action.error }),
  };
}
