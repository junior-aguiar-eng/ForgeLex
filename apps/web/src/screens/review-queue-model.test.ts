import { describe, expect, it } from 'vitest';
import type { ReviewQueueItem } from '../operations/contracts';
import { createReviewQueueState, reduceReviewQueue } from './review-queue-model';

const item: ReviewQueueItem = { id: 'memo', kind: 'RESEARCH_MEMO', matterId: 'matter', targetId: 'memo', title: 'Memo', summary: 'Resumo', status: 'PENDING', requestedAt: '2026-09-20T00:00:00.000Z', actionUrl: '/review' };

describe('review queue model', () => {
  it('marca somente o item em resolução como ocupado', () => {
    const state = createReviewQueueState([item]);
    expect(reduceReviewQueue(state, { type: 'resolve_started', id: item.id }).items[0]?.busy).toBe(true);
  });

  it('preserva item pendente e registra conflito após falha', () => {
    const state = reduceReviewQueue(createReviewQueueState([item]), { type: 'resolve_started', id: item.id });
    expect(reduceReviewQueue(state, { type: 'resolve_failed', id: item.id, error: 'CONFLICT' }).items[0]).toMatchObject({ status: 'PENDING', busy: false, error: 'CONFLICT' });
  });

  it('substitui a fila pelo refresh persistido após decisão', () => {
    const state = reduceReviewQueue(createReviewQueueState([item]), { type: 'refreshed', items: [] });
    expect(state.items).toEqual([]);
  });
});
