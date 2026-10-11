import { describe, expect, it, vi } from 'vitest';
import { OperationsClient } from '../operations/operations-client';
import type { ReviewQueueItem } from '../operations/contracts';
import { createOperationalActions, loadVisibleOperationalState } from './AppContext';

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


describe('carga operacional visível', () => {
  it.each([false, true])('preserva recursos reais no modo casesEnabled=%s', async (enabled) => {
    const paths: string[] = [];
    const requester = async <T,>(path: string) => {
      paths.push(path);
      if (path.includes('review-queue')) throw new Error('review unavailable');
      return { data: path.includes('tribunals') ? { tribunals: [{ code: 'STJ', searchable: true }] } : { items: [{ id: 'history-real' }] }, headers: new Headers(), status: 200 } as { data: T; headers: Headers; status: number };
    };
    const client = new OperationsClient(requester);
    for (let refresh = 0; refresh < 2; refresh++) {
      const result = await loadVisibleOperationalState(client, enabled);
      expect(result.tribunals).toEqual({ state: 'ready', data: [{ code: 'STJ', searchable: true }] });
      expect(result.history).toEqual({ state: 'ready', data: [{ id: 'history-real' }] });
      expect(result.reviewQueue).toEqual(enabled ? { state: 'error', data: [], error: 'review unavailable' } : { state: 'unavailable', data: [] });
    }
    expect(paths.filter(path => path.includes('review-queue')).length).toBe(enabled ? 2 : 0);
  });
});
