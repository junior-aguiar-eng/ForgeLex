import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, History, LockKeyhole, Plus, RefreshCw, Send, ShieldAlert } from 'lucide-react';

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
  currentVersion?: { version: DraftVersion; sections: DraftSection[] };
  versions: DraftVersion[];
  reviewFindings: ReviewFinding[];
}

interface DraftWriteResponse {
  draft: Draft;
  version: DraftVersion;
  sections: DraftSection[];
}

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
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `A API respondeu com status ${response.status}.`);
  return body as T;
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
  const [token, setToken] = useState(initialToken);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState('');
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [details, setDetails] = useState<DraftDetails | null>(null);
  const [draftTitle, setDraftTitle] = useState('Minuta para revisão humana');
  const [sections, setSections] = useState([
    { title: 'Síntese dos fatos', content: '' },
    { title: 'Questões jurídicas', content: '' },
    { title: 'Fundamentação a revisar', content: '' },
    { title: 'Pedidos e providências', content: '' },
  ]);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [approvalToken, setApprovalToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!token) return;
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

  const selectMatter = async (matterId: string) => {
    setSelectedMatterId(matterId);
    setSelectedDraftId('');
    setDetails(null);
    setError(null);
    try {
      await loadDrafts(matterId);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os rascunhos.');
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
        setSections(response.currentVersion.sections.map((section) => ({ title: section.title, content: section.content })));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a minuta.');
    } finally {
      setBusy(false);
    }
  };

  const payload = () => ({
    title: draftTitle,
    sections: sections.map((section, ordinal) => ({ ordinal, title: section.title, content: section.content })),
    citations: [],
  });

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
          <summary>Acesso técnico da sessão</summary>
          <div className="technical-access__content space-y-3 pt-3">
            <div className="flex items-center gap-2 text-stone-900"><LockKeyhole className="h-4 w-4 text-cognac-700" aria-hidden="true" /><h2 className="text-sm font-bold">Conexão com a área de rascunhos</h2></div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="draft-api-token">Credencial da API</label>
              <input id="draft-api-token" value={token} onChange={(event) => saveToken(event.target.value)} type="password" placeholder="Credencial da API" className="input-control flex-1" />
              <button type="button" onClick={() => void loadMatters()} disabled={!token || busy} className="btn-secondary disabled:opacity-50"><RefreshCw className="h-4 w-4" aria-hidden="true" />Atualizar casos</button>
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
              <form onSubmit={saveDraft} className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700">{selectedDraftId ? 'Nova versão' : 'Novo rascunho'}</span><h2 className="font-editorial text-2xl font-bold text-stone-900 mt-1">{selectedMatter.title}</h2></div><span className="text-xs text-stone-500">{selectedDraftId && details ? `Versão ${details.currentVersion?.version.versionNumber ?? '-'}` : 'Outline inicial'}</span></div>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Título do rascunho" className="w-full px-4 py-3 rounded-xl border border-champagne-border bg-[#FDFBF7] text-sm" />
                <div className="space-y-3">{sections.map((section, index) => <div key={`${section.title}-${index}`} className="rounded-xl border border-champagne-border bg-[#FDFBF7] p-4 space-y-2"><div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-cognac-100 text-cognac-800 text-xs font-bold flex items-center justify-center">{index + 1}</span><input value={section.title} onChange={(event) => setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} className="flex-1 bg-transparent text-sm font-semibold text-stone-900 border-b border-transparent focus:border-cognac-300 focus:outline-none" /></div><textarea value={section.content} onChange={(event) => setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))} rows={3} placeholder="Conteúdo da seção para conferência..." className="w-full px-3 py-2 rounded-lg border border-champagne-border bg-white text-sm resize-y" /></div>)}</div>
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
