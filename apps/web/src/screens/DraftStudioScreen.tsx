import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, History, LockKeyhole, Plus, RefreshCw, Send, ShieldAlert } from 'lucide-react';
import { requestApiWithToken, resolveApiOrigin } from '../api-client';
import { useAuth } from '../auth/AuthContext';

interface Matter {
  id: string;
  title: string;
  practiceArea?: string;
  jurisdiction?: string;
}

interface Draft {
  id: string;
  matterId: string;
  title: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVAL_PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED';
  currentVersionId?: string;
  updatedAt: string;
}

interface DraftSection {
  id: string;
  ordinal: number;
  title: string;
  content: string;
  linkedFactIds: string[];
  linkedEvidenceIds: string[];
  linkedAuthorityIds: string[];
  linkedThesisIds: string[];
}

interface LegalIssue {
  id: string;
  statement: string;
  status: string;
}

interface Fact {
  id: string;
  statement: string;
}

interface EvidenceItem {
  id: string;
  title: string;
}

interface SavedAuthority {
  id: string;
  authority: { court: string; processNumber: string; syllabus: string };
}

interface LegalThesis {
  id: string;
  title: string;
  statement: string;
  issueIds: string[];
  factIds: string[];
  evidenceIds: string[];
  authorityIds: string[];
}

interface DraftVersion {
  id: string;
  versionNumber: number;
  contentHash: string;
  status: Draft['status'];
  createdAt: string;
}

interface ReviewFinding {
  id: string;
  reviewType: 'CITATION' | 'FACT_SUPPORT' | 'ADVERSARIAL';
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  code: string;
  message: string;
}

interface DraftDetails {
  draft: Draft;
  currentVersion?: { version: DraftVersion; sections: DraftSection[]; citations: Citation[] };
  versions: DraftVersion[];
  reviewFindings: ReviewFinding[];
}

interface DraftWriteResponse {
  draft: Draft;
  version: DraftVersion;
  sections: DraftSection[];
}

interface Citation {
  id: string;
  sectionId: string;
  targetType: 'AUTHORITY' | 'FACT' | 'EVIDENCE';
  targetId: string;
  citationText: string;
  verified: boolean;
}

interface EditableSection {
  title: string;
  content: string;
  linkedFactIds: string[];
  linkedEvidenceIds: string[];
  linkedAuthorityIds: string[];
  linkedThesisIds: string[];
}

function initialSections(): EditableSection[] {
  return [
    { title: 'Síntese dos fatos', content: '', linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: [], linkedThesisIds: [] },
    { title: 'Questões jurídicas', content: '', linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: [], linkedThesisIds: [] },
    { title: 'Fundamentação a revisar', content: '', linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: [], linkedThesisIds: [] },
    { title: 'Pedidos e providências', content: '', linkedFactIds: [], linkedEvidenceIds: [], linkedAuthorityIds: [], linkedThesisIds: [] },
  ];
}

const apiUrl = resolveApiOrigin();

function initialToken(): string {
  try {
    return window.localStorage.getItem('forgelex_api_token') ?? '';
  } catch {
    return '';
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  return requestApiWithToken<T>(path, token, init);
}

const statusLabel: Record<Draft['status'], string> = {
  DRAFT: 'Rascunho',
  IN_REVIEW: 'Em revisão',
  APPROVAL_PENDING: 'Aguardando aprovação',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  ARCHIVED: 'Arquivado',
};

export const DraftStudioScreen: React.FC = () => {
  const { status: authStatus } = useAuth();
  const [token, setToken] = useState(initialToken);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [details, setDetails] = useState<DraftDetails | null>(null);
  const [draftTitle, setDraftTitle] = useState('Minuta para revisão humana');
  const [sections, setSections] = useState<EditableSection[]>(initialSections);
  const [issues, setIssues] = useState<LegalIssue[]>([]);
  const [facts, setFacts] = useState<Fact[]>([]);
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [authorities, setAuthorities] = useState<SavedAuthority[]>([]);
  const [theses, setTheses] = useState<LegalThesis[]>([]);
  const [thesisTitle, setThesisTitle] = useState('');
  const [thesisStatement, setThesisStatement] = useState('');
  const [thesisIssueId, setThesisIssueId] = useState('');
  const [thesisFactId, setThesisFactId] = useState('');
  const [thesisEvidenceId, setThesisEvidenceId] = useState('');
  const [thesisAuthorityId, setThesisAuthorityId] = useState('');
  const [citations, setCitations] = useState<Array<{
    sectionOrdinal: number;
    targetType: Citation['targetType'];
    targetId: string;
    citationText: string;
    verified: boolean;
  }>>([]);
  const [citationSectionOrdinal, setCitationSectionOrdinal] = useState(0);
  const [citationTargetType, setCitationTargetType] = useState<Citation['targetType']>('AUTHORITY');
  const [citationTargetId, setCitationTargetId] = useState('');
  const [citationText, setCitationText] = useState('');
  const [citationVerified, setCitationVerified] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasApiAccess = Boolean(token.trim()) || authStatus === 'authenticated' || authStatus === 'legacy';

  const selectedMatter = useMemo(() => matters.find((matter) => matter.id === selectedMatterId), [matters, selectedMatterId]);

  const saveToken = (value: string) => {
    setToken(value);
    try {
      window.localStorage.setItem('forgelex_api_token', value);
    } catch {
      // O fluxo continua utilizável quando o armazenamento do navegador está indisponível.
    }
  };

  const loadMatters = async () => {
    if (!hasApiAccess) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ items: Matter[] }>('/api/v2/matters', token);
      setMatters(response.items);
      if (response.items.length > 0 && !selectedMatterId) {
        await selectMatter(response.items[0].id);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os casos.');
    } finally {
      setBusy(false);
    }
  };

  const loadDrafts = async (matterId: string) => {
    const response = await request<{ items: Draft[] }>(`/api/v2/matters/${matterId}/drafts`, token);
    setDrafts(response.items);
  };

  const loadMatterContext = async (matterId: string) => {
    const [issuesResponse, factsResponse, evidenceResponse, authoritiesResponse, thesisMap] = await Promise.all([
      request<{ items: LegalIssue[] }>(`/api/v2/matters/${matterId}/issues`, token),
      request<{ items: Fact[] }>(`/api/v2/matters/${matterId}/facts`, token),
      request<{ items: EvidenceItem[] }>(`/api/v2/matters/${matterId}/evidence`, token),
      request<{ items: SavedAuthority[] }>(`/api/v2/matters/${matterId}/authorities`, token),
      request<{ theses: LegalThesis[] }>(`/api/v2/matters/${matterId}/thesis-map`, token),
    ]);
    setIssues(issuesResponse.items);
    setFacts(factsResponse.items);
    setEvidence(evidenceResponse.items);
    setAuthorities(authoritiesResponse.items);
    setTheses(thesisMap.theses);
  };

  const selectMatter = async (matterId: string) => {
    setSelectedMatterId(matterId);
    setSelectedDraftId('');
    setDetails(null);
    setSections(initialSections());
    setCitations([]);
    setError(null);
    setBusy(true);
    try {
      await Promise.all([loadDrafts(matterId), loadMatterContext(matterId)]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os rascunhos.');
    } finally {
      setBusy(false);
    }
  };

  const selectDraft = async (draftId: string) => {
    if (!selectedMatterId) return;
    setSelectedDraftId(draftId);
    setBusy(true);
    setError(null);
    try {
      const response = await request<DraftDetails>(`/api/v2/matters/${selectedMatterId}/drafts/${draftId}`, token);
      setDetails(response);
      if (response.currentVersion) {
        setDraftTitle(response.draft.title);
        setSections(response.currentVersion.sections.map((section) => ({
          title: section.title,
          content: section.content,
          linkedFactIds: section.linkedFactIds,
          linkedEvidenceIds: section.linkedEvidenceIds,
          linkedAuthorityIds: section.linkedAuthorityIds,
          linkedThesisIds: section.linkedThesisIds,
        })));
        setCitations(response.currentVersion.citations.map((citation) => ({
          sectionOrdinal: response.currentVersion!.sections.find((section) => section.id === citation.sectionId)?.ordinal ?? 0,
          targetType: citation.targetType,
          targetId: citation.targetId,
          citationText: citation.citationText,
          verified: citation.verified,
        })));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a minuta.');
    } finally {
      setBusy(false);
    }
  };

  const payload = () => ({
    title: draftTitle,
    sections: sections.map((section, ordinal) => ({ ordinal, ...section })),
    citations,
  });

  const toggleLink = (sectionIndex: number, field: 'linkedFactIds' | 'linkedEvidenceIds' | 'linkedAuthorityIds' | 'linkedThesisIds', id: string) => {
    setSections((current) => current.map((section, index) => {
      if (index !== sectionIndex) return section;
      const values = section[field];
      return { ...section, [field]: values.includes(id) ? values.filter((item) => item !== id) : [...values, id] };
    }));
  };

  const citationTargets = citationTargetType === 'AUTHORITY'
    ? authorities.map((item) => ({ id: item.id, label: `${item.authority.court} · ${item.authority.processNumber}` }))
    : citationTargetType === 'FACT'
      ? facts.map((item) => ({ id: item.id, label: item.statement }))
      : evidence.map((item) => ({ id: item.id, label: item.title }));

  const addCitation = () => {
    if (!citationTargetId || citationText.trim().length < 3) return;
    setCitations((current) => [...current, {
      sectionOrdinal: citationSectionOrdinal,
      targetType: citationTargetType,
      targetId: citationTargetId,
      citationText: citationText.trim(),
      verified: citationVerified,
    }]);
    setCitationText('');
    setCitationTargetId('');
    setCitationVerified(false);
  };

  const createThesis = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMatterId || thesisTitle.trim().length < 3 || thesisStatement.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      await request<LegalThesis>(`/api/v2/matters/${selectedMatterId}/theses`, token, {
        method: 'POST',
        body: JSON.stringify({
          title: thesisTitle.trim(),
          statement: thesisStatement.trim(),
          issueIds: thesisIssueId ? [thesisIssueId] : [],
          factIds: thesisFactId ? [thesisFactId] : [],
          evidenceIds: thesisEvidenceId ? [thesisEvidenceId] : [],
          authorityIds: thesisAuthorityId ? [thesisAuthorityId] : [],
        }),
      });
      await loadMatterContext(selectedMatterId);
      setThesisTitle('');
      setThesisStatement('');
      setThesisIssueId('');
      setThesisFactId('');
      setThesisEvidenceId('');
      setThesisAuthorityId('');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível registrar a tese.');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMatterId || !draftTitle.trim() || sections.some((section) => section.title.trim().length < 3)) return;
    setBusy(true);
    setError(null);
    setApprovalToken(null);
    try {
      const response = selectedDraftId
        ? await request<DraftWriteResponse>(`/api/v2/matters/${selectedMatterId}/drafts/${selectedDraftId}/versions`, token, { method: 'POST', body: JSON.stringify(payload()) })
        : await request<DraftWriteResponse>(`/api/v2/matters/${selectedMatterId}/drafts`, token, { method: 'POST', body: JSON.stringify(payload()) });
      setSelectedDraftId(response.draft.id);
      await loadDrafts(selectedMatterId);
      await selectDraft(response.draft.id);
      setReviewStatus('Versão salva como rascunho. A revisão ainda precisa ser executada.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a versão.');
    } finally {
      setBusy(false);
    }
  };

  const runReview = async () => {
    if (!selectedMatterId || !selectedDraftId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ status: 'PASSED' | 'WARNINGS' | 'BLOCKED'; blockingCount: number; warningCount: number }>(
        `/api/v2/matters/${selectedMatterId}/drafts/${selectedDraftId}/review`,
        token,
        { method: 'POST', body: JSON.stringify({ type: 'all' }) },
      );
      setReviewStatus(`${result.status}: ${result.blockingCount} bloqueador(es) e ${result.warningCount} alerta(s).`);
      await selectDraft(selectedDraftId);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Não foi possível executar a revisão.');
    } finally {
      setBusy(false);
    }
  };

  const requestApproval = async () => {
    if (!selectedMatterId || !selectedDraftId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ token: string }>(`/api/v2/matters/${selectedMatterId}/drafts/${selectedDraftId}/approval`, token, {
        method: 'POST',
        body: JSON.stringify({ versionId: details?.draft.currentVersionId }),
      });
      setApprovalToken(response.token);
      await selectDraft(selectedDraftId);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'A versão não pode ser encaminhada para aprovação.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="py-8 md:py-12">
      <div className="page-container space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="space-y-3">
            <div className="eyebrow inline-flex items-center gap-2 rounded-full bg-cognac-100 px-3 py-1">
              <FileText className="w-3.5 h-3.5" />
              Rascunhos
            </div>
            <h1 className="font-editorial text-4xl font-bold text-stone-950">Rascunho do caso</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-stone-600">
              Organize o outline, os vínculos do caso e o histórico de versões. O conteúdo permanece minuta até a conferência humana.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-stone-500"><ShieldAlert className="w-4 h-4 text-amber-600" />Sem efeito externo automático</div>
        </div>

        <details className="technical-access">
              <summary>Detalhes técnicos</summary>
          <div className="technical-access__content space-y-3 pt-3">
            <div className="flex items-center gap-2 text-stone-900"><LockKeyhole className="h-4 w-4 text-cognac-700" aria-hidden="true" /><h2 className="text-sm font-bold">Conexão com a área de rascunhos</h2></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="draft-api-token">Credencial da API</label>
              <input id="draft-api-token" value={token} onChange={(event) => saveToken(event.target.value)} type="password" placeholder="Credencial da API" className="input-control flex-1" />
              <button type="button" onClick={() => void loadMatters()} disabled={!hasApiAccess || busy} className="btn-secondary disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Atualizar casos</button>
            </div>
            <p className="text-[11px] text-stone-500">A conexão usa {apiUrl}. A credencial permanece no navegador.</p>
          </div>
        </details>

        {reviewStatus && <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-3 text-sm"><CheckCircle2 className="w-5 h-5" />{reviewStatus}</div>}
        {approvalToken && <details className="technical-access"><summary>Autorização de aprovação emitida</summary><div className="technical-access__content space-y-2 pt-3 text-sm text-amber-900"><code className="block break-all rounded-lg bg-white/70 p-3 text-xs">{approvalToken}</code><p className="text-xs">Guarde este código para registrar a decisão. Ele não é persistido em texto bruto.</p></div></details>}
        {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-3 text-sm"><AlertCircle className="w-5 h-5" />{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          <aside className="champagne-card bg-white rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between"><h2 className="font-editorial text-xl font-bold text-stone-900">Casos</h2><span className="text-xs text-stone-500">{matters.length}</span></div>
            <div className="space-y-2">
              {matters.map((matter) => <button key={matter.id} onClick={() => void selectMatter(matter.id)} className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedMatterId === matter.id ? 'border-cognac-400 bg-cognac-50' : 'border-champagne-border hover:border-cognac-300'}`}><span className="block text-sm font-semibold text-stone-900 truncate">{matter.title}</span><span className="text-[11px] text-stone-500">{matter.practiceArea ?? 'Área não informada'}</span></button>)}
              {matters.length === 0 && <p className="text-xs text-stone-500 leading-relaxed">Atualize os casos com uma credencial que tenha acesso a matters.</p>}
            </div>
            {selectedMatter && <div className="pt-4 border-t border-stone-100 space-y-2"><p className="text-[10px] uppercase tracking-wider text-stone-400 font-bold">Rascunhos do caso</p>{drafts.map((draft) => <button key={draft.id} onClick={() => void selectDraft(draft.id)} className={`w-full text-left p-3 rounded-xl border ${selectedDraftId === draft.id ? 'border-cognac-400 bg-cognac-50' : 'border-champagne-border hover:border-cognac-300'}`}><span className="block text-sm font-semibold text-stone-800 truncate">{draft.title}</span><span className="text-[11px] text-stone-500">{statusLabel[draft.status]}</span></button>)}{drafts.length === 0 && <p className="text-xs text-stone-500">Nenhum rascunho neste caso.</p>}</div>}
          </aside>

          <main className="space-y-6">
            {!selectedMatter ? <section className="champagne-card bg-white rounded-2xl p-10 text-center"><FileText className="w-10 h-10 mx-auto text-cognac-400" /><h2 className="font-editorial text-xl font-bold text-stone-900 mt-3">Selecione um caso</h2><p className="text-sm text-stone-500 mt-2">O outline e o histórico de versões aparecerão aqui.</p></section> : <>
              <section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex items-start justify-between gap-4"><div><span className="text-[10px] uppercase tracking-wider font-bold text-cognac-700">Estratégia do caso</span><h2 className="font-editorial text-2xl font-bold text-stone-900 mt-1">Mapa de teses</h2><p className="text-sm text-stone-500 mt-1">Cada tese pode carregar a questão, o fato, a prova e a authority que justificam sua redação.</p></div><span className="rounded-full bg-cognac-50 px-3 py-1 text-xs font-semibold text-cognac-800">{theses.length} tese(s)</span></div>
                <div className="grid gap-3 md:grid-cols-2">
                  {theses.map((thesis) => <div key={thesis.id} className="rounded-xl border border-cognac-100 bg-[#FDFBF7] p-4"><p className="text-sm font-semibold text-stone-900">{thesis.title}</p><p className="mt-1 text-xs leading-relaxed text-stone-600">{thesis.statement}</p><p className="mt-3 text-[11px] text-stone-500">{thesis.factIds.length} fato(s) · {thesis.evidenceIds.length} prova(s) · {thesis.authorityIds.length} authority(ies)</p></div>)}
                  {theses.length === 0 && <p className="text-xs text-stone-500">Nenhuma tese registrada. Crie a primeira abaixo para vinculá-la à minuta.</p>}
                </div>
                <form onSubmit={createThesis} className="grid gap-3 border-t border-stone-100 pt-4">
                  <div className="grid gap-3 md:grid-cols-2"><input value={thesisTitle} onChange={(event) => setThesisTitle(event.target.value)} placeholder="Título da tese" className="input-control" /><input value={thesisStatement} onChange={(event) => setThesisStatement(event.target.value)} placeholder="Enunciado da tese jurídica" className="input-control" /></div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <select value={thesisIssueId} onChange={(event) => setThesisIssueId(event.target.value)} className="input-control"><option value="">Questão jurídica</option>{issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.statement}</option>)}</select>
                    <select value={thesisFactId} onChange={(event) => setThesisFactId(event.target.value)} className="input-control"><option value="">Fato</option>{facts.map((fact) => <option key={fact.id} value={fact.id}>{fact.statement}</option>)}</select>
                    <select value={thesisEvidenceId} onChange={(event) => setThesisEvidenceId(event.target.value)} className="input-control"><option value="">Prova</option>{evidence.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                    <select value={thesisAuthorityId} onChange={(event) => setThesisAuthorityId(event.target.value)} className="input-control"><option value="">Authority</option>{authorities.map((item) => <option key={item.id} value={item.id}>{item.authority.court} · {item.authority.processNumber}</option>)}</select>
                  </div>
                  <div><button type="submit" disabled={busy || thesisTitle.trim().length < 3 || thesisStatement.trim().length < 10} className="btn-secondary disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true" />Registrar tese</button></div>
                </form>
              </section>
              <form onSubmit={saveDraft} className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">{selectedDraftId ? 'Nova versão' : 'Novo rascunho'}</span><h2 className="font-editorial text-2xl font-bold text-stone-900 mt-1">{selectedMatter.title}</h2></div><span className="text-xs text-stone-500">{selectedDraftId && details ? `Versão ${details.currentVersion?.version.versionNumber ?? '-'}` : 'Outline inicial'}</span></div>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Título do rascunho" className="w-full px-4 py-3 rounded-xl border border-champagne-border bg-[#FDFBF7] text-sm" />
                <div className="space-y-3">{sections.map((section, index) => <div key={`${section.title}-${index}`} className="rounded-xl border border-champagne-border bg-[#FDFBF7] p-4 space-y-3"><div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-cognac-100 text-cognac-800 text-xs font-bold flex items-center justify-center">{index + 1}</span><input value={section.title} onChange={(event) => setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} className="flex-1 bg-transparent text-sm font-semibold text-stone-900 border-b border-transparent focus:border-cognac-300 focus:outline-none" /></div><textarea value={section.content} onChange={(event) => setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))} rows={3} placeholder="Conteúdo da seção para conferência..." className="w-full px-3 py-2 rounded-lg border border-champagne-border bg-white text-sm resize-y" /><div className="grid gap-3 border-t border-stone-100 pt-3 md:grid-cols-2"><fieldset><legend className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">Vínculos do mapa</legend><div className="space-y-1">{theses.map((thesis) => <label key={thesis.id} className="flex items-start gap-2 text-xs text-stone-700"><input type="checkbox" checked={section.linkedThesisIds.includes(thesis.id)} onChange={() => toggleLink(index, 'linkedThesisIds', thesis.id)} className="mt-0.5 accent-cognac-700" /><span>{thesis.title}</span></label>)}{theses.length === 0 && <p className="text-xs text-stone-400">Sem teses disponíveis.</p>}</div></fieldset><fieldset><legend className="mb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">Fatos, provas e authorities</legend><div className="grid gap-1 sm:grid-cols-2">{facts.map((fact) => <label key={fact.id} className="flex items-start gap-2 text-xs text-stone-700"><input type="checkbox" checked={section.linkedFactIds.includes(fact.id)} onChange={() => toggleLink(index, 'linkedFactIds', fact.id)} className="mt-0.5 accent-cognac-700" /><span>Fato: {fact.statement}</span></label>)}{evidence.map((item) => <label key={item.id} className="flex items-start gap-2 text-xs text-stone-700"><input type="checkbox" checked={section.linkedEvidenceIds.includes(item.id)} onChange={() => toggleLink(index, 'linkedEvidenceIds', item.id)} className="mt-0.5 accent-cognac-700" /><span>Prova: {item.title}</span></label>)}{authorities.map((item) => <label key={item.id} className="flex items-start gap-2 text-xs text-stone-700"><input type="checkbox" checked={section.linkedAuthorityIds.includes(item.id)} onChange={() => toggleLink(index, 'linkedAuthorityIds', item.id)} className="mt-0.5 accent-cognac-700" /><span>Authority: {item.authority.processNumber}</span></label>)}</div></fieldset></div></div>)}</div>
                <div className="rounded-xl border border-cognac-100 bg-cognac-50/40 p-4 space-y-3"><div><p className="text-xs font-bold text-stone-800">Âncoras de citação</p><p className="text-[11px] text-stone-500">Registre a fonte usada e marque como verificada somente após a conferência humana.</p></div><div className="grid gap-3 md:grid-cols-5"><select value={citationSectionOrdinal} onChange={(event) => setCitationSectionOrdinal(Number(event.target.value))} className="input-control"><option value={0}>Seção 1</option>{sections.slice(1).map((_, index) => <option key={index + 1} value={index + 1}>Seção {index + 2}</option>)}</select><select value={citationTargetType} onChange={(event) => { setCitationTargetType(event.target.value as Citation['targetType']); setCitationTargetId(''); }} className="input-control"><option value="AUTHORITY">Authority</option><option value="FACT">Fato</option><option value="EVIDENCE">Prova</option></select><select value={citationTargetId} onChange={(event) => setCitationTargetId(event.target.value)} className="input-control md:col-span-2"><option value="">Selecione a fonte</option>{citationTargets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select><input value={citationText} onChange={(event) => setCitationText(event.target.value)} placeholder="Texto da citação" className="input-control" /></div><div className="flex flex-wrap items-center gap-4"><label className="flex items-center gap-2 text-xs text-stone-700"><input type="checkbox" checked={citationVerified} onChange={(event) => setCitationVerified(event.target.checked)} className="accent-cognac-700" />Conferida por humano</label><button type="button" onClick={addCitation} disabled={!citationTargetId || citationText.trim().length < 3} className="btn-secondary disabled:opacity-50">Adicionar citação</button></div>{citations.length > 0 && <div className="space-y-1">{citations.map((citation, index) => <div key={`${citation.targetId}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs text-stone-700"><span>Seção {citation.sectionOrdinal + 1} · {citation.citationText}</span><span className={citation.verified ? 'text-emerald-700' : 'text-amber-700'}>{citation.verified ? 'Verificada' : 'Pendente'}</span></div>)}</div>}</div>
                <div className="flex flex-wrap gap-3"><button type="submit" disabled={busy || !draftTitle.trim()} className="px-4 py-2.5 rounded-xl bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold"><Plus className="w-4 h-4 inline mr-2" />{selectedDraftId ? 'Salvar nova versão' : 'Criar rascunho'}</button>{selectedDraftId && <><button type="button" onClick={() => void runReview()} disabled={busy} className="px-4 py-2.5 rounded-xl border border-cognac-200 text-cognac-800 text-sm font-semibold">Executar revisão</button><button type="button" onClick={() => void requestApproval()} disabled={busy || !details?.currentVersion} className="px-4 py-2.5 rounded-xl border border-amber-300 text-amber-800 text-sm font-semibold"><Send className="w-4 h-4 inline mr-2" />Encaminhar à aprovação</button></>}</div>
                <p className="text-[11px] text-stone-400">Organize a estrutura e a revisão da peça. A versão atual permanece em rascunho até a conferência humana.</p>
              </form>

                {details && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2"><section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-4"><div className="flex items-center gap-2"><History className="h-5 w-5 text-cognac-700" aria-hidden="true" /><h2 className="font-editorial text-xl font-bold text-stone-900">Histórico de versões</h2></div>{details.versions.map((version) => <div key={version.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-champagne-border bg-[#FDFBF7]"><div><p className="text-sm font-semibold text-stone-800">Versão {version.versionNumber} · {statusLabel[version.status]}</p><p className="text-[11px] text-stone-500">{new Date(version.createdAt).toLocaleString('pt-BR')}</p></div><span className="text-[10px] text-stone-400">Versão registrada</span></div>)}</section><section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-4"><div className="flex items-center justify-between"><div><h2 className="font-editorial text-xl font-bold text-stone-900">Pendências de revisão</h2><p className="text-xs text-stone-500 mt-1">Achados da versão atual</p></div><span className="text-xs text-stone-500">{details.reviewFindings.length}</span></div>{details.reviewFindings.map((finding) => <div key={finding.id} className={`p-3 rounded-xl border ${finding.severity === 'BLOCKING' ? 'border-red-200 bg-red-50' : finding.severity === 'WARNING' ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}><p className="text-xs font-bold text-stone-800">{finding.severity === 'BLOCKING' ? 'Bloqueador' : finding.severity === 'WARNING' ? 'Alerta' : 'Informação'}</p><p className="text-xs text-stone-700 mt-1">{finding.message}</p></div>)}{details.reviewFindings.length === 0 && <p className="text-xs text-stone-500">Execute a revisão para registrar citações, suporte factual e achados adversariais.</p>}</section></div>}
            </>}
          </main>
        </div>
      </div>
    </div>
  );
};
