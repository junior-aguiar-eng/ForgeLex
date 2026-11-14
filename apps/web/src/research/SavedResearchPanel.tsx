import { useEffect, useRef, useState } from 'react';
import { SAVED_RESEARCH_ENABLED } from '../config/site-capabilities';
import { SAVED_RESEARCH_NOTICE } from '../config/research-copy';
import { savedResearchClient, type SavedSearch, type SavedSearchSummary } from './saved-research-client';
import { DecisionReader } from '../components/DecisionReader';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { SaveAuthorityToCase } from '../components/SaveAuthorityToCase';
import { ApiRequestError } from '../api-client';

export function SavedResearchPanel({
  operationId,
  onResearchAgain,
  caseLink = false,
  pieceMatterId,
  canResearchAgain,
  showNotice = true,
}: {
  /** Falso quando a tela já mostra o mesmo aviso acima, para não repeti-lo. */
  showNotice?: boolean;
  operationId?: string;
  onResearchAgain: (criteria: SavedSearchSummary['criteria']) => void | Promise<void>;
  caseLink?: boolean;
  pieceMatterId?: string;
  canResearchAgain?: (criteria: SavedSearchSummary['criteria']) => boolean;
}) {
  const [items, setItems] = useState<SavedSearchSummary[]>([]);
  const [opened, setOpened] = useState<SavedSearch | null>(null);
  const [removing, setRemoving] = useState<SavedSearchSummary | null>(null);
  const [rerunning, setRerunning] = useState<SavedSearchSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = async () => {
    setItems(await savedResearchClient.list());
  };
  useEffect(() => {
    if (!SAVED_RESEARCH_ENABLED) return;
    let current = true;
    void savedResearchClient
      .list()
      .then((next) => {
        if (current) setItems(next);
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : 'Não foi possível carregar as pesquisas salvas.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);
  const act = async (run: () => Promise<void>, savedAction = true) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (e) {
      if (savedAction && e instanceof ApiRequestError && (e.status === 401 || e.status === 403)) {
        setOpened(null);
        setItems([]);
        setRemoving(null);
        setRerunning(null);
      }
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  if (!SAVED_RESEARCH_ENABLED) return null;
  const saved = items.some((item) => item.operationId === operationId);
  return (
    <section className="surface p-4 sm:p-6 space-y-4" aria-label="Pesquisas salvas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-editorial text-xl font-bold">Pesquisas salvas — {items.length} de 6</h2>
        {operationId && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || loading || saved}
            onClick={() =>
              void act(async () => {
                await savedResearchClient.save(operationId);
                await refresh();
              })
            }
          >
            {saved ? 'Pesquisa salva' : 'Salvar pesquisa'}
          </button>
        )}
      </div>
      {showNotice && <p className="text-xs leading-relaxed text-stone-600">{SAVED_RESEARCH_NOTICE}</p>}
      {loading ? (
        <p role="status">Carregando pesquisas salvas…</p>
      ) : (
        items.length === 0 && <p>Nenhuma pesquisa salva. Salve os resultados que quiser conservar.</p>
      )}
      {items.length === 6 && !saved && operationId && (
        <p role="status">Você já tem 6 pesquisas salvas. Exclua uma para salvar esta.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-800">
          {error}{' '}
          <button type="button" disabled={busy} onClick={() => void act(refresh)}>
            Tentar novamente
          </button>
        </p>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-stone-200 p-4 min-w-0 break-words">
            <h3 className="font-semibold">{item.criteria.query}</h3>
            <p className="text-xs text-stone-600">
              {item.criteria.court ?? 'Tribunais disponíveis'} · {item.criteria.judgmentYear ?? 'Todos os anos'} · Até{' '}
              {item.criteria.limit} resultados · {item.resultCount} encontrados
            </p>
            <p className="text-xs text-stone-600">Pesquisa de {new Date(item.searchedAt).toLocaleString('pt-BR')}</p>
            {canResearchAgain?.(item.criteria) === false && (
              <p className="text-xs text-stone-600">Tribunal indisponível para novas pesquisas.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    setOpened(null);
                    setOpened(await savedResearchClient.get(item.id));
                  })
                }
              >
                Abrir
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy || canResearchAgain?.(item.criteria) === false}
                onClick={() => setRerunning(item)}
              >
                Pesquisar novamente
              </button>
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => setRemoving(item)}>
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
      {opened && (
        <div className="space-y-2">
          <button type="button" className="btn-secondary" onClick={() => setOpened(null)}>
            Fechar pesquisa salva
          </button>
          <DecisionReader
            key={opened.id}
            entries={opened.entries}
            searchedAt={opened.searchedAt}
            actions={caseLink ? (item) => <SaveAuthorityToCase item={item} pieceMatterId={pieceMatterId} /> : undefined}
          />
        </div>
      )}
      {removing && (
        <ConfirmationDialog
          open
          title="Excluir pesquisa salva"
          description={`Excluir “${removing.criteria.query}” (${removing.criteria.court ?? 'Tribunais disponíveis'})? Os resultados conservados serão removidos. Uma nova pesquisa será cobrada normalmente.`}
          confirmLabel="Excluir pesquisa"
          busy={busy}
          onCancel={() => {
            if (!busy) setRemoving(null);
          }}
          onConfirm={() =>
            void act(async () => {
              await savedResearchClient.delete(removing.id);
              if (opened?.id === removing.id) setOpened(null);
              setRemoving(null);
              await refresh();
            })
          }
        />
      )}
      {rerunning && (
        <ConfirmationDialog
          open
          title="Pesquisar novamente"
          description={`Executar uma nova pesquisa sobre “${rerunning.criteria.query}”? A nova pesquisa será cobrada normalmente. Os resultados salvos continuam conservados.`}
          confirmLabel="Executar nova pesquisa"
          busy={busy}
          onCancel={() => {
            if (!busy) setRerunning(null);
          }}
          onConfirm={() =>
            void act(async () => {
              await onResearchAgain(rerunning.criteria);
              setRerunning(null);
            }, false)
          }
        />
      )}
    </section>
  );
}
