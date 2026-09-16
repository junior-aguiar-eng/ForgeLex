import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, FolderOpen, LockKeyhole, Plus, RefreshCw, ShieldCheck } from 'lucide-react';

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
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(body.message ?? `A API respondeu HTTP ${response.status}.`);
  }
  return body;
}

export const MatterWorkspaceScreen: React.FC = () => {
  const [token, setToken] = useState(initialToken);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [title, setTitle] = useState('');
  const [practiceArea, setPracticeArea] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedMatter = useMemo(
    () => matters.find((matter) => matter.id === selectedMatterId) ?? null,
    [matters, selectedMatterId]
  );

  const loadMatters = async () => {
    if (!token) return;
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
        const detail = await request<MatterDetailResponse>(`/api/v2/matters/${nextMatterId}`, token);
        setDocuments(detail.documents);
      } else {
        setDocuments([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os casos.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadMatters();
    // A troca do token deve iniciar uma nova leitura da área de casos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectMatter = async (matterId: string) => {
    setSelectedMatterId(matterId);
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await request<MatterDetailResponse>(`/api/v2/matters/${matterId}`, token);
      setDocuments(detail.documents);
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
    if (!token || !title.trim()) return;
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
      setDocuments([]);
      setNotice('Caso criado e pronto para receber documentos.');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Não foi possível criar o caso.');
    } finally {
      setBusy(false);
    }
  };

  const ingestDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !selectedMatterId || !documentTitle.trim() || !filename.trim() || !content.trim()) return;
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
    <div className="py-10 md:py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cognac-100 border border-cognac-200 text-cognac-800 text-xs font-bold uppercase tracking-wider">
              <FolderOpen className="w-3.5 h-3.5" />
              Área de casos
            </div>
            <h1 className="font-editorial text-4xl font-bold text-stone-950">Matter Workspace</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-stone-600">
              Reúna o contexto do caso e os documentos que sustentam a análise. Cada documento textual recebe versão, hash e âncoras de parágrafo.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 text-xs text-stone-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Isolamento por organização
          </div>
        </div>

        <section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-3">
          <div className="flex items-center gap-2 text-stone-900">
            <LockKeyhole className="w-4 h-4 text-cognac-700" />
            <h2 className="text-sm font-bold">Acesso à área de casos</h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={token}
              onChange={(event) => saveToken(event.target.value)}
              type="password"
              placeholder="Token Bearer da API"
              className="flex-1 px-4 py-2.5 rounded-xl border border-champagne-border bg-[#FDFBF7] text-sm"
            />
            <button type="button" onClick={() => void loadMatters()} disabled={!token || busy} className="px-4 py-2.5 rounded-xl border border-cognac-200 text-cognac-800 text-sm font-semibold disabled:opacity-50">
              <RefreshCw className="w-4 h-4 inline mr-2" />Atualizar
            </button>
          </div>
          <p className="text-[11px] text-stone-500">API configurada em {apiUrl}. O token permanece no navegador e não é enviado para outro destino.</p>
        </section>

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
              <button disabled={!token || busy || title.trim().length < 3} className="w-full px-3 py-2.5 rounded-lg bg-cognac-700 hover:bg-cognac-800 disabled:bg-stone-300 text-white text-sm font-semibold"><Plus className="w-4 h-4 inline mr-1" />Criar caso</button>
            </form>
            <div className="space-y-2">
              {matters.map((matter) => (
                <button key={matter.id} onClick={() => void selectMatter(matter.id)} className={`w-full text-left p-3 rounded-xl border transition-colors ${selectedMatterId === matter.id ? 'border-cognac-400 bg-cognac-50' : 'border-champagne-border hover:border-cognac-300'}`}>
                  <span className="block text-sm font-semibold text-stone-900 truncate">{matter.title}</span>
                  <span className="text-[11px] text-stone-500">{matter.practiceArea || 'Área não informada'} · {matter.status === 'OPEN' ? 'Aberto' : matter.status}</span>
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
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    {['Resumo', 'Documentos', 'Pesquisa', 'Rascunhos'].map((section) => <div key={section} className="p-3 rounded-xl bg-[#FDFBF7] border border-champagne-border"><span className="block text-xs font-semibold text-stone-700">{section}</span><span className="text-[10px] text-stone-400">Em evolução</span></div>)}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center space-y-3"><FolderOpen className="w-10 h-10 mx-auto text-cognac-400" /><h2 className="font-editorial text-xl font-bold text-stone-900">Selecione ou crie um caso</h2><p className="text-sm text-stone-500">O contexto e os documentos aparecerão aqui.</p></div>
              )}
            </section>

            {selectedMatter && <section className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-2"><FileText className="w-5 h-5 text-cognac-700" /><h2 className="font-editorial text-xl font-bold text-stone-900">Documentos do caso</h2><span className="text-xs text-stone-500">{documents.length}</span></div>
              <form onSubmit={ingestDocument} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Título do documento" className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                <input value={filename} onChange={(event) => setFilename(event.target.value)} placeholder="Nome do arquivo (ex.: fatos.txt)" className="px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm" />
                <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Cole o texto do documento para criar a primeira versão e suas âncoras..." rows={5} className="md:col-span-2 px-3 py-2.5 rounded-lg border border-champagne-border bg-[#FDFBF7] text-sm resize-y" />
                <button disabled={!token || busy || !content.trim()} className="md:col-span-2 px-4 py-2.5 rounded-xl bg-cognac-50 hover:bg-cognac-100 border border-cognac-200 disabled:bg-stone-100 text-cognac-800 text-sm font-semibold">Ingerir documento textual</button>
              </form>
              <div className="space-y-2">
                {documents.map((document) => <div key={document.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-xl border border-champagne-border bg-[#FDFBF7]"><div><span className="block text-sm font-semibold text-stone-900">{document.title}</span><span className="text-[11px] text-stone-500">{document.originalFilename} · {document.status === 'INDEXED' ? 'Ancorado' : 'Falhou'}</span></div><span className="text-[10px] text-stone-400 font-mono">SHA-256 {document.contentHash.slice(0, 12)}…</span></div>)}
                {documents.length === 0 && <p className="text-xs text-stone-500">Este caso ainda não possui documentos.</p>}
              </div>
            </section>}
          </main>
        </div>
      </div>
    </div>
  );
};
