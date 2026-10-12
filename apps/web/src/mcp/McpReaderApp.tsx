import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import { DecisionReader, type ReaderEntry } from '../components/DecisionReader';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { SAVED_RESEARCH_NOTICE } from '../config/research-copy';
import type { SavedSearchSummary } from '../research/saved-research-client';
import type { SearchResultItem } from '../operations/contracts';
import './mcp-reader.css';

interface Presentation { kind: 'forgelex.decisions.v1'; decisions: { decision?: Record<string, unknown>; availability: string }[]; operationId?: string; savedResearchId?: string; searchedAt?: string; canSave: boolean; savedResearchEnabled: boolean }
function mapDecision(item: Record<string, any>): SearchResultItem {
  return { id: item.id, versionId: item.versionId, court: item.court, processNumber: item.processNumber, relator: item.rapporteur,
    chamber: item.chamber, judgmentDate: item.judgmentDate, publicationDate: item.publicationDate, ementa: item.syllabus,
    sourceUrl: item.fullTextUrl ?? item.provenance?.source?.sourceUrl ?? '', fullTextUrl: item.fullTextUrl,
    sourceProvider: '', dedupeKey: '', isBinding: false, verificationStatus: item.provenance?.verified ? item.provenance?.verificationMethod === 'OFFICIAL_SOURCE_HASH' ? 'VERIFIED_OFFICIAL' : 'VERIFIED_PROVIDER' : 'UNVERIFIED' };
}
function presentation(value: unknown): Presentation {
  if (!value || typeof value !== 'object' || (value as Presentation).kind !== 'forgelex.decisions.v1' || !Array.isArray((value as Presentation).decisions)) throw new Error('Os resultados do leitor não estão disponíveis.');
  return value as Presentation;
}
function ReaderApp() {
  const bridge = useRef<App>();
  const lock = useRef(false);
  const received = useRef(false);
  const [data, setData] = useState<Presentation>();
  const [entries, setEntries] = useState<ReaderEntry[]>([]);
  const [items, setItems] = useState<SavedSearchSummary[]>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [expandable, setExpandable] = useState(false);
  const [collectionEnabled, setCollectionEnabled] = useState(false);
  const [removing, setRemoving] = useState<SavedSearchSummary>();
  const apply = (value: unknown) => {
    const next = presentation(value); received.current = true; setData(next); setCollectionEnabled(next.savedResearchEnabled); setError('');
    setEntries(next.decisions.map(entry => ({ decision: entry.decision ? mapDecision(entry.decision) : undefined, unavailable: entry.availability !== 'AVAILABLE' })));
  };
  useEffect(() => {
    const app = new App({ name: 'ForgeLex · Decisões', version: '1.0.0' }, {});
    bridge.current = app;
    let resultTimeout: ReturnType<typeof setTimeout>;
    app.ontoolresult = result => { if (result.isError) { setError('Não foi possível abrir os resultados. Use a resposta em texto.'); return; } try { apply(result.structuredContent); } catch (e) { setError((e as Error).message); } };
    const context = () => { const current = app.getHostContext(); if (current?.theme) document.documentElement.dataset.theme = current.theme; setExpandable(Boolean(current?.availableDisplayModes?.includes('fullscreen'))); };
    app.onhostcontextchanged = context;
    void app.connect(undefined, { timeout: 10000 }).then(() => { context(); setReady(Boolean(app.getHostCapabilities()?.serverTools)); resultTimeout = setTimeout(() => { if (!received.current) setError('O aplicativo não enviou os resultados ao leitor. Consulte a resposta em texto ou abra novamente a pesquisa salva.'); }, 10000); }).catch(() => setError('O aplicativo não disponibilizou o leitor interativo. As decisões continuam disponíveis na resposta em texto.'));
    return () => { clearTimeout(resultTimeout); void app.close(); };
  }, []);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await bridge.current!.callServerTool({ name, arguments: args });
    if (result.isError) {
      let message = 'Não foi possível concluir a ação. Nenhuma nova pesquisa foi executada.';
      const block = result.content?.find(block => block.type === 'text');
      if (block?.type === 'text') try { const detail = JSON.parse(block.text); message = detail.error?.message || message; } catch { /* Keep the safe fallback. */ }
      throw new Error(message);
    }
    return result.structuredContent;
  };
  const act = async (run: () => Promise<void>) => { if (lock.current || !ready) return; lock.current = true; setBusy(true); setError(''); setNotice(''); try { await run(); } catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); } };
  const refresh = async () => { const result = await call('research.list_saved_searches', {}) as { items: SavedSearchSummary[] }; setItems(result.items); };
  return <main className="mcp-shell">
    {data ? <DecisionReader entries={entries} searchedAt={data.savedResearchId ? data.searchedAt : undefined} onOpenSource={async url => { const result = await bridge.current!.openLink({ url }); if (result.isError) throw new Error('SOURCE_OPEN_FAILED'); }} onExpand={expandable ? () => void bridge.current?.requestDisplayMode({ mode: 'fullscreen' }).catch(() => setError('A expansão não está disponível neste aplicativo.')) : undefined} /> : !error && <p role="status">{received.current ? 'Nenhuma pesquisa aberta. Abra outra pesquisa salva quando quiser.' : 'Carregando os resultados da pesquisa…'}</p>}
    <p className="mcp-note">As decisões são fontes retornadas pelo ForgeLex. A explicação da conversa é produzida pelo ChatGPT ou Claude.</p>
    {collectionEnabled && <div className="mcp-actions">
      {data?.operationId && !data.savedResearchId && <button disabled={!ready || busy || !data.canSave} onClick={() => void act(async () => { await call('research.save_search', { operationId: data.operationId!, requestedByUser: true }); setNotice('Pesquisa completa salva.'); await refresh(); })}>Salvar pesquisa</button>}
      {ready && <button disabled={busy} onClick={() => void act(refresh)}>Pesquisas salvas{items ? ` — ${items.length} de 6` : ''}</button>}
      {data?.operationId && !data.savedResearchId && !data.canSave && <p>Para salvar, autorize “Gerenciar pesquisas salvas” nas conexões do site.</p>}
    </div>}
    {items && <ul>{items.map(item => <li key={item.id}><strong>{item.criteria.query}</strong><p>{item.criteria.court} · {item.criteria.judgmentYear ?? 'Todos os anos'} · {item.resultCount} resultados · Pesquisa de {new Date(item.searchedAt).toLocaleString('pt-BR')}</p><div className="mcp-actions"><button disabled={busy} onClick={() => void act(async () => apply(await call('research.get_saved_search', { id: item.id })))}>Abrir</button><button disabled={busy} onClick={() => setRemoving(item)}>Excluir</button></div></li>)}</ul>}
    {collectionEnabled && <p className="mcp-note">{SAVED_RESEARCH_NOTICE}</p>}{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {removing && <ConfirmationDialog open title="Excluir pesquisa salva" description={`Excluir “${removing.criteria.query}” (${removing.criteria.court ?? 'Tribunais disponíveis'})? Nenhuma outra pesquisa será substituída.`} confirmLabel="Excluir pesquisa" busy={busy} onCancel={() => { if (!busy) setRemoving(undefined); }} onConfirm={() => void act(async () => { await call('research.delete_saved_search', { id: removing.id, confirmed: true }); if (data?.savedResearchId === removing.id) { setData(undefined); setEntries([]); } setRemoving(undefined); await refresh(); })} />}
  </main>;
}
createRoot(document.getElementById('forgelex-reader')!).render(<ReaderApp />);
