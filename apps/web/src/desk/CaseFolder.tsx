import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import type { RecentItem } from '../agentic-workspace/RecentConversations';

/** Quantos casos a Pasta guarda (decisão de Boni, 26/11/2026: quantidade limitada). */
export const CASE_FOLDER_LIMIT = 20;

export interface FolderCase {
  id: string;
  title: string;
}
interface CaseRecord extends FolderCase {
  lifecycleRevision?: number;
}

const api = <T,>(path: string, init?: RequestInit) => requestApi<T>(path, init, { sessionOnly: true });
const post = (body: unknown, method = 'POST') => ({ method, body: JSON.stringify(body) });
const failure = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Pasta da Mesa (regra do mínimo, AGENTS.md): os casos salvos, até {@link CASE_FOLDER_LIMIT}, separados das conversas
 * recentes. Cada caso abre as conversas dele e faz o próximo pedido nascer nele; renomear e excluir de vez ficam no
 * próprio item. Nada além disso.
 */
export function CaseFolder({
  conversations,
  currentId,
  activeCase,
  busy,
  onOpen,
  onSelectCase,
}: {
  conversations: RecentItem[];
  currentId: string | null;
  activeCase?: FolderCase;
  busy: boolean;
  onOpen: (executionId: string) => void;
  onSelectCase: (selected: FolderCase | undefined) => void;
}) {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<CaseRecord>();
  const [deleting, setDeleting] = useState<CaseRecord>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api<{ items: CaseRecord[] }>('/api/v2/matters?view=active');
      setCases(response.items.map(({ id, title, lifecycleRevision }) => ({ id, title, lifecycleRevision })));
    } catch {
      /* A pasta volta na próxima carga; a conversa segue funcionando. */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (operation: () => Promise<void>, fallback: string) => {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await operation();
      await load();
    } catch (problem) {
      setError(failure(problem, fallback));
    } finally {
      setWorking(false);
    }
  };
  const create = () =>
    run(async () => {
      const created = await api<CaseRecord>('/api/v2/matters', post({ title: name.trim() }));
      setCreating(false);
      setName('');
      onSelectCase({ id: created.id, title: created.title ?? name.trim() });
    }, 'Não foi possível criar o caso.');
  const rename = () =>
    run(async () => {
      if (!renaming) return;
      await api(`/api/v2/matters/${encodeURIComponent(renaming.id)}`, post({ title: renaming.title.trim() }, 'PATCH'));
      if (activeCase?.id === renaming.id) onSelectCase({ id: renaming.id, title: renaming.title.trim() });
      setRenaming(undefined);
    }, 'Não foi possível renomear o caso.');
  // Excluir de vez: o servidor só apaga o que está na lixeira, com o nome do caso como confirmação.
  const remove = () =>
    run(async () => {
      if (!deleting) return;
      const path = `/api/v2/matters/${encodeURIComponent(deleting.id)}`;
      const trashed = await api<CaseRecord>(
        `${path}/trash`,
        post({ expectedLifecycleRevision: deleting.lifecycleRevision ?? 0 }),
      );
      await api(
        `${path}/purge`,
        post({
          expectedLifecycleRevision: trashed?.lifecycleRevision ?? (deleting.lifecycleRevision ?? 0) + 1,
          confirmation: deleting.title,
        }),
      ).catch((problem) => {
        if (problem instanceof ApiRequestError && problem.code === 'PURGE_CONFIRMATION_PENDING') return;
        throw problem;
      });
      if (activeCase?.id === deleting.id) onSelectCase(undefined);
      setDeleting(undefined);
    }, 'Não foi possível excluir o caso.');

  const full = cases.length >= CASE_FOLDER_LIMIT;
  const disabled = busy || working;
  const field =
    'min-h-9 w-full rounded-[var(--fl-radius-control)] border border-line-control bg-surface px-2 text-sm text-ink';
  const link = 'min-h-9 rounded-lg px-2 text-xs font-medium text-stone-600 hover:text-cognac-800 disabled:opacity-40';
  return (
    <section aria-label="Pasta" className="space-y-1">
      <div className="flex items-center justify-between px-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-600">
          Pasta{' '}
          <span className="font-normal normal-case">
            ({cases.length}/{CASE_FOLDER_LIMIT})
          </span>
        </p>
        {!creating && (
          <button
            type="button"
            disabled={disabled || full}
            title={full ? `A pasta guarda até ${CASE_FOLDER_LIMIT} casos.` : 'Novo caso'}
            aria-label="Novo caso"
            onClick={() => setCreating(true)}
            className="min-h-9 min-w-9 rounded-lg text-lg leading-none text-stone-600 hover:text-cognac-800 disabled:opacity-40"
          >
            +
          </button>
        )}
      </div>
      {creating && (
        <form
          aria-label="Novo caso"
          className="flex gap-1 px-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) void create();
          }}
        >
          <input
            autoFocus
            aria-label="Nome do caso"
            placeholder="Nome do caso"
            maxLength={120}
            value={name}
            disabled={working}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setCreating(false)}
            className={field}
          />
          <button type="submit" disabled={working || !name.trim()} className={link}>
            Criar
          </button>
        </form>
      )}
      {full && <p className="px-3 text-xs text-stone-600">A pasta está cheia ({CASE_FOLDER_LIMIT} casos).</p>}
      {error && (
        <p role="alert" className="px-3 text-xs text-red-700">
          {error}
        </p>
      )}
      {!cases.length && !creating && <p className="px-3 text-sm text-stone-600">Nenhum caso salvo.</p>}
      <ul className="space-y-1">
        {cases.map((item) => {
          const open = activeCase?.id === item.id;
          const own = conversations.filter((conversation) => conversation.matterId === item.id);
          return (
            <li key={item.id} className="rounded-lg">
              {renaming?.id === item.id ? (
                <form
                  aria-label={`Renomear ${item.title}`}
                  className="flex gap-1 px-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (renaming.title.trim()) void rename();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Novo nome do caso"
                    maxLength={120}
                    value={renaming.title}
                    disabled={working}
                    onChange={(event) => setRenaming({ ...item, title: event.target.value })}
                    onKeyDown={(event) => event.key === 'Escape' && setRenaming(undefined)}
                    className={field}
                  />
                  <button type="submit" disabled={working || !renaming.title.trim()} className={link}>
                    Salvar
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  aria-expanded={open}
                  title={item.title}
                  onClick={() => onSelectCase(open ? undefined : { id: item.id, title: item.title })}
                  className={`min-h-11 w-full truncate rounded-lg px-3 py-2 text-left text-sm ${open ? 'bg-cognac-100 text-cognac-900' : 'text-stone-800 hover:bg-ivory-100'}`}
                >
                  {item.title}
                </button>
              )}
              {open && renaming?.id !== item.id && (
                <div className="space-y-1 pb-2 pl-3">
                  {own.map((conversation) => (
                    <button
                      key={conversation.executionId}
                      type="button"
                      aria-current={conversation.executionId === currentId ? 'page' : undefined}
                      title={conversation.title}
                      onClick={() => onOpen(conversation.executionId)}
                      className="block min-h-9 w-full truncate rounded-lg px-3 text-left text-sm text-stone-700 hover:bg-ivory-100"
                    >
                      {conversation.title}
                    </button>
                  ))}
                  {!own.length && <p className="px-3 text-xs text-stone-600">O próximo pedido fica neste caso.</p>}
                  {deleting?.id === item.id ? (
                    <div role="alertdialog" aria-label={`Excluir ${item.title}`} className="space-y-1 px-3">
                      <p className="text-xs text-stone-700">
                        Excluir o caso e tudo o que está nele, de vez? Não dá para desfazer.
                      </p>
                      <button type="button" disabled={working} onClick={() => void remove()} className={link}>
                        Excluir de vez
                      </button>
                      <button type="button" disabled={working} onClick={() => setDeleting(undefined)} className={link}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1 px-1">
                      <button type="button" disabled={disabled} onClick={() => setRenaming(item)} className={link}>
                        Renomear
                      </button>
                      <button type="button" disabled={disabled} onClick={() => setDeleting(item)} className={link}>
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
