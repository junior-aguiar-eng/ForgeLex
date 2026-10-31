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
}: {
  items: RecentItem[];
  currentId: string | null;
  onOpen: (id: string) => void;
}) {
  if (!items.length) return <p className="px-3 text-sm text-stone-600">Suas conversas aparecem aqui.</p>;
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.executionId}>
          <button
            type="button"
            aria-current={item.executionId === currentId ? 'page' : undefined}
            className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm ${item.executionId === currentId ? 'bg-cognac-100 text-cognac-900' : 'text-stone-800 hover:bg-ivory-100'}`}
            onClick={() => onOpen(item.executionId)}
          >
            <span className="block break-words">{item.title}</span>
            {STATE[item.status] && <span className="block text-xs text-stone-600">{STATE[item.status]}</span>}
          </button>
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
}: {
  items: RecentItem[];
  currentId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <nav aria-label="Conversas recentes" className="min-w-0">
      <div className="hidden space-y-3 lg:block">
        <button type="button" className="btn-secondary min-h-11 w-full" onClick={onNew}>
          Nova conversa
        </button>
        <p className="px-3 text-xs font-semibold uppercase tracking-wide text-stone-600">Recentes</p>
        <List items={items} currentId={currentId} onOpen={onOpen} />
      </div>
      <details className="lg:hidden">
        <summary className="min-h-11 cursor-pointer text-sm text-cognac-700 underline">Conversas recentes</summary>
        <List items={items} currentId={currentId} onOpen={onOpen} />
      </details>
    </nav>
  );
}
