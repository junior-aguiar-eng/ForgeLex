import { ApiRequestError, requestApi } from '../api-client';
import { mapSearchResult } from '../operations/operations-client';
import type { ReaderEntry } from '../components/DecisionReader';
export interface SavedSearchSummary {
  id: string;
  operationId: string;
  criteria: { query: string; court?: string; judgmentYear?: number; limit: number };
  resultCount: number;
  searchedAt: string;
  savedAt: string;
}
export interface SavedSearch extends SavedSearchSummary {
  entries: ReaderEntry[];
}
export const savedResearchClient = {
  async list(): Promise<SavedSearchSummary[]> {
    try {
      return (await requestApi<{ items: SavedSearchSummary[] }>('/api/v2/research/saved')).items;
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 404)
        throw new Error('Pesquisas salvas estão indisponíveis.', { cause: error });
      throw error;
    }
  },
  save(operationId: string): Promise<SavedSearchSummary> {
    return requestApi('/api/v2/research/saved', { method: 'POST', body: JSON.stringify({ operationId }) });
  },
  async get(id: string): Promise<SavedSearch> {
    const saved = await requestApi<SavedSearchSummary & { results: { items: unknown[] } }>(
      `/api/v2/research/saved/${encodeURIComponent(id)}`,
    );
    return {
      ...saved,
      entries: saved.results.items.map((item) => {
        if (
          !item ||
          typeof item !== 'object' ||
          !('id' in item) ||
          typeof item.id !== 'string' ||
          !('processNumber' in item) ||
          typeof item.processNumber !== 'string'
        )
          return { unavailable: true };
        return { decision: mapSearchResult(item) };
      }),
    };
  },
  async delete(id: string): Promise<void> {
    await requestApi(`/api/v2/research/saved/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
