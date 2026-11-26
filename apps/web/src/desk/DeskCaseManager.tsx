import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import { useAuth } from '../auth/AuthContext';
import { CaseAiAccessPanel } from '../screens/case-ai/CaseAiAccessPanel';
import { LifecycleDialog, LifecycleFilter } from '../screens/matter-lifecycle/LifecycleControls';
import {
  actionLabels,
  canManageLifecycle,
  type LifecycleAction,
  type LifecycleView,
} from '../screens/matter-lifecycle/lifecycle-model';
import {
  activeCaseOptions,
  caseTitleProblem,
  deskLifecycleActions,
  lifecycleNotice,
  type ManagedCase,
} from './case-manager-model';

const stateLabel = { ACTIVE: 'Ativo', ARCHIVED: 'Arquivado', TRASHED: 'Na lixeira', PURGED: 'Excluído' } as const;
const failureText = (failure: unknown, fallback: string) => (failure instanceof Error ? failure.message : fallback);

/**
 * Gerenciar casos, dentro da Mesa (tema gelo): renomear, arquivar, mover para a lixeira, restaurar e excluir de vez
 * (esta pede o nome do caso) e o acesso da IA conectada ao caso. É o único lugar onde se cuida dos casos (trava de
 * produto, 19/11: não há tela Casos). O caso que a conversa ou a peça está usando agora não pode ser arquivado nem ir para a lixeira, mas pode
 * ser renomeado.
 */
export function DeskCaseManager({
  inUse,
  onClose,
  onChanged,
}: {
  /** Caso fixo na conversa ou na peça aberta, que não sai de uso enquanto estiver assim. */
  inUse?: string;
  onClose: () => void;
  /** Lista de casos ativos depois de cada mudança, para o seletor da Mesa acompanhar. */
  onChanged: (active: Array<{ id: string; title: string }>) => void;
}) {
  const { status, account } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<LifecycleView>('active');
  const [items, setItems] = useState<ManagedCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [confirming, setConfirming] = useState<{ record: ManagedCase; action: LifecycleAction } | null>(null);
  const [confirmError, setConfirmError] = useState('');
  const [aiAccess, setAiAccess] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const load = useCallback(async (next: LifecycleView) => {
    setLoading(true);
    setError('');
    try {
      const response = await requestApi<{ items: ManagedCase[] }>(
        `/api/v2/matters?view=${next}`,
        {},
        { sessionOnly: true },
      );
      setItems(response.items);
    } catch (failure) {
      setItems([]);
      setError(failureText(failure, 'Não foi possível carregar os casos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(view);
  }, [load, view]);

  /** Depois de uma mudança: recarrega a lista aberta e avisa o seletor da Mesa com os casos ativos. */
  const refresh = async () => {
    await load(view);
    try {
      const active = await requestApi<{ items: ManagedCase[] }>(
        '/api/v2/matters?view=active',
        {},
        { sessionOnly: true },
      );
      onChanged(activeCaseOptions(active.items));
    } catch {
      /* o seletor se atualiza na próxima carga; a lista do diálogo já mostra o resultado */
    }
  };

  const rename = async () => {
    if (!editing || busy) return;
    const problem = caseTitleProblem(editing.title);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await requestApi(
        `/api/v2/matters/${encodeURIComponent(editing.id)}`,
        { method: 'PATCH', body: JSON.stringify({ title: editing.title.trim() }) },
        { sessionOnly: true },
      );
      setEditing(null);
      setNotice('Nome do caso atualizado.');
      await refresh();
    } catch (failure) {
      setError(failureText(failure, 'Não foi possível renomear o caso.'));
    } finally {
      setBusy(false);
    }
  };

  const runLifecycle = async (confirmation?: string) => {
    if (!confirming || busy) return;
    const { record, action } = confirming;
    setBusy(true);
    setConfirmError('');
    try {
      await requestApi(
        `/api/v2/matters/${encodeURIComponent(record.id)}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedLifecycleRevision: record.lifecycleRevision ?? 0,
            ...(action === 'purge' ? { confirmation } : {}),
          }),
        },
        { sessionOnly: true },
      );
      setConfirming(null);
      setNotice(lifecycleNotice(action));
      await refresh();
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.code === 'PURGE_CONFIRMATION_PENDING') {
        setConfirming(null);
        setNotice(
          'A exclusão está sendo confirmada. Reabra a lista em instantes: se não concluir, o caso fica preservado.',
        );
        await refresh();
        return;
      }
      setConfirmError(failureText(failure, 'Não foi possível concluir a operação.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <dialog
        ref={dialog}
        aria-labelledby="desk-case-manager-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy && !confirming) onClose();
        }}
        className="w-[min(94vw,640px)] max-h-[88vh] overflow-y-auto rounded-2xl border border-line bg-surface p-6 text-ink shadow-xl backdrop:bg-black/35"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="desk-case-manager-title" className="font-editorial text-xl font-semibold">
            Gerenciar casos
          </h2>
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary min-h-9 px-3 text-sm">
            Fechar
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 text-sm text-muted">
          <LifecycleFilter label="Mostrar casos" value={view} onChange={setView} disabled={busy || loading} />
        </div>
        {notice && (
          <p role="status" className="mt-3 rounded-lg bg-accent-soft p-3 text-sm text-ink-soft">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        {loading ? (
          <p className="mt-4 text-sm text-muted">Carregando casos…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nenhum caso nesta lista.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {items.map((item) => {
              const state = item.lifecycleState ?? 'ACTIVE';
              const canManage = canManageLifecycle(status, account?.user.id, account?.membership.role, item.createdBy);
              const isEditing = editing?.id === item.id;
              const using = item.id === inUse;
              const actions = canManage && !using ? deskLifecycleActions(item) : [];
              return (
                <li key={item.id} className="rounded-xl border border-line bg-surface-muted p-3">
                  {isEditing ? (
                    <form
                      aria-label={`Renomear ${item.title}`}
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void rename();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.stopPropagation();
                          setEditing(null);
                          setError('');
                        }
                      }}
                    >
                      <label className="min-w-0 flex-1 text-sm">
                        <span className="sr-only">Novo nome do caso</span>
                        <input
                          autoFocus
                          value={editing.title}
                          maxLength={200}
                          disabled={busy}
                          onChange={(event) => setEditing({ id: item.id, title: event.target.value })}
                          className="min-h-9 w-full rounded-[var(--fl-radius-control)] border border-line-control bg-surface px-2 text-sm text-ink"
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={busy || !editing.title.trim()}
                        className="min-h-9 rounded-[var(--fl-radius-control)] bg-accent px-3 text-sm font-semibold text-surface hover:bg-accent-strong disabled:opacity-50"
                      >
                        Salvar nome
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(null);
                          setError('');
                        }}
                        className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-muted hover:bg-canvas-deep"
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-ink">{item.title}</p>
                        <p className="text-xs text-subtle">
                          {using ? 'Em uso nesta conversa ou peça' : stateLabel[state]}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {canManage && (
                          <>
                            {state === 'ACTIVE' && (
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={`Renomear ${item.title}`}
                                onClick={() => {
                                  setError('');
                                  setNotice('');
                                  setEditing({ id: item.id, title: item.title });
                                }}
                                className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-accent hover:bg-canvas-deep disabled:opacity-50"
                              >
                                Renomear
                              </button>
                            )}
                            {state === 'ACTIVE' && (
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={`Acesso da IA: ${item.title}`}
                                onClick={() => setAiAccess({ id: item.id, title: item.title })}
                                className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-accent hover:bg-canvas-deep disabled:opacity-50"
                              >
                                Acesso da IA
                              </button>
                            )}
                            {actions.map((action) => (
                              <button
                                key={action}
                                type="button"
                                disabled={busy}
                                aria-label={`${actionLabels[action]}: ${item.title}`}
                                onClick={() => {
                                  setConfirmError('');
                                  setConfirming({ record: item, action });
                                }}
                                className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-accent hover:bg-canvas-deep disabled:opacity-50"
                              >
                                {actionLabels[action]}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </dialog>
      {aiAccess && (
        <CaseAiAccessPanel
          key={aiAccess.id}
          matterId={aiAccess.id}
          matterTitle={aiAccess.title}
          onClose={() => setAiAccess(null)}
        />
      )}
      {confirming && (
        <LifecycleDialog
          record={confirming.record}
          action={confirming.action}
          document={false}
          busy={busy}
          error={confirmError}
          onCancel={() => setConfirming(null)}
          onConfirm={(confirmation) => void runLifecycle(confirmation)}
        />
      )}
    </>
  );
}
