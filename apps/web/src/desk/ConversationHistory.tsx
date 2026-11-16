import { useEffect, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { CanvasDialog } from '../screens/draft-review/DraftCanvas';
import { UndoNotice } from '../components/UndoNotice';
import type { WorkspaceClient } from '../agentic-workspace/client';
import { RecentConversations, type RecentItem } from '../agentic-workspace/RecentConversations';

/**
 * Histórico de conversas da Mesa: lista, lixeira, exclusão com "Desfazer" e o diálogo do celular. Excluir é
 * reversível: o aviso oferece "Desfazer" e o histórico guarda a conversa em "Conversas excluídas".
 */
export function useConversationHistory({
  client,
  enabled,
  id,
  status,
  busy,
  epoch,
  onNew,
}: {
  client: WorkspaceClient;
  /** Só com a sessão autenticada e fora do piloto fechado. */
  enabled: boolean;
  id: string | null;
  status: string;
  busy: boolean;
  /** Contador de navegação da tela: uma exclusão que termina depois de trocar de conversa não reabre a Mesa. */
  epoch: MutableRefObject<number>;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [trash, setTrash] = useState(false);
  const [pending, setPending] = useState<RecentItem>();
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    client
      .recent(trash)
      .then((r) => active && setRecent(r.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, enabled, id, status, trash, historyBusy]);
  const update = async (item: RecentItem, hidden: boolean) => {
    if (historyBusy) return;
    setHistoryBusy(true);
    setError('');
    const startedAt = epoch.current;
    try {
      await client.setConversationHidden(item.executionId, hidden);
      setRecent((items) => items.filter((row) => row.executionId !== item.executionId));
      if (hidden && item.executionId === id && startedAt === epoch.current) onNew();
      setPending(hidden ? item : undefined);
    } catch {
      setError('Não foi possível atualizar o histórico. Tente novamente.');
    } finally {
      setHistoryBusy(false);
    }
  };
  const listProps = (onOpen: (next: string) => void) => ({
    items: recent,
    currentId: id,
    onNew,
    onOpen,
    trash,
    busy: busy || historyBusy,
    onTrashToggle: () => {
      setRecent([]);
      setTrash((value) => !value);
      setError('');
    },
    onHistory: (item: RecentItem, hidden: boolean) => {
      setError('');
      void update(item, hidden);
    },
  });
  return { open, setOpen, pending, setPending, historyBusy, error, update, listProps };
}

export type ConversationHistory = ReturnType<typeof useConversationHistory>;

/** A lista fixa (portal), o botão e o diálogo do celular, o erro e o aviso de exclusão. */
export function ConversationHistoryView({
  history,
  enabled,
  container,
  onNew,
  onOpen,
}: {
  history: ConversationHistory;
  /** Fora do piloto fechado. */
  enabled: boolean;
  container?: HTMLElement | null;
  onNew: () => void;
  onOpen: (next: string) => void;
}) {
  const props = history.listProps(onOpen);
  return (
    <>
      {enabled && container && createPortal(<RecentConversations {...props} expanded />, container)}
      {enabled && (
        <button type="button" onClick={() => history.setOpen(true)} className="text-sm text-stone-600 lg:hidden">
          Conversas
        </button>
      )}
      {history.open && (
        <CanvasDialog title="Conversas" onClose={() => history.setOpen(false)}>
          <RecentConversations
            {...props}
            expanded
            onNew={() => {
              onNew();
              history.setOpen(false);
            }}
            onOpen={(next) => {
              onOpen(next);
              history.setOpen(false);
            }}
          />
        </CanvasDialog>
      )}
      {history.error && <p role="alert">{history.error}</p>}
      {history.pending && (
        <UndoNotice
          message={`Conversa excluída do histórico: ${history.pending.title}. As peças e os recibos foram preservados.`}
          busy={history.historyBusy}
          onUndo={() => void history.update(history.pending!, false)}
          onDismiss={() => history.setPending(undefined)}
        />
      )}
    </>
  );
}
