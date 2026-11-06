import { RotateCcw, Trash2 } from 'lucide-react';

export interface RecentItem {
  executionId: string;
  title: string;
  status: string;
  updatedAt: string;
}

const STATE: Record<string, string> = {
  QUEUED: 'Trabalhando',
  RUNNING: 'Trabalhando',
  WAITING_USER: 'Aguardando você',
};

function List({
  items,
  currentId,
  onOpen,
  onHistory,
  trash,
  busy,
}: {
  items: RecentItem[];
  currentId: string | null;
  onOpen: (id: string) => void;
  onHistory?: (item: RecentItem, hidden: boolean) => void;
  trash?: boolean;
  busy?: boolean;
}) {
  if (!items.length)
    return (
      <p className="px-3 text-sm text-stone-600">
        {trash ? 'Nenhuma conversa excluída.' : 'Suas conversas aparecem aqui.'}
      </p>
    );
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.executionId} className="group flex min-w-0 items-start rounded-lg hover:bg-ivory-100">
          <button
            type="button"
            aria-current={item.executionId === currentId ? 'page' : undefined}
            title={item.title}
            className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm ${item.executionId === currentId ? 'bg-cognac-100 text-cognac-900' : 'text-stone-800 hover:bg-ivory-100'}`}
            onClick={() => onOpen(item.executionId)}
          >
            <span className="block truncate">{item.title}</span>
            {STATE[item.status] && <span className="block text-xs text-stone-600">{STATE[item.status]}</span>}
          </button>
          {onHistory && (
            <button
              type="button"
              disabled={busy}
              aria-label={`${trash ? 'Restaurar' : 'Excluir do histórico'}: ${item.title}`}
              title={trash ? 'Restaurar conversa' : 'Excluir do histórico'}
              className="min-h-11 shrink-0 rounded-lg px-2 text-stone-500 hover:text-cognac-800 lg:opacity-0 lg:focus:opacity-100 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
              onClick={() => onHistory(item, !trash)}
            >
              {trash ? <RotateCcw size={16} /> : <Trash2 size={16} />}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Recent conversations: a column beside the desk on wide screens, a folded block on narrow ones. */
export function RecentConversations({
  items,
  currentId,
  onNew,
  onOpen,
  expanded = false,
  onHistory,
  trash = false,
  onTrashToggle,
  busy = false,
}: {
  items: RecentItem[];
  currentId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
  expanded?: boolean;
  onHistory?: (item: RecentItem, hidden: boolean) => void;
  trash?: boolean;
  onTrashToggle?: () => void;
  busy?: boolean;
}) {
  return (
    <nav aria-label="Conversas recentes" className="min-w-0">
      <div className={expanded ? 'space-y-3' : 'hidden space-y-3 lg:block'}>
        <button type="button" disabled={busy} className="btn-secondary min-h-11 w-full" onClick={onNew}>
          Nova conversa
        </button>
        <p className="px-3 text-xs font-semibold uppercase tracking-wide text-stone-600">
          {trash ? 'Excluídas do histórico' : 'Recentes'}
        </p>
        <List items={items} currentId={currentId} onOpen={onOpen} onHistory={onHistory} trash={trash} busy={busy} />
      </div>
      {!expanded && (
        <details className="lg:hidden">
          <summary className="min-h-11 cursor-pointer text-sm text-cognac-700 underline">Conversas recentes</summary>
          <List items={items} currentId={currentId} onOpen={onOpen} onHistory={onHistory} trash={trash} busy={busy} />
        </details>
      )}
      {onTrashToggle && (
        <button
          type="button"
          disabled={busy}
          onClick={onTrashToggle}
          className="mt-5 min-h-11 px-3 text-xs text-stone-500 hover:text-cognac-800"
        >
          {trash ? 'Voltar às conversas' : 'Conversas excluídas'}
        </button>
      )}
    </nav>
  );
}
