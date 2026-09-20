import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { requestApi } from '../api-client';
import { OperationsClient } from '../operations/operations-client';
import type { OperationalResource, ResearchHistoryItem, ReviewQueueItem, SearchExecution, SearchIntent, SearchResultItem, TribunalCapability } from '../operations/contracts';

export type { ResearchHistoryItem, ReviewQueueItem, SearchExecution, SearchIntent, SearchResultItem, TribunalCapability } from '../operations/contracts';

export interface AuthorityVerification {
  status: SearchResultItem['verificationStatus'];
  checkedAt: string;
  authority?: SearchResultItem;
  reason?: string;
}

type ActiveTab = 'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'api_docs';

interface AppContextType {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  tribunals: OperationalResource<TribunalCapability[]>;
  recentSearches: OperationalResource<ResearchHistoryItem[]>;
  reviewQueue: OperationalResource<ReviewQueueItem[]>;
  refreshOperationalState: () => Promise<void>;
  performSearch: (intent: SearchIntent) => Promise<SearchExecution>;
  retrySearch: (intent: SearchIntent) => Promise<SearchExecution>;
  resolveReview: (item: ReviewQueueItem, decision: 'APPROVED' | 'REJECTED', reason?: string) => Promise<void>;
  verifyAuthority: (court: string, processNumber: string, judgmentDate?: string) => Promise<AuthorityVerification>;
}

const AppContext = createContext<AppContextType | null>(null);

function mapAuthority(item: any): SearchResultItem {
  return {
    id: item.id, court: item.court, processNumber: item.processNumber, relator: item.rapporteur,
    judgmentDate: item.judgmentDate, publicationDate: item.publicationDate, chamber: item.chamber,
    ementa: item.syllabus, sourceUrl: item.fullTextUrl ?? item.provenance?.source?.sourceUrl ?? '',
    sourceProvider: item.provenance?.source?.provider ?? 'API', dedupeKey: item.dedupeKey,
    isBinding: false,
    verificationStatus: item.provenance?.verified
      ? item.provenance?.verificationMethod === 'OFFICIAL_SOURCE_HASH' ? 'VERIFIED_OFFICIAL' : 'VERIFIED_PROVIDER'
      : 'UNVERIFIED',
  };
}

export function createOperationalActions(
  client: OperationsClient,
  applyQueue: (resource: OperationalResource<ReviewQueueItem[]>) => void,
) {
  return {
    async resolveReview(item: ReviewQueueItem, decision: 'APPROVED' | 'REJECTED', reason?: string): Promise<void> {
      try {
        await client.resolveReview(item, decision, reason);
        applyQueue(await client.loadReviewQueue());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha ao resolver revisão.';
        applyQueue({ state: 'error', data: [item], error: message });
        throw error;
      }
    },
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('landing');
  const client = useMemo(() => new OperationsClient(), []);
  const [tribunals, setTribunals] = useState<OperationalResource<TribunalCapability[]>>(OperationsClient.loading([]));
  const [recentSearches, setRecentSearches] = useState<OperationalResource<ResearchHistoryItem[]>>(OperationsClient.loading([]));
  const [reviewQueue, setReviewQueue] = useState<OperationalResource<ReviewQueueItem[]>>(OperationsClient.loading([]));

  const refreshOperationalState = async (): Promise<void> => {
    const [nextTribunals, nextHistory, nextQueue] = await Promise.all([
      client.loadTribunals(), client.loadHistory(), client.loadReviewQueue(),
    ]);
    setTribunals(nextTribunals);
    setRecentSearches(nextHistory);
    setReviewQueue(nextQueue);
  };

  useEffect(() => { void refreshOperationalState(); }, []);

  const performSearch = async (intent: SearchIntent): Promise<SearchExecution> => {
    const execution = await client.searchCaseLaw(intent);
    setRecentSearches(await client.loadHistory());
    return execution;
  };

  const verifyAuthority = async (court: string, processNumber: string, judgmentDate?: string): Promise<AuthorityVerification> => {
    return requestApi<AuthorityVerification>('/api/v2/research/verify-authority', {
      method: 'POST',
      headers: { 'Idempotency-Key': `web_verify_${crypto.randomUUID()}` },
      body: JSON.stringify({ court, processNumber, judgmentDate }),
    }).then((response) => ({ ...response, authority: response.authority ? mapAuthority(response.authority) : undefined }));
  };

  const actions = createOperationalActions(client, setReviewQueue);
  return <AppContext.Provider value={{
    activeTab, setActiveTab, tribunals, recentSearches, reviewQueue,
    refreshOperationalState, performSearch, retrySearch: (intent) => client.retrySearch(intent),
    resolveReview: actions.resolveReview, verifyAuthority,
  }}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
