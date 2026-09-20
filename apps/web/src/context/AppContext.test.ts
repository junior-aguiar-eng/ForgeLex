import { describe, expect, it, vi } from 'vitest';
import type { OperationsClient } from '../operations/operations-client';
import type { ReviewQueueItem } from '../operations/contracts';
import { createOperationalActions } from './AppContext';

describe('AppContext operational actions', () => {
  it('recarrega a fila após decisão concluída', async () => {
    const item: ReviewQueueItem = { id: 'memo', kind: 'RESEARCH_MEMO', matterId: 'matter', targetId: 'memo', title: 'Memo', summary: 'Resumo', status: 'PENDING', requestedAt: new Date().toISOString(), actionUrl: '/review' };
    const client = { resolveReview: vi.fn().mockResolvedValue(undefined), loadReviewQueue: vi.fn().mockResolvedValue({ state: 'empty', data: [] }) } as unknown as OperationsClient;
    const applyQueue = vi.fn();
    const actions = createOperationalActions(client, applyQueue);

    await actions.resolveReview(item, 'APPROVED');

    expect(client.resolveReview).toHaveBeenCalledWith(item, 'APPROVED', undefined);
    expect(client.loadReviewQueue).toHaveBeenCalledTimes(1);
    expect(applyQueue).toHaveBeenCalledWith({ state: 'empty', data: [] });
  });

  it('mantém os dados reais quando a decisão falha e marca somente erro', async () => {
    const item: ReviewQueueItem = { id: 'memo', kind: 'RESEARCH_MEMO', matterId: 'matter', targetId: 'memo', title: 'Memo', summary: 'Resumo', status: 'PENDING', requestedAt: new Date().toISOString(), actionUrl: '/review' };
    const client = { resolveReview: vi.fn().mockRejectedValue(new Error('CONFLICT')), loadReviewQueue: vi.fn() } as unknown as OperationsClient;
    const applyQueue = vi.fn();
    const actions = createOperationalActions(client, applyQueue);

    await expect(actions.resolveReview(item, 'REJECTED')).rejects.toThrow('CONFLICT');
    expect(applyQueue).toHaveBeenCalledWith({ state: 'error', data: [item], error: 'CONFLICT' });
    expect(client.loadReviewQueue).not.toHaveBeenCalled();
  });
});
