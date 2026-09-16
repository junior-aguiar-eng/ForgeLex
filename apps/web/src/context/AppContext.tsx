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
  
  // Balances
  paidBalanceCents: number;
  promotionalBalanceCents: number;
  totalBalanceCents: number;
  transactions: LedgerTransaction[];
  recharge: (paidCents: number, promoCents: number, paymentMethod: 'PIX' | 'CREDIT_CARD') => void;
  deductCredit: (amountCents: number, description: string) => { success: boolean; error?: string };
  
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
  
  // Stats
  stats: {
    totalSearches: number;
    totalMemos: number;
    totalDrafts: number;
  };
}

const AppContext = createContext<AppContextType | null>(null);

const CANONICAL_JURISPRUDENCIA: SearchResultItem[] = [
  {
    id: 'jur_1',
    court: 'STJ',
    processNumber: 'REsp 1.823.450/SP',
    relator: 'Min. Marco Aurélio Bellizze',
    judgmentDate: '18/04/2023',
    publicationDate: '24/04/2023',
    ementa: 'CIVIL E PROCESSUAL CIVIL. RECURSO ESPECIAL. AÇÃO REVISIONAL DE CONTRATO BANCÁRIO. CÉDULA DE CRÉDITO BANCÁRIO. CAPITALIZAÇÃO DE JUROS COM PERIODICIDADE INFERIOR À ANUAL. PACTUAÇÃO EXPRESSA. SÚMULA 539/STJ. TAXA DE JUROS REMUNERATÓRIOS. LIMITAÇÃO À TAXA MÉDIA DE MERCADO DIVULGADA PELO BACEN. AUSÊNCIA DE ABUSIVIDADE MANIFESTA. RECURSO PROVIDO.',
    sourceUrl: 'https://processo.stj.jus.br/processo/julgados/resp1823450',
    sourceProvider: 'STJ_OFICIAL',
    dedupeKey: 'stj_resp1823450sp_20230418',
    isBinding: true,
    verificationStatus: 'VERIFIED_OFFICIAL',
  },
  {
    id: 'jur_2',
    court: 'STF',
    processNumber: 'ADI 6.387/DF',
    relator: 'Min. Rosa Weber',
    judgmentDate: '07/05/2020',
    publicationDate: '12/11/2020',
    ementa: 'DIREITO CONSTITUCIONAL E REGULATÓRIO. MEDIDA PROVISÓRIA Nº 954/2020. COMPARTILHAMENTO DE DADOS DE USUÁRIOS POR EMPRESAS DE TELEFONIA COM O IBGE. DIREITO FUNDAMENTAL À PROTEÇÃO DE DADOS PESSOAIS E AUTODETERMINAÇÃO INFORMATIVA. AUSÊNCIA DE FINALIDADE LEGÍTIMA E SALVAGUARDAS. INCONSTITUCIONALIDADE. EFICÁCIA ERGA OMNES.',
    sourceUrl: 'https://portal.stf.jus.br/processos/detalhe.asp?incidente=5898124',
    sourceProvider: 'STF_OFICIAL',
    dedupeKey: 'stf_adi6387df_20200507',
    isBinding: true,
    verificationStatus: 'VERIFIED_OFFICIAL',
  },
  {
    id: 'jur_3',
    court: 'TJSP',
    processNumber: 'Apelação Cível 1002345-88.2023.8.26.0100',
    relator: 'Des. Francisco Loureiro',
    judgmentDate: '12/11/2024',
    publicationDate: '19/11/2024',
    ementa: 'RESPONSABILIDADE CIVIL. COMPROMISSO DE COMPRA E VENDA DE IMÓVEL. ATRASO SUBSTANCIAL NA ENTREGA DA OBRA ALÉM DO PRAZO DE TOLERÂNCIA DE 180 DIAS. LUCROS CESSANTES PRESUMIDOS. TEMA 996 DO STJ. RESTITUIÇÃO INTEGRAL DAS PARCELAS PAGAS COM JUROS MORATÓRIOS. DANO MORAL CONFIGURADO DIANTE DA FRUSTRAÇÃO DECORRENTE DE MORA EXCESSIVA. SENTENÇA MANTIDA.',
    sourceUrl: 'https://esaj.tjsp.jus.br/cposg/show.do?processo.codigo=1002345-88.2023',
    sourceProvider: 'TJSP_OFICIAL',
    dedupeKey: 'tjsp_ac10023458820238260100_20241112',
    isBinding: false,
    verificationStatus: 'VERIFIED_OFFICIAL',
  },
  {
    id: 'jur_4',
    court: 'TST',
    processNumber: 'RR 1000892-45.2022.5.02.0034',
    relator: 'Min. Mauricio Godinho Delgado',
    judgmentDate: '03/10/2024',
    publicationDate: '11/10/2024',
    ementa: 'RECURSO DE REVISTA. PEJOTIZAÇÃO FRAUDULENTA. ARTIGOS 2º, 3º E 9º DA CLT. PRESENÇA DE SUBORDINAÇÃO JURÍDICA DIRETA, HABITUALIDADE, ONEROSIDADE E PESSOALIDADE. NULIDADE DO CONTRATO DE PRESTAÇÃO DE SERVIÇOS PJ. RECONHECIMENTO DO VÍNCULO EMPREGATÍCIO COM VERBAS RESCISÓRIAS DEVIDAS. PROVIMENTO.',
    sourceUrl: 'https://jurisprudencia.tst.jus.br/rr1000892',
    sourceProvider: 'TST_OFICIAL',
    dedupeKey: 'tst_rr10008924520225020034_20241003',
    isBinding: false,
    verificationStatus: 'VERIFIED_OFFICIAL',
  }
];

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<'landing' | 'research' | 'matter' | 'draft_studio' | 'dashboard' | 'connections' | 'credits' | 'api_docs'>('landing');

  // Ledger Balances (in cents)
  const [paidBalanceCents, setPaidBalanceCents] = useState(14250); // R$ 142,50
  const [promotionalBalanceCents, setPromotionalBalanceCents] = useState(2500); // R$ 25,00

  const [transactions, setTransactions] = useState<LedgerTransaction[]>([
    {
      id: 'tx_1',
      idempotencyKey: 'idem_rec_initial_01',
      date: '14/09/2026 14:32',
      description: 'Recarga Inicial — Pacote Estratégico (PIX)',
      type: 'CREDIT',
      amountCents: 10000,
      wallet: 'PAID',
      status: 'SETTLED',
    },
    {
      id: 'tx_2',
      idempotencyKey: 'idem_rec_bonus_01',
      date: '14/09/2026 14:32',
      description: 'Bônus de Adesão Promocional Boas-Vindas',
      type: 'CREDIT',
      amountCents: 2500,
      wallet: 'PROMOTIONAL',
      status: 'SETTLED',
    },
    {
      id: 'tx_3',
      idempotencyKey: 'idem_search_stj_99',
      date: '15/09/2026 09:15',
      description: 'Pesquisa jurídica — Tema 996 STJ',
      type: 'DEBIT',
      amountCents: 15,
      wallet: 'PROMOTIONAL',
      status: 'SETTLED',
    },
  ]);

  // Model Connections
  const [connections, setConnections] = useState<Record<string, ModelConnection>>({
    anthropic: {
      provider: 'anthropic',
      name: 'Anthropic Claude',
      model: 'claude-3-5-sonnet-20241022',
      status: 'connected',
      apiKey: 'sk-ant-api03-••••••••••••••••••••••••••••••••',
      latencyMs: 340,
      lastTested: 'Hoje às 09:30',
    },
    openai: {
      provider: 'openai',
      name: 'OpenAI ChatGPT',
      model: 'gpt-4o',
      status: 'connected',
      apiKey: 'sk-proj-••••••••••••••••••••••••••••••••',
      latencyMs: 290,
      lastTested: 'Hoje às 09:28',
    },
    local: {
      provider: 'local',
      name: 'ForgeLex Sovereign Kernel',
      model: 'mistral-large-sovereign-q4',
      status: 'configured',
      apiKey: 'local_loopback_bearer_token',
      latencyMs: 45,
      lastTested: 'Hoje às 08:00',
    },
  });

  // Human in the loop approvals
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([
    {
      id: 'appr_1',
      token: 'tok_appr_89f3a21b47c0e',
      toolName: 'drafting.save_final_draft',
      title: 'Petição Inicial de Danos Morais e Materiais',
      description: 'Ação Cível com pedido de tutela antecipada contra instituição bancária por cobrança indevida de encargos CCB.',
      court: 'TJSP - 1ª Vara Cível Central',
      draftContent: 'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL DA COMARCA DA CAPITAL - SP\n\nAUTOR, brasileiro, casado, portador do RG nº ..., devidamente representado por seus procuradores, vem perante V. Exa. propor a presente AÇÃO DECLARATÓRIA DE NULIDADE DE CLÁUSULAS CONTRATUAIS C/C REPETIÇÃO DO INDÉBITO E REPARAÇÃO POR DANOS MORAIS com amparo no Código de Defesa do Consumidor e precedentes vinculantes do STJ (Súmula 539)...',
      requestedAt: '16/09/2026 03:10',
      status: 'PENDING',
    },
    {
      id: 'appr_2',
      token: 'tok_appr_9a12bc443f11d',
      toolName: 'drafting.save_final_draft',
      title: 'Recurso Especial — Violação ao Art. 1.022 CPC',
      description: 'Minuta recursal ao STJ apontando omissão relevante não sanada em embargos declaratórios pelo TJSP.',
      court: 'STJ - Superior Tribunal de Justiça',
      draftContent: 'EXCELENTÍSSIMO SENHOR MINISTRO PRESIDENTE DO SUPERIOR TRIBUNAL DE JUSTIÇA\n\nRECORRENTE, devidamente qualificado nos autos do Agravo em Recurso Especial nº ..., vem, tempestivamente, expor e requerer...',
      requestedAt: '16/09/2026 02:45',
      status: 'PENDING',
    }
  ]);

  const [stats, setStats] = useState({
    totalSearches: 142,
    totalMemos: 38,
    totalDrafts: 64,
  });

  const [recentSearches, setRecentSearches] = useState([
    { query: 'Capitalização mensal de juros cédula de crédito bancário', court: 'STJ', timestamp: 'Hoje às 03:15', count: 1 },
    { query: 'Proteção de dados pessoais autodeterminação informativa', court: 'STF', timestamp: 'Hoje às 02:50', count: 1 },
    { query: 'Atraso de entrega de imóvel compromisso compra e venda', court: 'TJSP', timestamp: 'Ontem às 18:20', count: 1 },
  ]);

  // Total balance
  const totalBalanceCents = paidBalanceCents + promotionalBalanceCents;

  const recharge = (paidCents: number, promoCents: number, paymentMethod: 'PIX' | 'CREDIT_CARD') => {
    setPaidBalanceCents((prev) => prev + paidCents);
    setPromotionalBalanceCents((prev) => prev + promoCents);

    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newTx: LedgerTransaction = {
      id: `tx_${Date.now()}`,
      idempotencyKey: `idem_rec_${Date.now()}`,
      date: formattedDate,
      description: `Recarga de Créditos (${paymentMethod === 'PIX' ? 'PIX Instantâneo' : 'Cartão de Crédito'})`,
      type: 'CREDIT',
      amountCents: paidCents + promoCents,
      wallet: promoCents > 0 ? 'SPLIT' : 'PAID',
      status: 'SETTLED',
    };

    setTransactions((prev) => [newTx, ...prev]);
  };

  const deductCredit = (amountCents: number, description: string) => {
    if (totalBalanceCents < amountCents) {
      return { success: false, error: 'Saldo insuficiente. Recarregue seus créditos para continuar.' };
    }

    let remainingCost = amountCents;
    let promoDeducted = 0;
    let paidDeducted = 0;

    // Prioritize promotional balance first (Appendix Q)
    if (promotionalBalanceCents >= remainingCost) {
      setPromotionalBalanceCents((prev) => prev - remainingCost);
      promoDeducted = remainingCost;
      remainingCost = 0;
    } else {
      promoDeducted = promotionalBalanceCents;
      remainingCost -= promotionalBalanceCents;
      setPromotionalBalanceCents(0);

      setPaidBalanceCents((prev) => prev - remainingCost);
      paidDeducted = remainingCost;
    }

    const now = new Date();
    const formattedDate = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newTx: LedgerTransaction = {
      id: `tx_${Date.now()}`,
      idempotencyKey: `idem_deb_${Date.now()}`,
      date: formattedDate,
      description,
      type: 'DEBIT',
      amountCents,
      wallet: promoDeducted > 0 && paidDeducted > 0 ? 'SPLIT' : promoDeducted > 0 ? 'PROMOTIONAL' : 'PAID',
      status: 'SETTLED',
    };

    setTransactions((prev) => [newTx, ...prev]);
    return { success: true };
  };

  const updateApiKey = (provider: 'anthropic' | 'openai', key: string) => {
    setConnections((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        apiKey: key,
        status: key.length > 8 ? 'connected' : 'disconnected',
        lastTested: 'Chave atualizada agora',
      },
    }));
  };

  const testConnection = async (provider: 'anthropic' | 'openai') => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    const latency = Math.floor(Math.random() * 120) + 220; // 220-340ms
    setConnections((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        latencyMs: latency,
        status: 'connected',
        lastTested: 'Testado com sucesso agora',
      },
    }));
    return { success: true, latency };
  };

  const resolveApproval = (id: string, action: 'APPROVED' | 'REJECTED') => {
    setApprovals((prev) =>
      prev.map((appr) => (appr.id === id ? { ...appr, status: action } : appr))
    );
    if (action === 'APPROVED') {
      setStats((prev) => ({ ...prev, totalDrafts: prev.totalDrafts + 1 }));
    }
  };

  const performSearch = async (query: string, court?: string): Promise<SearchResultItem[]> => {
    // Deduct standard search fee (R$ 0,15 = 15 cents)
    const deduction = deductCredit(15, `Pesquisa Forense: "${query.substring(0, 32)}..."`);
    if (!deduction.success) {
      throw new Error(deduction.error);
    }

    setStats((prev) => ({ ...prev, totalSearches: prev.totalSearches + 1 }));

    // Filter results
    let results = CANONICAL_JURISPRUDENCIA;
    if (court && court !== 'TODOS') {
      results = results.filter((r) => r.court.toUpperCase() === court.toUpperCase());
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter((r) =>
        r.ementa.toLowerCase().includes(q) ||
        r.court.toLowerCase().includes(q) ||
        r.relator.toLowerCase().includes(q) ||
        r.processNumber.toLowerCase().includes(q)
      );
    }

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
    const deduction = deductCredit(15, `Verificação de autoridade: "${processNumber}"`);
    if (!deduction.success) {
      throw new Error(deduction.error);
    }

    const normalized = processNumber.replace(/[^a-z0-9]/gi, '').toUpperCase();
    const authority = CANONICAL_JURISPRUDENCIA.find(
      (item) =>
        item.court.toUpperCase() === court.toUpperCase() &&
        item.processNumber.replace(/[^a-z0-9]/gi, '').toUpperCase() === normalized
    );
    const checkedAt = new Date().toISOString();

    if (!authority) return { status: 'NOT_FOUND', checkedAt };
    if (judgmentDate && judgmentDate !== authority.judgmentDate) {
      return {
        status: 'CONFLICTING_METADATA',
        checkedAt,
        authority,
        reason: 'A data de julgamento informada diverge da fonte oficial.',
      };
    }
    return { status: authority.verificationStatus, checkedAt, authority };
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        paidBalanceCents,
        promotionalBalanceCents,
        totalBalanceCents,
        transactions,
        recharge,
        deductCredit,
        connections,
        updateApiKey,
        testConnection,
        approvals,
        resolveApproval,
        performSearch,
        verifyAuthority,
        recentSearches,
        stats,
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
