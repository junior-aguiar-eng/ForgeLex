export type RemoteState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'error';
export type OperationalResource<T> = { state: RemoteState; data: T; error?: string };

export interface TribunalCapability {
  code: string;
  searchable: boolean;
  verifiable?: boolean;
  status?: string;
  providerId?: string | null;
}

export interface ResearchHistoryItem {
  id: string;
  operationId: string;
  query: string;
  court: string;
  resultCount: number;
  billingMode: 'FREE' | 'METERED';
  chargedCents: number;
  createdAt: string;
}

export interface ReviewQueueItem {
  id: string;
  kind: 'DRAFT' | 'RESEARCH_MEMO';
  matterId: string;
  targetId: string;
  title: string;
  summary: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  decidedAt?: string;
  actionUrl: string;
}

export interface SearchResultItem {
  id: string;
  court: string;
  processNumber: string;
  relator: string;
  judgmentDate: string;
  publicationDate: string;
  chamber?: string;
  ementa: string;
  sourceUrl: string;
  sourceProvider: string;
  dedupeKey: string;
  isBinding: boolean;
  verificationStatus: 'VERIFIED_OFFICIAL' | 'VERIFIED_PROVIDER' | 'UNVERIFIED' | 'CONFLICTING_METADATA' | 'NOT_FOUND';
}

export type SearchIntent = { idempotencyKey: string; query: string; court: 'STJ'; limit: number };

export const createSearchIntent = (query: string, court: 'STJ', limit = 20): SearchIntent => ({
  idempotencyKey: `web_search_${crypto.randomUUID()}`,
  query: query.trim(),
  court,
  limit,
});

export interface SearchExecution {
  intent: SearchIntent;
  results: SearchResultItem[];
  resultCount: number;
  billingMode: 'FREE' | 'METERED';
  chargedCents: number;
  remainingBalanceCents: number;
  isReplay: boolean;
}
