import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, type ApiResponse } from '../api-client';
import { createSearchIntent } from './contracts';
import { OperationsClient } from './operations-client';

describe('OperationsClient', () => {
  it('preserva a chave ao repetir a mesma intenção e gera outra para nova intenção', async () => {
    const requester = vi.fn(async (_path: string, _init?: RequestInit) => ({ data: { query: 'dano moral', court: 'STJ', total: 0, results: [] }, status: 200, headers: new Headers({ 'x-forgelex-billing-mode': 'METERED', 'x-credits-charged': '0.2', 'x-remaining-balance': '10', 'x-idempotent-replay': 'false' }) }) as ApiResponse<any>);
    const client = new OperationsClient(requester);
    const intent = createSearchIntent('dano moral', 'STJ');

    await client.searchCaseLaw(intent);
    await client.retrySearch(intent);

    expect((requester.mock.calls[0][1]?.headers as Record<string, string>)['Idempotency-Key']).toBe((requester.mock.calls[1][1]?.headers as Record<string, string>)['Idempotency-Key']);
    expect(createSearchIntent('dano moral', 'STJ').idempotencyKey).not.toBe(intent.idempotencyKey);
  });

  it('mapeia headers de billing e resultado zero', async () => {
    const client = new OperationsClient(async () => ({ data: { query: 'x', court: 'STJ', total: 0, results: [] }, status: 200, headers: new Headers({ 'x-forgelex-billing-mode': 'METERED', 'x-credits-charged': '0.2', 'x-remaining-balance': '6.3', 'x-idempotent-replay': 'false' }) }) as ApiResponse<any>);

    await expect(client.searchCaseLaw(createSearchIntent('x', 'STJ'))).resolves.toMatchObject({ resultCount: 0, billingMode: 'METERED', chargedCents: 20, remainingBalanceCents: 630, isReplay: false });
  });

  it('representa loading, ready, empty, unavailable e error nos recursos', async () => {
    expect(OperationsClient.loading<string[]>([])).toEqual({ state: 'loading', data: [] });
    const readyClient = new OperationsClient(async () => ({ data: { tribunals: [{ code: 'STJ', searchable: true }], total: 1 }, status: 200, headers: new Headers() }) as ApiResponse<any>);
    const emptyClient = new OperationsClient(async () => ({ data: { items: [], total: 0 }, status: 200, headers: new Headers() }) as ApiResponse<any>);
    const unavailableClient = new OperationsClient(async () => { throw new ApiRequestError('fonte indisponível', 'SOURCE_PROVIDER_UNAVAILABLE', 503); });
    const errorClient = new OperationsClient(async () => { throw new ApiRequestError('falha', 'API_ERROR', 500); });

    await expect(readyClient.loadTribunals()).resolves.toMatchObject({ state: 'ready' });
    await expect(emptyClient.loadHistory()).resolves.toEqual({ state: 'empty', data: [] });
    await expect(unavailableClient.loadReviewQueue()).resolves.toMatchObject({ state: 'unavailable', error: 'fonte indisponível' });
    await expect(errorClient.loadHistory()).resolves.toMatchObject({ state: 'error', error: 'falha' });
  });
});
