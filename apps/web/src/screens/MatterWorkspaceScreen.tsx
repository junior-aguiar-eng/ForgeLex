import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, FolderOpen, LockKeyhole, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { requestApiWithToken } from '../api-client';
import { useAuth } from '../auth/AuthContext';
import { useApp } from '../context/AppContext';

interface Matter {
  id: string;
  title: string;
  description?: string;
  practiceArea?: string;
  jurisdiction?: string;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  updatedAt: string;
}

interface LegalDocument {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  status: 'INDEXED' | 'FAILED';
  createdAt: string;
}

interface MatterDetailResponse {
  matter: Matter;
  documents: LegalDocument[];
}

interface Fact {
  id: string;
  statement: string;
  category: 'FACTUAL' | 'PROCEDURAL' | 'TEMPORAL' | 'DAMAGE' | 'OTHER';
  status: 'ASSERTED' | 'CONFIRMED' | 'DISPUTED' | 'REJECTED';
  createdAt: string;
}

interface EvidenceItem {
  id: string;
  title: string;
  description?: string;
  evidenceType: 'DOCUMENT' | 'TESTIMONY' | 'RECORD' | 'EXPERT_REPORT' | 'OTHER';
  status: 'AVAILABLE' | 'MISSING' | 'CONTESTED';
  createdAt: string;
}

interface EvidenceCoverage {
  factId: string;
  coverage: 'SUPPORTED' | 'PARTIAL' | 'UNSUPPORTED' | 'CONFLICTING';
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  supportingAnchorCount: number;
  contradictingAnchorCount: number;
}

interface TimelineEvent {
  id: string;
  title: string;
  eventDate: string;
  description?: string;
  sourceAnchorId?: string;
}

interface DocumentAnchor {
  id: string;
  anchorKey: string;
  text: string;
}

interface LegalIssue {
  id: string;
  statement: string;
  status: 'OPEN' | 'ADDRESSED' | 'DISMISSED';
  createdAt: string;
}

interface ResearchMemo {
  id: string;
  matterId: string;
  query: string;
  issueIds: string[];
  memo: {
    title: string;
    executiveSummary: string;
    keyTheses: string[];
    applicableAuthorities: Array<{ id: string; citation: string; title: string; summary: string; provenance: { verified: boolean; source: { provider: string; sourceUrl?: string } } }>;
    riskAnalysis: string;
    recommendedAction: string;
    generatedAt: string;
    verifiedByHuman: boolean;
  };
  status: 'PENDING_HUMAN_REVIEW' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

const categoryLabels: Record<Fact['category'], string> = {
  FACTUAL: 'Fato',
  PROCEDURAL: 'Processual',
  TEMPORAL: 'Temporal',
  DAMAGE: 'Dano',
  OTHER: 'Outro',
};

const factStatusLabels: Record<Fact['status'], string> = {
  ASSERTED: 'Candidato',
  CONFIRMED: 'Confirmado',
  DISPUTED: 'Contestado',
  REJECTED: 'Rejeitado',
};

const evidenceTypeLabels: Record<EvidenceItem['evidenceType'], string> = {
  DOCUMENT: 'Documento',
  TESTIMONY: 'Depoimento',
  RECORD: 'Registro',
  EXPERT_REPORT: 'Laudo',
  OTHER: 'Outro',
};

const evidenceStatusLabels: Record<EvidenceItem['status'], string> = {
  AVAILABLE: 'Disponível',
  MISSING: 'Ausente',
  CONTESTED: 'Contestado',
};

const coverageLabels: Record<EvidenceCoverage['coverage'], string> = {
  SUPPORTED: 'Com suporte',
  PARTIAL: 'Suporte parcial',
  UNSUPPORTED: 'Sem suporte',
  CONFLICTING: 'Em conflito',
};

const issueStatusLabels: Record<LegalIssue['status'], string> = {
  OPEN: 'Em aberto',
  ADDRESSED: 'Endereçada',
  DISMISSED: 'Descartada',
};

const memoStatusLabels: Record<ResearchMemo['status'], string> = {
  PENDING_HUMAN_REVIEW: 'Aguardando revisão humana',
  APPROVED: 'Aprovado por revisão humana',
  REJECTED: 'Rejeitado na revisão humana',
};

const apiUrl = import.meta.env.VITE_FORGELEX_API_URL ?? 'http://localhost:3001';

function initialToken(): string {
  if (import.meta.env.VITE_FORGELEX_API_TOKEN) return import.meta.env.VITE_FORGELEX_API_TOKEN;
  try {
    return window.localStorage.getItem('forgelex_api_token') ?? '';
  } catch {
    return '';
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  return requestApiWithToken<T>(path, token, init);
}

export const MatterWorkspaceScreen: React.FC = () => {
  const { setActiveTab } = useApp();
  const { status: authStatus } = useAuth();
  const [token, setToken] = useState(initialToken);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [coverage, setCoverage] = useState<EvidenceCoverage[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [anchors, setAnchors] = useState<DocumentAnchor[]>([]);
  const [issues, setIssues] = useState<LegalIssue[]>([]);
  const [memos, setMemos] = useState<ResearchMemo[]>([]);
  const [title, setTitle] = useState('');
  const [practiceArea, setPracticeArea] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [factStatement, setFactStatement] = useState('');
  const [factCategory, setFactCategory] = useState<Fact['category']>('FACTUAL');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceItem['evidenceType']>('DOCUMENT');
  const [timelineTitle, setTimelineTitle] = useState('');
  const [timelineDate, setTimelineDate] = useState('');
  const [timelineDescription, setTimelineDescription] = useState('');
  const [issueStatement, setIssueStatement] = useState('');
  const [memoQuery, setMemoQuery] = useState('');
  const [supportFactId, setSupportFactId] = useState('');
  const [supportEvidenceId, setSupportEvidenceId] = useState('');
  const [supportAnchorId, setSupportAnchorId] = useState('');
  const [supportRelation, setSupportRelation] = useState<'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT'>('SUPPORTS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasApiAccess = Boolean(token.trim()) || authStatus === 'authenticated' || authStatus === 'legacy';

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId) ?? null,
    [matters, selectedMatterId]
  );

  const clearMatterResources = () => {
    setDocuments([]);
    setFacts([]);
    setEvidence([]);
    setCoverage([]);
    setTimeline([]);
    setAnchors([]);
    setIssues([]);
    setMemos([]);
  };

  const loadMatterResources = async (matterId: string) => {
    const [detail, factsResponse, evidenceResponse, coverageResponse, timelineResponse, issuesResponse, memosResponse] = await Promise.all([
      request<MatterDetailResponse>(`/api/v2/matters/${matterId}`, token),
      request<{ items: Fact[] }>(`/api/v2/matters/${matterId}/facts`, token),
      request<{ items: EvidenceItem[] }>(`/api/v2/matters/${matterId}/evidence`, token),
      request<{ items: EvidenceCoverage[] }>(`/api/v2/matters/${matterId}/evidence/coverage`, token),
      request<{ items: TimelineEvent[] }>(`/api/v2/matters/${matterId}/timeline`, token),
      request<{ items: LegalIssue[] }>(`/api/v2/matters/${matterId}/issues`, token),
      request<{ items: ResearchMemo[] }>(`/api/v2/matters/${matterId}/research-memos`, token),
    ]);
    const documentDetails = await Promise.all(detail.documents.map((document) =>
      request<{ anchors: DocumentAnchor[] }>(`/api/v2/matters/${matterId}/documents/${document.id}`, token),
    ));
    setDocuments(detail.documents);
    setFacts(factsResponse.items);
    setEvidence(evidenceResponse.items);
    setCoverage(coverageResponse.items);
    setTimeline(timelineResponse.items);
    setAnchors(documentDetails.flatMap((item) => item.anchors));
    setIssues(issuesResponse.items);
    setMemos(memosResponse.items);
  };

  const loadMatters = async () => {
    if (!hasApiAccess) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ items: Matter[] }>('/api/v2/matters', token);
      setMatters(response.items);
      const nextMatterId = selectedMatterId && response.items.some((matter) => matter.id === selectedMatterId)
        ? selectedMatterId
        : response.items[0]?.id ?? null;
      setSelectedMatterId(nextMatterId);
      if (nextMatterId) {
        await loadMatterResources(nextMatterId);
      } else {
        clearMatterResources();
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os casos.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadMatters();
    // Uma troca de sessão ou credencial deve iniciar uma nova leitura da área de casos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, authStatus]);

  const selectMatter = async (matterId: string) => {
    setSelectedMatterId(matterId);
    if (!hasApiAccess) return;
    setBusy(true);
    setError(null);
    try {
      await loadMatterResources(matterId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os documentos.');
    } finally {
      setBusy(false);
    }
  };

  const saveToken = (value: string) => {
    setToken(value);
    try {
      window.localStorage.setItem('forgelex_api_token', value);
    } catch {
      // O modo sem armazenamento continua funcionando durante a sessão.
    }
  };

  const createMatter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !title.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const matter = await request<Matter>('/api/v2/matters', token, {
        method: 'POST',
        body: JSON.stringify({ title, practiceArea: practiceArea || undefined }),
      });
      setTitle('');
      setPracticeArea('');
      setMatters((current) => [matter, ...current]);
      setSelectedMatterId(matter.id);
      clearMatterResources();
      setNotice('Caso criado e pronto para receber documentos.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar o caso.');
    } finally {
      setBusy(false);
    }
  };

  const createFact = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !selectedMatterId || factStatement.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const fact = await request<Fact>(`/api/v2/matters/${selectedMatterId}/facts`, token, {
        method: 'POST',
        body: JSON.stringify({ statement: factStatement, category: factCategory }),
      });
      setFacts((current) => [fact, ...current]);
      setCoverage((current) => [{
        factId: fact.id,
        coverage: 'UNSUPPORTED',
        supportingEvidenceCount: 0,
        contradictingEvidenceCount: 0,
        supportingAnchorCount: 0,
        contradictingAnchorCount: 0,
      }, ...current]);
      setFactStatement('');
      setNotice('Fato candidato registrado. Vincule uma âncora ou prova para calcular sua cobertura.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível registrar o fato.');
    } finally {
      setBusy(false);
    }
  };

  const createEvidence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !selectedMatterId || evidenceTitle.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const item = await request<EvidenceItem>(`/api/v2/matters/${selectedMatterId}/evidence`, token, {
        method: 'POST',
        body: JSON.stringify({ title: evidenceTitle, evidenceType }),
      });
      setEvidence((current) => [item, ...current]);
      setEvidenceTitle('');
      setNotice('Item de prova registrado. O vínculo com fatos e origens pode ser concluído na revisão do caso.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível registrar a prova.');
    } finally {
      setBusy(false);
    }
  };

  const createTimelineEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !selectedMatterId || timelineTitle.trim().length < 3 || !timelineDate) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const item = await request<TimelineEvent>(`/api/v2/matters/${selectedMatterId}/timeline`, token, {
        method: 'POST',
        body: JSON.stringify({ title: timelineTitle, eventDate: timelineDate, description: timelineDescription || undefined }),
      });
      setTimeline((current) => [...current, item].sort((left, right) => left.eventDate.localeCompare(right.eventDate)));
      setTimelineTitle('');
      setTimelineDate('');
      setTimelineDescription('');
      setNotice('Evento adicionado à linha do tempo.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível registrar o evento.');
    } finally {
      setBusy(false);
    }
  };

  const createIssue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !selectedMatterId || issueStatement.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const issue = await request<LegalIssue>(`/api/v2/matters/${selectedMatterId}/issues`, token, {
        method: 'POST',
        body: JSON.stringify({ statement: issueStatement }),
      });
      setIssues((current) => [issue, ...current]);
      setIssueStatement('');
      setNotice('Questão jurídica registrada e disponível para o research memo.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível registrar a questão jurídica.');
    } finally {
      setBusy(false);
    }
  };

  const mapSupport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !selectedMatterId || !supportFactId || (!supportEvidenceId && !supportAnchorId)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await request(`/api/v2/matters/${selectedMatterId}/facts/${supportFactId}/support`, token, {
        method: 'POST',
        body: JSON.stringify({
          evidenceItemId: supportEvidenceId || undefined,
          anchorId: supportAnchorId || undefined,
          relation: supportRelation,
        }),
      });
      await loadMatterResources(selectedMatterId);
      setSupportFactId('');
      setSupportEvidenceId('');
      setSupportAnchorId('');
      setNotice('Vínculo de suporte registrado; a cobertura do fato foi recalculada.');
    } catch (supportError) {
      setError(supportError instanceof Error ? supportError.message : 'Não foi possível mapear o suporte.');
    } finally {
      setBusy(false);
    }
  };

  const generateMemo = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !selectedMatterId || memoQuery.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request<{ record: ResearchMemo }>(`/api/v2/matters/${selectedMatterId}/research-memos`, token, {
        method: 'POST',
        headers: { 'Idempotency-Key': `web_research_memo_${selectedMatterId}_${memoQuery.trim()}` },
        body: JSON.stringify({ query: memoQuery.trim(), issueIds: issues.map((issue) => issue.id) }),
      });
      setMemos((current) => [response.record, ...current.filter((item) => item.id !== response.record.id)]);
      setNotice('Research memo gerado e encaminhado para revisão humana.');
    } catch (memoError) {
      setError(memoError instanceof Error ? memoError.message : 'Não foi possível gerar o research memo.');
    } finally {
      setBusy(false);
    }
  };

  const reviewMemo = async (memoId: string, decision: 'APPROVED' | 'REJECTED') => {
    if (!hasApiAccess || !selectedMatterId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request<{ record: ResearchMemo }>(`/api/v2/matters/${selectedMatterId}/research-memos/${memoId}/review`, token, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setMemos((current) => current.map((item) => item.id === response.record.id ? response.record : item));
      setNotice(decision === 'APPROVED' ? 'Research memo aprovado por revisão humana.' : 'Research memo rejeitado por revisão humana.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Não foi possível registrar a revisão humana.');
    } finally {
      setBusy(false);
    }
  };

  const ingestDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasApiAccess || !selectedMatterId || !documentTitle.trim() || !filename.trim() || !content.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await request<{ document: LegalDocument; anchors: Array<{ anchorKey: string }> }>(
        `/api/v2/matters/${selectedMatterId}/documents`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({
            title: documentTitle,
            originalFilename: filename,
            mimeType: 'text/plain',
            content,
          }),
        }
      );
      setDocuments((current) => [response.document, ...current]);
      setDocumentTitle('');
      setFilename('');
      setContent('');
      setNotice(`Documento ancorado em ${response.anchors.length} parágrafo(s).`);
    } catch (ingestError) {
      setError(ingestError instanceof Error ? ingestError.message : 'Não foi possível ingerir o documento.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-8 md:py-12">
      <div className="page-container space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cognac-100 border border-cognac-200 text-cognac-800 text-xs font-bold uppercase tracking-wider">
              <FolderOpen className="w-3.5 h-3.5" />
              Caso
            </div>
            <h1 className="font-editorial text-4xl font-bold text-stone-950">Área do caso</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-stone-600">
              Reúna documentos, fatos, provas e questões jurídicas para pesquisar e revisar o caso em um único contexto de trabalho.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-stone-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Isolamento por organização
          </div>
        </div>

        <details className="technical-access">
              <summary>Detalhes técnicos</summary>
          <div className="technical-access__content space-y-3 pt-3">
            <div className="flex items-center gap-2 text-stone-900">
              <LockKeyhole className="h-4 w-4 text-cognac-700" aria-hidden="true" />
              <h2 className="text-sm font-bold">Conexão com a área de casos</h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="matter-api-token">Credencial da API</label>
              <input
                id="matter-api-token"
                value={token}
                onChange={(event) => saveToken(event.target.value)}
                type="password"
                placeholder="Credencial da API"
                className="input-control flex-1"
              />
              <button type="button" onClick={() => void loadMatters()} disabled={!hasApiAccess || busy} className="btn-secondary disabled:opacity-50">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />Atualizar casos
              </button>
            </div>
            <p className="text-[11px] text-stone-500">A conexão usa {apiUrl}. A credencial permanece no navegador e não é enviada para outro destino.</p>
          </div>
        </details>

        {notice && <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-sm"><CheckCircle2 className="w-5 h-5" />{notice}</div>}
        {error && <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-3 text-sm"><AlertCircle className="w-5 h-5" />{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
          <aside className="champagne-card bg-white rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-editorial text-xl font-bold text-stone-900">Seus casos</h2>
              <span className="text-xs text-stone-500">{matters.length}</span>
            </div>
            <form onSubmit={createMatter} className="space-y-2">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Nome do novo caso" className="w-full px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
              <input value={practiceArea} onChange={(event) => setPracticeArea(event.target.value)} placeholder="Área jurídica (opcional)" className="w-full px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
              <button disabled={!hasApiAccess || busy || title.trim().length < 3} className="w-full px-3 py-2.5 rounded-lg bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold"><Plus className="w-4 h-4 inline mr-1" />Criar caso</button>
            </form>
            <div className="space-y-2">
              {matters.map((matter) => (
                <button key={matter.id} onClick={() => void selectMatter(matter.id)} className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedMatterId === matter.id ? 'border-cognac-400 bg-cognac-50' : 'border-champagne-border hover:border-cognac-300'}`}>
                  <span className="block text-sm font-semibold text-stone-900 truncate">{matter.title}</span>
                  <span className="text-[11px] text-stone-500">{matter.practiceArea || 'Área não informada'} · {matter.status === 'OPEN' ? 'Aberto' : matter.status === 'CLOSED' ? 'Encerrado' : 'Arquivado'}</span>
                </button>
              ))}
              {matters.length === 0 && <p className="text-xs text-stone-500 leading-relaxed">Nenhum caso carregado. Informe um token com escopo de matters ou crie o primeiro caso.</p>}
            </div>
          </aside>

          <main className="space-y-6">
            <section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
              {selectedMatter ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-stone-100 pb-4">
                    <div>
                      <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">Caso aberto</span>
                      <h2 className="font-editorial text-2xl font-bold text-stone-900 mt-1">{selectedMatter.title}</h2>
                      <p className="text-xs text-stone-500 mt-1">{selectedMatter.practiceArea || 'Área jurídica não informada'}{selectedMatter.jurisdiction ? ` · ${selectedMatter.jurisdiction}` : ''}</p>
                    </div>
                    <span className="text-[11px] text-stone-400">Atualizado em {new Date(selectedMatter.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
                    {[
                      ['Documentos', documents.length],
                      ['Fatos', facts.length],
                      ['Provas', evidence.length],
                      ['Eventos', timeline.length],
                      ['Questões', issues.length],
                      ['Memos', memos.length],
                    ].map(([section, count]) => <div key={section} className="p-3 rounded-xl bg-[#FDFBF7] border border-champagne-border"><span className="block text-xs font-semibold text-stone-700">{section}</span><span className="text-[10px] text-stone-500">{count} registrado(s)</span></div>)}
                  </div>
                  <nav className="flex flex-wrap gap-2 border-t border-stone-100 pt-4" aria-label="Seções do caso">
                    {[
                      ['documentos', 'Documentos'],
                      ['fatos', 'Fatos e provas'],
                      ['provas', 'Provas'],
                      ['linha-do-tempo', 'Linha do tempo'],
                      ['questoes', 'Questões jurídicas'],
                      ['research-memo', 'Research memo'],
                    ].map(([id, label]) => <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="btn-quiet min-h-9 px-2.5 text-xs">{label}</button>)}
                    <button type="button" onClick={() => setActiveTab('research')} className="btn-quiet min-h-9 px-2.5 text-xs">Fontes</button>
                    <button type="button" onClick={() => setActiveTab('draft_studio')} className="btn-quiet min-h-9 px-2.5 text-xs">Rascunhos</button>
                    <button type="button" onClick={() => setActiveTab('dashboard')} className="btn-quiet min-h-9 px-2.5 text-xs">Revisão e atividade</button>
                  </nav>
                </>
              ) : (
                <div className="py-12 text-center space-y-3"><FolderOpen className="w-10 h-10 mx-auto text-cognac-400" /><h2 className="font-editorial text-xl font-bold text-stone-900">Selecione ou crie um caso</h2><p className="text-sm text-stone-500">O contexto e os documentos aparecerão aqui.</p></div>
              )}
            </section>

            {selectedMatter && <section id="documentos" className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-cognac-700" /><h2 className="font-editorial text-xl font-bold text-stone-900">Documentos do caso</h2><span className="text-xs text-stone-500">{documents.length}</span></div>
              <form onSubmit={ingestDocument} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Título do documento" className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                <input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="Nome do arquivo (ex.: fatos.txt)" className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Cole o texto do documento para criar a primeira versão e suas âncoras..." rows={5} className="md:col-span-2 px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm resize-y" />
                <button disabled={!hasApiAccess || busy || !content.trim()} className="md:col-span-2 px-4 py-2.5 rounded-xl bg-cognac-50 hover:bg-cognac-100 border border-cognac-200 disabled:bg-stone-100 text-cognac-800 text-sm font-semibold">Ingerir documento textual</button>
              </form>
              <div className="space-y-2">
                {documents.map((document) => <div key={document.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl border border-champagne-border bg-[#FDFBF7]"><div><span className="block text-sm font-semibold text-stone-900">{document.title}</span><span className="text-[11px] text-stone-500">{document.originalFilename} · {document.status === 'INDEXED' ? 'Ancorado' : 'Falhou'}</span></div><span className="text-[10px] text-stone-400 font-mono">SHA-256 {document.contentHash.slice(0, 12)}…</span></div>)}
                {documents.length === 0 && <p className="text-xs text-stone-500">Este caso ainda não possui documentos.</p>}
              </div>
            </section>}

            {selectedMatter && <>
              <section id="fatos" className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-editorial text-xl font-bold text-stone-900">Fatos</h2>
                    <p className="text-xs text-stone-500 mt-1">Registre candidatos e mantenha separado o que foi afirmado do que está confirmado.</p>
                  </div>
                  <span className="text-xs text-stone-500">{facts.length}</span>
                </div>
                <form onSubmit={createFact} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
                  <input value={factStatement} onChange={(event) => setFactStatement(event.target.value)} placeholder="Ex.: o contrato foi assinado em janeiro" className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                  <select value={factCategory} onChange={(event) => setFactCategory(event.target.value as Fact['category'])} className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm">
                    <option value="FACTUAL">Factual</option><option value="PROCEDURAL">Processual</option><option value="TEMPORAL">Temporal</option><option value="DAMAGE">Dano</option><option value="OTHER">Outro</option>
                  </select>
                  <button disabled={!hasApiAccess || busy || factStatement.trim().length < 3} className="px-4 py-2.5 rounded-lg bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold">Registrar</button>
                </form>
                <div className="space-y-2">
                  {facts.map((fact) => {
                    const factCoverage = coverage.find((item) => item.factId === fact.id);
                    return <div key={fact.id} className="p-3 rounded-xl border border-champagne-border bg-[#FDFBF7]">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><p className="text-sm text-stone-800">{fact.statement}</p><span className="shrink-0 text-[10px] uppercase tracking-wide text-cognac-700">{factStatusLabels[fact.status]}</span></div>
                      <p className="text-[11px] text-stone-500 mt-2">{categoryLabels[fact.category]} · {factStatusLabels[fact.status]} · Cobertura: {coverageLabels[factCoverage?.coverage ?? 'UNSUPPORTED']} · {factCoverage?.supportingAnchorCount ?? 0} origem(ns) · {factCoverage?.supportingEvidenceCount ?? 0} prova(s)</p>
                    </div>;
                  })}
                  {facts.length === 0 && <p className="text-xs text-stone-500">Nenhum fato registrado neste caso.</p>}
                </div>
              </section>

              <section id="provas" className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-editorial text-xl font-bold text-stone-900">Provas</h2>
                    <p className="text-xs text-stone-500 mt-1">Cadastre a disponibilidade da prova antes de vinculá-la a fatos e âncoras.</p>
                  </div>
                  <span className="text-xs text-stone-500">{evidence.length}</span>
                </div>
              <form onSubmit={createEvidence} className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3">
                  <input value={evidenceTitle} onChange={(event) => setEvidenceTitle(event.target.value)} placeholder="Título do item de prova" className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                  <select value={evidenceType} onChange={(event) => setEvidenceType(event.target.value as EvidenceItem['evidenceType'])} className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm">
                    <option value="DOCUMENT">Documento</option><option value="TESTIMONY">Depoimento</option><option value="RECORD">Registro</option><option value="EXPERT_REPORT">Laudo</option><option value="OTHER">Outro</option>
                  </select>
                <button disabled={!hasApiAccess || busy || evidenceTitle.trim().length < 3} className="px-4 py-2.5 rounded-lg bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold">Registrar</button>
              </form>
              <form onSubmit={mapSupport} className="rounded-xl border border-cognac-100 bg-cognac-50/40 p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-stone-800">Mapear suporte</p>
                  <p className="text-[11px] text-stone-500 mt-1">Vincule um fato a uma prova ou a uma âncora do documento; o vínculo não conclui autenticidade.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select value={supportFactId} onChange={(event) => setSupportFactId(event.target.value)} className="px-3 py-2 rounded-lg border border-champagne-border bg-white text-xs">
                    <option value="">Selecione o fato</option>
                    {facts.map((fact) => <option key={fact.id} value={fact.id}>{fact.statement.slice(0, 55)}</option>)}
                  </select>
                  <select value={supportEvidenceId} onChange={(event) => setSupportEvidenceId(event.target.value)} className="px-3 py-2 rounded-lg border border-champagne-border bg-white text-xs">
                    <option value="">Selecione a prova</option>
                    {evidence.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                  <select value={supportAnchorId} onChange={(event) => setSupportAnchorId(event.target.value)} className="px-3 py-2 rounded-lg border border-champagne-border bg-white text-xs">
                    <option value="">Selecione a âncora (opcional)</option>
                    {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.anchorKey}: {anchor.text.slice(0, 42)}</option>)}
                  </select>
                  <select value={supportRelation} onChange={(event) => setSupportRelation(event.target.value as typeof supportRelation)} className="px-3 py-2 rounded-lg border border-champagne-border bg-white text-xs">
                    <option value="SUPPORTS">Sustenta</option><option value="CONTRADICTS">Contradiz</option><option value="CONTEXT">Contextualiza</option>
                  </select>
                </div>
                  <button disabled={!hasApiAccess || busy || !supportFactId || (!supportEvidenceId && !supportAnchorId)} className="px-3 py-2 rounded-lg border border-cognac-200 bg-white disabled:bg-stone-100 text-cognac-800 text-xs font-semibold">Salvar vínculo</button>
              </form>
              <div className="space-y-2">
                  {evidence.map((item) => <div key={item.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl border border-champagne-border bg-[#FDFBF7]"><div><span className="block text-sm font-semibold text-stone-900">{item.title}</span><span className="text-[11px] text-stone-500">{evidenceTypeLabels[item.evidenceType]} · {evidenceStatusLabels[item.status]}</span></div><span className="text-[10px] text-stone-400">Item registrado</span></div>)}
                  {evidence.length === 0 && <p className="text-xs text-stone-500">Nenhum item de prova registrado neste caso.</p>}
                </div>
              </section>

              <section id="linha-do-tempo" className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-editorial text-xl font-bold text-stone-900">Linha do tempo</h2>
                    <p className="text-xs text-stone-500 mt-1">Ordenação civil por data; o vínculo documental é opcional.</p>
                  </div>
                  <span className="text-xs text-stone-500">{timeline.length}</span>
                </div>
                <form onSubmit={createTimelineEvent} className="grid grid-cols-1 md:grid-cols-[1fr_170px_auto] gap-3">
                  <input value={timelineTitle} onChange={(event) => setTimelineTitle(event.target.value)} placeholder="Descrição do evento" className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                  <input type="date" value={timelineDate} onChange={(event) => setTimelineDate(event.target.value)} className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                  <button disabled={!hasApiAccess || busy || timelineTitle.trim().length < 3 || !timelineDate} className="px-4 py-2.5 rounded-lg bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold">Adicionar</button>
                  <input value={timelineDescription} onChange={(event) => setTimelineDescription(event.target.value)} placeholder="Observação (opcional)" className="md:col-span-3 px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                </form>
                <div className="space-y-2">
                  {timeline.map((item) => <div key={item.id} className="flex gap-3 p-3 rounded-xl border border-champagne-border bg-[#FDFBF7]"><span className="text-xs font-semibold text-cognac-700 min-w-24">{new Date(`${item.eventDate}T00:00:00`).toLocaleDateString('pt-BR')}</span><div><span className="block text-sm font-semibold text-stone-900">{item.title}</span>{item.description && <span className="text-xs text-stone-500">{item.description}</span>}</div></div>)}
                  {timeline.length === 0 && <p className="text-xs text-stone-500">Nenhum evento registrado neste caso.</p>}
                </div>
                <p className="text-[11px] text-stone-400">A cobertura considera apenas vínculos explícitos registrados; não constitui conclusão sobre autenticidade, suficiência ou procedência da prova.</p>
              </section>

              <section id="questoes" className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-editorial text-xl font-bold text-stone-900">Questões jurídicas</h2>
                    <p className="text-xs text-stone-500 mt-1">Delimite os pontos que orientarão a pesquisa do caso.</p>
                  </div>
                  <span className="text-xs text-stone-500">{issues.length}</span>
                </div>
                <form onSubmit={createIssue} className="flex flex-col md:flex-row gap-3">
                  <input value={issueStatement} onChange={(event) => setIssueStatement(event.target.value)} placeholder="Ex.: a violação de dados gera dano indenizável neste caso?" className="flex-1 px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                  <button disabled={!hasApiAccess || busy || issueStatement.trim().length < 3} className="px-4 py-2.5 rounded-lg bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold">Registrar questão</button>
                </form>
                <div className="space-y-2">
                  {issues.map((issue) => <div key={issue.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl border border-champagne-border bg-[#FDFBF7]"><p className="text-sm text-stone-800">{issue.statement}</p><span className="text-[10px] uppercase tracking-wide text-cognac-700">{issueStatusLabels[issue.status]}</span></div>)}
                  {issues.length === 0 && <p className="text-xs text-stone-500">Nenhuma questão jurídica registrada. O memo ainda pode ser gerado com uma consulta livre.</p>}
                </div>
              </section>

              <section id="research-memo" className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h2 className="font-editorial text-xl font-bold text-stone-900">Research memo</h2>
                    <p className="text-xs text-stone-500 mt-1">Cruze o contexto registrado com a pesquisa e encaminhe o resultado para revisão humana.</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-amber-700">Revisão humana obrigatória</span>
                </div>
                <form onSubmit={generateMemo} className="flex flex-col md:flex-row gap-3">
                  <input value={memoQuery} onChange={(event) => setMemoQuery(event.target.value)} placeholder="Recorte de pesquisa jurídica" className="flex-1 px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                  <button disabled={!hasApiAccess || busy || memoQuery.trim().length < 3} className="px-4 py-2.5 rounded-lg bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold">{busy ? 'Pesquisando...' : 'Gerar memo'}</button>
                </form>
                <div className="space-y-4">
                  {memos.map((record) => <article key={record.id} className="rounded-xl border border-champagne-border bg-[#FDFBF7] p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"><div><p className="text-sm font-bold text-stone-900">{record.memo.title}</p><p className="text-[11px] text-stone-500 mt-1">Consulta: {record.query} · {new Date(record.createdAt).toLocaleString('pt-BR')}</p></div><span className={`text-[10px] uppercase tracking-wide ${record.status === 'APPROVED' ? 'text-emerald-700' : record.status === 'REJECTED' ? 'text-red-700' : 'text-amber-700'}`}>{memoStatusLabels[record.status]}</span></div>
                    <p className="text-sm leading-relaxed text-stone-700">{record.memo.executiveSummary}</p>
                    <div className="space-y-1"><p className="text-[10px] uppercase tracking-wide font-bold text-stone-500">Teses estruturadas</p>{record.memo.keyTheses.map((thesis) => <p key={thesis} className="text-xs text-stone-700">{thesis}</p>)}</div>
                    <div className="space-y-1"><p className="text-[10px] uppercase tracking-wide font-bold text-stone-500">Autoridades localizadas</p>{record.memo.applicableAuthorities.map((authority) => <p key={authority.id} className="text-xs text-stone-700">{authority.citation} · {authority.provenance.verified ? 'proveniência verificada' : 'conferência pendente'}</p>)}{record.memo.applicableAuthorities.length === 0 && <p className="text-xs text-stone-500">Nenhuma autoridade retornada.</p>}</div>
                    <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3"><p className="text-xs text-amber-900"><span className="font-bold">Risco:</span> {record.memo.riskAnalysis}</p><p className="text-xs text-amber-900 mt-1"><span className="font-bold">Providência:</span> {record.memo.recommendedAction}</p></div>
                    {record.status === 'PENDING_HUMAN_REVIEW' && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void reviewMemo(record.id, 'APPROVED')} disabled={busy} className="px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold">Aprovar revisão</button><button type="button" onClick={() => void reviewMemo(record.id, 'REJECTED')} disabled={busy} className="px-3 py-2 rounded-lg border border-red-200 text-red-700 text-xs font-semibold">Rejeitar memo</button></div>}
                  </article>)}
                  {memos.length === 0 && <p className="text-xs text-stone-500">Nenhum research memo gerado para este caso.</p>}
                </div>
              </section>
            </>}
          </main>
        </div>
      </div>
    </div>
  );
};
