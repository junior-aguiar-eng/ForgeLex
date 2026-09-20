import { ApiRequestError, requestApiResponse, type ApiResponse } from '../api-client';
import type { OperationalResource, ResearchHistoryItem, ReviewQueueItem, SearchExecution, SearchIntent, SearchResultItem, TribunalCapability } from './contracts';

export type ApiRequester = <T>(path: string, init?: RequestInit) => Promise<ApiResponse<T>>;

function cents(value: string | null): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function mapSearchResult(item: any): SearchResultItem {
  return {
    id: item.id,
    court: item.court,
    processNumber: item.processNumber,
    relator: item.rapporteur,
    judgmentDate: item.judgmentDate,
    publicationDate: item.publicationDate,
    chamber: item.chamber,
    ementa: item.syllabus,
    sourceUrl: item.fullTextUrl ?? item.provenance?.source?.sourceUrl ?? '',
    sourceProvider: item.provenance?.source?.provider ?? 'API',
    dedupeKey: item.dedupeKey,
    isBinding: false,
    verificationStatus: item.provenance?.verified
      ? item.provenance?.verificationMethod === 'OFFICIAL_SOURCE_HASH' ? 'VERIFIED_OFFICIAL' : 'VERIFIED_PROVIDER'
      : 'UNVERIFIED',
  };
}

export class OperationsClient {
  public constructor(private readonly requester: ApiRequester = requestApiResponse) {}

  public static loading<T>(data: T): OperationalResource<T> { return { state: 'loading', data }; }

  public async searchCaseLaw(intent: SearchIntent): Promise<SearchExecution> {
    const response = await this.requester<{ results: unknown[]; total: number }>('/api/v2/research/search-case-law', {
      method: 'POST',
      headers: { 'Idempotency-Key': intent.idempotencyKey },
      body: JSON.stringify({ query: intent.query, court: intent.court, limit: intent.limit }),
    });
    const results = response.data.results.map(mapSearchResult);
    return {
      intent,
      results,
      resultCount: response.data.total,
      billingMode: response.headers.get('x-forgelex-billing-mode') === 'FREE' ? 'FREE' : 'METERED',
      chargedCents: cents(response.headers.get('x-credits-charged')),
      remainingBalanceCents: cents(response.headers.get('x-remaining-balance')),
      isReplay: response.headers.get('x-idempotent-replay') === 'true',
    };
  }

  public retrySearch(intent: SearchIntent): Promise<SearchExecution> { return this.searchCaseLaw(intent); }

  public loadTribunals(): Promise<OperationalResource<TribunalCapability[]>> {
    return this.load('/api/v2/tribunals', (data: any) => data.tribunals ?? []);
  }

  public loadHistory(): Promise<OperationalResource<ResearchHistoryItem[]>> {
    return this.load('/api/v2/research/history', (data: any) => data.items ?? []);
  }

  public loadReviewQueue(): Promise<OperationalResource<ReviewQueueItem[]>> {
    return this.load('/api/v2/review-queue', (data: any) => data.items ?? []);
  }

  public async resolveReview(item: ReviewQueueItem, decision: 'APPROVED' | 'REJECTED', reason?: string): Promise<void> {
    if (item.kind === 'DRAFT') throw new ApiRequestError('O token de aprovação deve ser fornecido pelo fluxo seguro.', 'APPROVAL_TOKEN_REQUIRED', 409);
    await this.requester(item.actionUrl, { method: 'POST', body: JSON.stringify({ decision, reason }) });
  }

  private async load<T>(path: string, select: (data: unknown) => T[]): Promise<OperationalResource<T[]>> {
    try {
      const response = await this.requester<unknown>(path);
      const data = select(response.data);
      return { state: data.length === 0 ? 'empty' : 'ready', data };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha operacional.';
      const unavailable = error instanceof ApiRequestError && (error.status === 503 || ['API_UNAVAILABLE', 'SOURCE_PROVIDER_UNAVAILABLE', 'PERSISTENCE_UNAVAILABLE'].includes(error.code));
      return { state: unavailable ? 'unavailable' : 'error', data: [], error: message };
    }
  }
}
