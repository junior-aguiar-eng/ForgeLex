import { requestApi } from '../api-client';
import { mapSearchResult } from '../operations/operations-client';
import type { SearchResultItem } from '../operations/contracts';
export interface SavedSearchSummary {
  id: string;
  operationId: string;
  criteria: { query: string; court?: string; judgmentYear?: number; limit: number };
  resultCount: number;
  searchedAt: string;
  savedAt: string;
}
export interface SavedSearch extends SavedSearchSummary {
  entries: { decision: SearchResultItem }[];
}
export const savedResearchClient = {
  async list(): Promise<SavedSearchSummary[]> {
    return (await requestApi<{ items: SavedSearchSummary[] }>('/api/v2/research/saved')).items;
  },
  save(operationId: string): Promise<SavedSearchSummary> {
    return requestApi('/api/v2/research/saved', { method: 'POST', body: JSON.stringify({ operationId }) });
  },
  async get(id: string): Promise<SavedSearch> {
    const saved = await requestApi<SavedSearchSummary & { results: { items: unknown[] } }>(
      `/api/v2/research/saved/${encodeURIComponent(id)}`,
    );
    return { ...saved, entries: saved.results.items.map((item) => ({ decision: mapSearchResult(item) })) };
  },
  async delete(id: string): Promise<void> {
    await requestApi(`/api/v2/research/saved/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
