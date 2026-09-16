import React, { createContext, useContext, useState } from 'react';

export interface LedgerTransaction {
  id: string;
  idempotencyKey: string;
  date: string;
  description: string;
  type: 'DEBIT' | 'CREDIT';
  amountCents: number;
  wallet: 'PAID' | 'PROMOTIONAL' | 'SPLIT';
  status: 'SETTLED' | 'PENDING' | 'FAILED';
}

export interface ApprovalRequest {
  id: string;
  token: string;
  toolName: string;
  title: string;
  description: string;
  draftContent: string;
  court: string;
  requestedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ModelConnection {
  provider: 'anthropic' | 'openai' | 'local';
  name: string;
  model: string;
  status: 'connected' | 'configured' | 'disconnected';
  apiKey: string;
  latencyMs?: number;
  lastTested?: string;
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

export interface AuthorityVerification {
  status: SearchResultItem['verificationStatus'];
  checkedAt: string;
  authority?: SearchResultItem;
  reason?: string;
}

interface AppContextType {
  activeTab: 'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'api_docs';
  setActiveTab: (tab: 'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'api_docs') => void;
  
  // Model Connections
  connections: Record<string, ModelConnection>;
  updateApiKey: (provider: 'anthropic' | 'openai', key: string) => void;
  testConnection: (provider: 'anthropic' | 'openai') => Promise<{ success: boolean; latency: number }>;
  
  // Human-in-the-loop Approvals
  approvals: ApprovalRequest[];
  resolveApproval: (id: string, action: 'APPROVED' | 'REJECTED') => void;
  
  // Search & Activity
  performSearch: (query: string, court?: string) => Promise<SearchResultItem[]>;
  verifyAuthority: (court: string, processNumber: string, judgmentDate?: string) => Promise<AuthorityVerification>;
  recentSearches: { query: string; court: string; timestamp: string; count: number }[];
  
}

const AppContext = createContext<AppContextType | null>(null);

const apiUrl = import.meta.env.VITE_FORGELEX_API_URL ?? 'http://localhost:3001';

function getApiToken(): string {
  if (import.meta.env.VITE_FORGELEX_API_TOKEN) return import.meta.env.VITE_FORGELEX_API_TOKEN;
  try {
    return window.localStorage.getItem('forgelex_api_token') ?? '';
  } catch {
    return '';
  }
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getApiToken();
  if (!token) throw new Error('Nenhuma credencial da API foi configurada. Abra “Detalhes técnicos” em Casos ou Rascunhos para conectar a conta.');
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `A API respondeu HTTP ${response.status}.`);
  return body as T;
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
    verificationStatus: item.provenance?.verified ? 'VERIFIED_PROVIDER' : 'UNVERIFIED',
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'api_docs'>('landing');

  // Model Connections
  const [connections, setConnections] = useState<Record<string, ModelConnection>>({
    anthropic: {
      provider: 'anthropic',
      name: 'Anthropic Claude',
      model: 'claude-3-5-sonnet-20241022',
      status: 'disconnected',
      apiKey: '',
    },
    openai: {
      provider: 'openai',
      name: 'OpenAI ChatGPT',
      model: 'gpt-4o',
      status: 'disconnected',
      apiKey: '',
    },
    local: {
      provider: 'local',
      name: 'ForgeLex Sovereign Kernel',
      model: 'mistral-large-sovereign-q4',
      status: 'disconnected',
      apiKey: '',
    },
  });

  // Human in the loop approvals
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

  const [recentSearches, setRecentSearches] = useState<{ query: string; court: string; timestamp: string; count: number }[]>([
  ]);

  const updateApiKey = (provider: 'anthropic' | 'openai', key: string) => {
    setConnections((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        apiKey: key,
        status: key.trim() ? 'configured' : 'disconnected',
        lastTested: undefined,
      },
    }));
  };

  const testConnection = async (provider: 'anthropic' | 'openai') => {
    void provider;
    return { success: false, latency: 0 };
  };

  const resolveApproval = (id: string, action: 'APPROVED' | 'REJECTED') => {
    setApprovals((prev) =>
      prev.map((appr) => (appr.id === id ? { ...appr, status: action } : appr))
    );
  };

  const performSearch = async (query: string, court?: string): Promise<SearchResultItem[]> => {
    const params = new URLSearchParams({ q: query.trim(), limit: '20' });
    if (court && court !== 'TODOS') params.set('court', court);
    const response = await requestApi<{ results: unknown[] }>(`/api/v2/jurisprudencias?${params.toString()}`, {
      headers: { 'Idempotency-Key': `web_search_${Date.now()}_${Math.random().toString(36).slice(2)}` },
    });
    const results = response.results.map(mapSearchResult);

    // Add to recent searches
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setRecentSearches((prev) => [
      { query, court: court || 'TODOS', timestamp: `Hoje às ${timeStr}`, count: results.length },
      ...prev.slice(0, 4),
    ]);

    return results;
  };

  const verifyAuthority = async (
    court: string,
    processNumber: string,
    judgmentDate?: string
  ): Promise<AuthorityVerification> => {
    return requestApi<AuthorityVerification>('/api/v2/research/verify-authority', {
      method: 'POST',
      headers: { 'Idempotency-Key': `web_verify_${Date.now()}_${Math.random().toString(36).slice(2)}` },
      body: JSON.stringify({ court, processNumber, judgmentDate }),
    }).then((response) => ({
      ...response,
      authority: response.authority ? mapSearchResult(response.authority) : undefined,
    }));
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        connections,
        updateApiKey,
        testConnection,
        approvals,
        resolveApproval,
        performSearch,
        verifyAuthority,
        recentSearches,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
