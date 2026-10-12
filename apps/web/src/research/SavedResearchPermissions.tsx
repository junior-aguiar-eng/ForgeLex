import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../api-client';
import { SAVED_RESEARCH_ENABLED } from '../config/site-capabilities';
interface Application { clientId: string; displayName: string; grantedAt: string; enabled: boolean }
export function SavedResearchPermissions() {
  const [items, setItems] = useState<Application[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = async () => { setLoading(true); setError(''); try { setItems((await requestApi<{ items: Application[] }>('/api/v2/research/saved/permissions', {}, { sessionOnly: true })).items); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { if (SAVED_RESEARCH_ENABLED) void load(); }, []);
  if (!SAVED_RESEARCH_ENABLED) return null;
  const change = async (item: Application, enabled: boolean) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await requestApi('/api/v2/research/saved/permissions', { method: 'PUT', body: JSON.stringify({ clientId: item.clientId, grantedAt: item.grantedAt, enabled }) }, { sessionOnly: true }); setItems(current => current.map(app => app.clientId === item.clientId && app.grantedAt === item.grantedAt ? { ...app, enabled } : app)); }
    catch (e) { setError((e as Error).message); } finally { lock.current = false; setBusy(false); }
  };
  return <section className="surface p-6 space-y-4" aria-label="Permissão para pesquisas salvas"><h2 className="font-editorial text-xl font-bold">Gerenciar pesquisas salvas</h2><p className="text-sm text-stone-600">Escolha os aplicativos conectados que podem listar, abrir e salvar pesquisas. A exclusão exige sua confirmação no leitor. Esta permissão não dá acesso às suas conversas ou aos casos.</p>{loading && <p role="status">Consultando aplicativos…</p>}{error && <p role="alert">{error}</p>}{!loading && items.length === 0 && !error && <p>Nenhum aplicativo conectado.</p>}{items.map(item => <label key={`${item.clientId}:${item.grantedAt}`} className="flex items-center gap-3 border-t border-stone-200 pt-4"><input type="checkbox" checked={item.enabled} disabled={busy || loading} onChange={event => void change(item, event.target.checked)} /><span>{item.displayName} — Gerenciar pesquisas salvas</span></label>)}<button type="button" className="btn-secondary" disabled={busy || loading} onClick={() => void load()}>Atualizar aplicativos</button></section>;
}
