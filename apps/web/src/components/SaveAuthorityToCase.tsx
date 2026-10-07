import { useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import { useAuth } from '../auth/AuthContext';
import type { SearchResultItem } from '../operations/contracts';

export function SaveAuthorityToCase({ item }: { item: SearchResultItem }) {
  const { status, account } = useAuth();
  const [open, setOpen] = useState(false);
  const identity = `${status}:${account?.user.id ?? ''}:${account?.workspace.id ?? ''}`;
  useEffect(() => { setOpen(false); }, [identity]);
  if (!item.sourceAuthority || !['authenticated', 'legacy'].includes(status)) return null;
  return <>
    <button type="button" className="btn-quiet min-h-9 text-xs" onClick={() => setOpen(true)}>Salvar no caso</button>
    {open && <SaveDialog key={identity} item={item} onClose={() => setOpen(false)} />}
  </>;
}

function SaveDialog({ item, onClose }: { item: SearchResultItem; onClose: () => void }) {
  const label = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [cases, setCases] = useState<Array<{ id: string; title: string }>>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const pending = useRef(false);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { abort.abort(); element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    let active = true;
    setLoading(true); setError('');
    void requestApi<{ items: Array<{ id: string; title: string }> }>('/api/v2/matters?view=active', { signal: abort.signal, cache: 'no-store' })
      .then(response => { if (active) setCases(response.items); })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'Não foi possível carregar seus casos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [attempt]);
  const save = async () => {
    if (!selected || pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await requestApi<{ created: boolean }>(`/api/v2/matters/${encodeURIComponent(selected)}/authorities`, {
        method: 'POST', signal: controller.current.signal, body: JSON.stringify({ authority: item.sourceAuthority }),
      });
      if (!controller.current.signal.aborted) setNotice(result.created ? 'Julgado salvo no caso.' : 'Este julgado já está salvo no caso.');
    } catch (failure) {
      if (!controller.current.signal.aborted) setError(failure instanceof ApiRequestError && failure.status === 409
        ? 'Caso indisponível para edição. Ele pode ter sido arquivado ou movido para a lixeira. Escolha outro caso ativo.'
        : failure instanceof Error ? failure.message : 'Não foi possível salvar. Você pode tentar novamente sem duplicar o julgado.');
    } finally { pending.current = false; if (!controller.current.signal.aborted) setBusy(false); }
  };
  return <dialog ref={dialog} aria-labelledby={label} onCancel={event => { event.preventDefault(); onClose(); }} className="w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-champagne-border bg-white p-6 text-stone-900 shadow-xl backdrop:bg-stone-950/40">
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3"><h2 id={label} className="font-editorial text-xl font-bold">Salvar julgado no caso</h2><button type="button" onClick={onClose} className="btn-quiet text-sm">Fechar</button></div>
      <p className="text-sm break-words">{item.court} · {item.processNumber}</p>
      <p className="text-xs text-stone-600">A fonte e a ementa serão preservadas para consulta e uso nos rascunhos. Salvar não cobra uma nova pesquisa.</p>
      <label className="block text-sm font-semibold">Caso de destino
        <select className="input-control mt-2 w-full" value={selected} disabled={loading || busy} onChange={event => { setSelected(event.target.value); setNotice(''); setError(''); }}>
          <option value="">Selecione um caso ativo</option>
          {cases.map(matter => <option key={matter.id} value={matter.id}>{matter.title}</option>)}
        </select>
      </label>
      {loading && <p role="status" className="text-sm text-stone-500">Carregando casos…</p>}
      {!loading && cases.length === 0 && !error && <p className="text-sm text-stone-600">Crie um caso em Casos para guardar este julgado.</p>}
      {error && <div role="alert" className="text-sm text-amber-800">{error}{cases.length === 0 && <button type="button" className="btn-quiet ml-2" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</button>}</div>}
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      <button type="button" className="btn-primary w-full disabled:opacity-50" disabled={!selected || loading || busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar julgado'}</button>
    </div>
  </dialog>;
}
