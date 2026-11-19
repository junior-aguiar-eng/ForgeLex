import { useCallback, useEffect, useState } from 'react';
import { requestApi } from '../api-client';
import { useAuth } from '../auth/AuthContext';
import { LifecycleDialog, LifecycleFilter } from '../screens/matter-lifecycle/LifecycleControls';
import {
  actionLabels,
  canManageLifecycle,
  type LifecycleAction,
  type LifecycleRecord,
  type LifecycleView,
} from '../screens/matter-lifecycle/lifecycle-model';
import { deskLifecycleActions, documentLifecycleNotice, documentStateLabel } from './case-manager-model';

interface CaseDocument extends LifecycleRecord {
  originalFilename: string;
  status: 'INDEXED' | 'FAILED';
}
interface CaseDetail {
  matter: LifecycleRecord & { createdBy?: string };
  documents: CaseDocument[];
}

const failureText = (failure: unknown, fallback: string) => (failure instanceof Error ? failure.message : fallback);

/**
 * Aba Documentos da peça (tema gelo, U7): os documentos do caso, com arquivar, mover para a lixeira e restaurar. É o que
 * a tela "Casos" faz com documentos, menos a exclusão definitiva, que continua na tela Casos (futuro "Dados do caso").
 * Só quem criou o caso ou o proprietário gerencia, e só enquanto o caso está em uso, como na tela "Casos".
 */
export function DeskCaseDocuments({ matterId, onOpen }: { matterId: string; onOpen: (documentId: string) => void }) {
  const { status, account } = useAuth();
  const [view, setView] = useState<LifecycleView>('active');
  const [detail, setDetail] = useState<CaseDetail>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState<{ record: CaseDocument; action: LifecycleAction }>();
  const [confirmError, setConfirmError] = useState('');

  /**
   * `keepList` é a recarga depois de uma operação: a lista fica à vista, com o aviso da operação, em vez de sumir atrás
   * de "Carregando…" (que, além de piscar, deixava dois avisos de estado no painel). Na primeira carga e na troca de
   * visão não há lista confiável para manter.
   */
  const load = useCallback(
    async (next: LifecycleView, signal?: AbortSignal, keepList = false) => {
      if (!keepList) setLoading(true);
      setError('');
      try {
        const response = await requestApi<CaseDetail>(
          `/api/v2/matters/${encodeURIComponent(matterId)}?view=${next}`,
          { ...(signal ? { signal } : {}), cache: 'no-store' },
          { sessionOnly: true },
        );
        if (!signal?.aborted) setDetail(response);
      } catch (failure) {
        if (signal?.aborted) return;
        setDetail(undefined);
        setError(failureText(failure, 'Não foi possível abrir os documentos do caso.'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [matterId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(view, controller.signal);
    return () => controller.abort();
  }, [load, view]);

  const run = async () => {
    if (!confirming || busy) return;
    const { record, action } = confirming;
    setBusy(true);
    setConfirmError('');
    try {
      await requestApi(
        `/api/v2/matters/${encodeURIComponent(matterId)}/documents/${encodeURIComponent(record.id)}/${action}`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedLifecycleRevision: record.lifecycleRevision ?? 0,
            ...(action === 'purge' ? { confirmation: record.id } : {}),
          }),
        },
        { sessionOnly: true },
      );
      setConfirming(undefined);
      setNotice(documentLifecycleNotice(action));
      await load(view, undefined, true);
    } catch (failure) {
      setConfirmError(failureText(failure, 'Não foi possível concluir a operação.'));
    } finally {
      setBusy(false);
    }
  };

  const caseActive = (detail?.matter.lifecycleState ?? 'ACTIVE') === 'ACTIVE';
  const canManage =
    caseActive && canManageLifecycle(status, account?.user.id, account?.membership.role, detail?.matter.createdBy);
  const documents = detail?.documents ?? [];

  return (
    <section aria-label="Documentos do caso" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-editorial text-[17px] font-semibold text-ink">Documentos do caso</h2>
        <LifecycleFilter
          label="Mostrar documentos"
          value={view}
          onChange={(next) => {
            setNotice('');
            setView(next);
          }}
          disabled={busy || loading}
        />
      </div>
      {notice && (
        <p role="status" className="rounded-lg bg-accent-soft p-3 text-sm text-ink-soft">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="text-sm text-muted">
          Carregando documentos…
        </p>
      ) : documents.length === 0 && !error ? (
        <p className="text-sm text-muted">
          {view === 'archived'
            ? 'Nenhum documento arquivado neste caso.'
            : view === 'trash'
              ? 'A lixeira de documentos deste caso está vazia.'
              : 'Este caso ainda não tem documentos em uso.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((document) => {
            const actions = canManage ? deskLifecycleActions(document) : [];
            return (
              <li
                key={document.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-muted p-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-ink">{document.title}</p>
                  <p className="break-words text-xs text-subtle">
                    {document.originalFilename} · {documentStateLabel(document)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    aria-label={`Abrir documento: ${document.title}`}
                    onClick={() => onOpen(document.id)}
                    className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-accent hover:bg-canvas-deep"
                  >
                    Abrir
                  </button>
                  {actions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={busy}
                      aria-label={`${actionLabels[action]}: ${document.title}`}
                      onClick={() => {
                        setConfirmError('');
                        setConfirming({ record: document, action });
                      }}
                      className="min-h-9 rounded-[var(--fl-radius-control)] px-2 text-sm font-medium text-accent hover:bg-canvas-deep disabled:opacity-50"
                    >
                      {actionLabels[action]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {confirming && (
        <LifecycleDialog
          record={confirming.record}
          action={confirming.action}
          document
          busy={busy}
          error={confirmError}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => void run()}
        />
      )}
    </section>
  );
}
