import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../../api-client';
import {
  accessError,
  emptySelection,
  Grant,
  initialInstruction,
  Kind,
  labels,
  Material,
  revocationNotice,
  selectedMaterial,
  Selection,
  selectionCount,
  toggleMaterial,
} from './case-ai-model';
type Application = { clientId: string; displayName: string; grantedAt: string };
type Page = { items: Material[]; nextCursor?: string };
type Preview = Page & { counts: Record<Kind, number> };
const kinds = Object.keys(labels) as Kind[];
const button = 'rounded-lg border border-stone-300 px-3 py-2 text-sm disabled:opacity-50';
const primary = button + ' bg-cognac-700 text-white border-cognac-700';
export function CaseAiAccessPanel({
  matterId,
  matterTitle,
  onClose,
}: {
  matterId: string;
  matterTitle: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const live = useRef(true);
  const writing = useRef(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [platform, setPlatform] = useState('');
  const [clientId, setClientId] = useState('');
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [catalog, setCatalog] = useState<Partial<Record<Kind, Page>>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const base = `/api/v2/matters/${matterId}/ai-access`;
  const api = <T,>(path: string, init?: RequestInit) => requestApi<T>(path, init, { sessionOnly: true });
  const post = (body: unknown, method = 'POST') => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const current = grants.find((g) => g.oauthClientId === clientId);
  const application = apps.find((a) => a.clientId === clientId);
  const connectedGrant = current?.status === 'ACTIVE' && current.oauthGrantedAt === application?.grantedAt;
  const selectionSaved = connectedGrant && JSON.stringify(current.selection) === JSON.stringify(selection);
  const changeSelection = (s: Selection) => {
    setSelection(s);
    setPreview(null);
    setNotice('');
  };
  async function run(fn: () => Promise<void>, write = false) {
    if (writing.current || busy) return;
    writing.current = write;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      if (live.current) {
        const code = e instanceof ApiRequestError ? e.code : '';
        setError(accessError(code));
        if (code === 'CASE_ACCESS_CONFLICT') setConflict(true);
      }
    } finally {
      writing.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function refresh() {
    const [a, g] = await Promise.all([api<Application[]>('/api/v2/mcp/authorized-applications'), api<Grant[]>(base)]);
    if (live.current) {
      setApps(a);
      setGrants(g);
      setConflict(false);
    }
  }
  useEffect(() => {
    live.current = true;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    let cancelled = false;
    setBusy(true);
    void Promise.all([api<Application[]>('/api/v2/mcp/authorized-applications'), api<Grant[]>(base)])
      .then(([a, g]) => {
        if (!cancelled) {
          setApps(a);
          setGrants(g);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(accessError(e instanceof ApiRequestError ? e.code : ''));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      live.current = false;
      previous?.focus();
    };
    // Each case mounts a separate panel; requests cannot update its successor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);
  async function loadKind(kind: Kind, more = false) {
    await run(async () => {
      const cursor = more ? catalog[kind]?.nextCursor : undefined;
      const p = await api<Page>(
        `${base}/materials?kind=${kind}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      if (live.current)
        setCatalog((c) => ({
          ...c,
          [kind]: { ...p, items: more ? [...(c[kind]?.items ?? []), ...p.items] : p.items },
        }));
    });
  }
  async function viewPreview(more = false) {
    await run(async () => {
      const p = await api<Preview>(
        base + '/preview',
        post({ selection, limit: 20, ...(more ? { cursor: preview?.nextCursor } : {}) }),
      );
      if (live.current) setPreview((old) => ({ ...p, items: more ? [...(old?.items ?? []), ...p.items] : p.items }));
    });
  }
  function chooseApp(id: string) {
    setClientId(id);
    const g = grants.find((g) => g.oauthClientId === id);
    changeSelection(g?.status === 'ACTIVE' ? g.selection : emptySelection());
    setConflict(false);
    setConfirmRevoke(false);
  }
  async function allow() {
    await run(async () => {
      const g = await api<Grant>(
        base,
        post({ oauthClientId: clientId, expectedRevision: current?.revision ?? 0, selection }, 'PUT'),
      );
      if (live.current) {
        setGrants((old) => [...old.filter((x) => x.oauthClientId !== g.oauthClientId), g]);
        setSelection(g.selection);
        setNotice('Acesso permitido para esta conexão e estes materiais.');
      }
    }, true);
  }
  async function revoke(g: Grant) {
    await run(async () => {
      const result = await api<Grant>(`${base}/${g.id}/revoke`, post({ expectedRevision: g.revision }));
      if (live.current) {
        setGrants((old) => old.map((x) => (x.id === g.id ? result : x)));
        setConfirmRevoke(false);
        setNotice(revocationNotice);
      }
    }, true);
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="case-ai-title"
      onCancel={(e) => {
        if (writing.current) e.preventDefault();
        else onClose();
      }}
      className="w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] rounded-2xl p-0 backdrop:bg-black/40 text-stone-900"
    >
      <div className="p-5 sm:p-7 space-y-5 break-words">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 id="case-ai-title" className="font-editorial text-xl font-bold">
              Usar este caso na IA
            </h2>
            <p className="text-sm mt-1">{matterTitle}</p>
          </div>
          <button autoFocus type="button" className={button} disabled={busy && writing.current} onClick={onClose}>
            Fechar
          </button>
        </header>
        <p className="text-sm text-stone-600">
          Escolha o material que sua IA poderá consultar. Ler o material salvo é gratuito. Uma nova pesquisa de
          jurisprudência mantém a cobrança habitual.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-emerald-800">
            {notice}
          </p>
        )}
        <section className="space-y-3">
          <h3 className="font-semibold">1. Escolha sua conexão</h3>
          <label className="block text-sm">
            Onde você vai usar?
            <select
              disabled={busy}
              className="block border rounded-lg p-2 w-full mt-1"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            >
              <option value="">Escolha</option>
              <option>ChatGPT</option>
              <option>Claude</option>
            </select>
          </label>
          <label className="block text-sm">
            Aplicativo autorizado
            <select
              disabled={busy || !platform}
              className="block border rounded-lg p-2 w-full mt-1"
              value={clientId}
              onChange={(e) => chooseApp(e.target.value)}
            >
              <option value="">Escolha a conexão</option>
              {apps.map((a) => (
                <option key={a.clientId} value={a.clientId}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-stone-500">
            O nome acima é informado pelo aplicativo. Confira a conexão que você autorizou na sua conta.
          </p>
          {!apps.length && !busy && (
            <p className="text-sm">
              Nenhuma conexão disponível.{' '}
              <a className="underline" href="/app/conectar" target="_blank" rel="noopener noreferrer">
                Configurar conexão em outra aba
              </a>
              . Depois, volte a este caso.
            </p>
          )}
          <button type="button" className={button} disabled={busy} onClick={() => void run(refresh)}>
            Atualizar permissões
          </button>
        </section>
        <section className="space-y-3">
          <h3 className="font-semibold">2. Selecione o material</h3>
          <fieldset disabled={busy || !clientId} className="space-y-2">
            <legend className="sr-only">Material compartilhado</legend>
            {kinds.map((kind) => (
              <details
                key={kind}
                className="border border-stone-200 rounded-lg p-3"
                onToggle={(e) => {
                  if (e.currentTarget.open && !catalog[kind] && !busy) void loadKind(kind);
                }}
              >
                <summary className="cursor-pointer text-sm font-medium">{labels[kind]}</summary>
                <div className="mt-3 space-y-3">
                  {!catalog[kind] ? (
                    <button type="button" className={button} onClick={() => void loadKind(kind)}>
                      Carregar {labels[kind].toLowerCase()}
                    </button>
                  ) : catalog[kind]!.items.length === 0 ? (
                    <p className="text-sm text-stone-500">Nenhum item cadastrado.</p>
                  ) : (
                    catalog[kind]!.items.map((m) => (
                      <label key={m.id} className="flex gap-3 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={selectedMaterial(selection, m)}
                          onChange={(e) => changeSelection(toggleMaterial(selection, m, e.target.checked))}
                        />
                        <span>
                          {m.title}
                          {kind === 'DOCUMENT' && (
                            <span className="block text-xs text-stone-500">
                              Versão atual {m.versionNumber}.{' '}
                              {selection.documents.some((d) => d.documentId === m.id && d.versionId !== m.versionId)
                                ? 'Uma versão anterior está selecionada. Confira a prévia; desmarque e selecione novamente para trocar.'
                                : 'A versão escolhida permanece fixa até você alterar a seleção.'}
                            </span>
                          )}
                        </span>
                      </label>
                    ))
                  )}
                  {catalog[kind]?.nextCursor && (
                    <button type="button" className={button} onClick={() => void loadKind(kind, true)}>
                      Carregar mais {labels[kind].toLowerCase()}
                    </button>
                  )}
                </div>
              </details>
            ))}
          </fieldset>
          <p className="text-sm">{selectionCount(selection)} item(ns) selecionado(s).</p>
          <p className="text-xs text-stone-500">
            Alterações em fatos, provas, teses e fontes selecionados podem aparecer nas novas consultas. Documentos
            permanecem na versão escolhida.
          </p>
          <button
            type="button"
            className={button}
            disabled={busy || !clientId || !selectionCount(selection)}
            onClick={() => void viewPreview()}
          >
            Ver prévia
          </button>
        </section>
        {preview && (
          <section className="space-y-3 border-t pt-4" aria-label="Prévia do material">
            <h3 className="font-semibold">O que esta conexão poderá consultar</h3>
            <p className="text-xs">
              {kinds
                .filter((k) => preview.counts[k])
                .map((k) => `${labels[k]}: ${preview.counts[k]}`)
                .join(' · ')}
            </p>
            {preview.items.map((m) => (
              <article key={`${m.kind}-${m.id}`} className="text-sm">
                <h4 className="font-semibold">{m.title}</h4>
                {m.versionId && <p className="text-xs text-stone-500">Versão selecionada: {m.versionNumber}</p>}
                <p className="whitespace-pre-wrap">{m.preview}</p>
              </article>
            ))}
            {preview.nextCursor && (
              <button type="button" className={button} disabled={busy} onClick={() => void viewPreview(true)}>
                Ver mais da prévia
              </button>
            )}
            <button
              type="button"
              className={primary}
              disabled={busy || conflict || !!preview.nextCursor || !clientId}
              onClick={() => void allow()}
            >
              Permitir acesso
            </button>
          </section>
        )}
        {selectionSaved && (
          <button
            type="button"
            className={primary}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(
                  initialInstruction(
                    matterTitle,
                    `${window.location.origin}/app/casos?caso=${encodeURIComponent(matterId)}`,
                  ),
                );
                if (live.current) setNotice('Instrução copiada. Cole na conversa da sua IA.');
              })
            }
          >
            Copiar instrução
          </button>
        )}
        <section className="border-t pt-4 space-y-3" aria-label="Permissões da IA">
          <h3 className="font-semibold">Permissões da IA</h3>
          {grants.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhuma permissão concedida neste caso.</p>
          ) : (
            grants.map((g) => (
              <div key={g.id} className="text-sm border rounded-lg p-3 space-y-2">
                <p>
                  {apps.find((a) => a.clientId === g.oauthClientId)?.displayName ?? 'Conexão anterior'} —{' '}
                  {g.status === 'REVOKED'
                    ? 'Acesso revogado'
                    : apps.some((a) => a.clientId === g.oauthClientId && a.grantedAt === g.oauthGrantedAt)
                      ? 'Acesso permitido'
                      : 'Conexão indisponível; autorize novamente para consultar'}
                </p>
                {g.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      chooseApp(g.oauthClientId);
                      setConfirmRevoke(true);
                    }}
                  >
                    Revogar acesso
                  </button>
                )}
              </div>
            ))
          )}
          {confirmRevoke && current && (
            <div className="rounded-lg bg-amber-50 p-3 space-y-2">
              <p className="text-sm">
                Bloquear novas consultas desta conexão a este caso? O material já recebido pelo aplicativo permanece com
                ele.
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={button} disabled={busy} onClick={() => void revoke(current)}>
                  Confirmar revogação
                </button>
                <button type="button" className={button} disabled={busy} onClick={() => setConfirmRevoke(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </section>
        {busy && (
          <p role="status" className="text-sm text-stone-500">
            Aguarde…
          </p>
        )}
      </div>
    </dialog>
  );
}
