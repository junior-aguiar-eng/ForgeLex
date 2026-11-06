import { useCallback, useEffect, useState } from 'react';
import { FileText, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, Plus } from 'lucide-react';
import { AgenticWorkspaceScreen } from './AgenticWorkspaceScreen';
import { DraftStudioScreen } from './DraftStudioScreen';
import { useApp, type ReviewQueueItem } from '../context/AppContext';
import type { DeskPiece, DeskRequest } from '../agentic-workspace/desk-model';

export function WritingDeskScreen({
  active,
  requestedLocation,
  onExecutionChange,
}: {
  active: boolean;
  requestedLocation: string;
  onExecutionChange: (id: string | null) => void;
}) {
  const initial = new URL(requestedLocation, window.location.origin);
  const [location, setLocation] = useState(
    initial.searchParams.has('draftId') ||
      initial.searchParams.has('deliveryId') ||
      initial.pathname.includes('rascunhos')
      ? requestedLocation
      : '',
  );
  const [open, setOpen] = useState(Boolean(location));
  const [mobile, setMobile] = useState<'chat' | 'piece'>(location ? 'piece' : 'chat');
  const [piece, setPiece] = useState<DeskPiece | null>(null);
  const [request, setRequest] = useState<DeskRequest>();
  const [inbox, setInbox] = useState(initial.pathname.includes('revisao'));
  const [selected, setSelected] = useState<ReviewQueueItem>();
  const [error, setError] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [historyContainer, setHistoryContainer] = useState<HTMLElement | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const { reviewQueue, resolveReview } = useApp();
  const pending = reviewQueue.data.filter((item) => item.status === 'PENDING');
  const openPiece = useCallback((url: string) => {
    setLocation(url);
    setOpen(true);
    setMobile('piece');
    const next = new URL(window.location.href);
    const execution =
      new URL(window.location.href).searchParams.get('executionId') ?? next.searchParams.get('returnExecution');
    next.pathname = '/app/trabalho';
    if (execution) next.searchParams.set('executionId', execution);
    window.history.replaceState({}, '', next);
  }, []);
  useEffect(() => {
    const url = new URL(requestedLocation, window.location.origin);
    if (url.pathname.includes('rascunhos')) openPiece(requestedLocation);
    if (url.pathname.includes('revisao')) setInbox(true);
  }, [requestedLocation, openPiece]);
  const ask = useCallback((text: string) => {
    setRequest({ id: Date.now(), text });
    setMobile('chat');
  }, []);
  const decide = async (action: 'APPROVED' | 'REJECTED') => {
    if (!selected || deciding) return;
    setDeciding(true);
    setError('');
    try {
      await resolveReview(selected, action);
      setSelected(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar a decisão.');
    } finally {
      setDeciding(false);
    }
  };
  return (
    <div className="min-w-0" data-writing-desk>
      <header className="flex min-h-12 items-center gap-3 border-b border-stone-200 px-5 text-sm">
        <button
          type="button"
          aria-label={historyCollapsed ? 'Mostrar conversas' : 'Recolher conversas'}
          aria-expanded={!historyCollapsed}
          aria-controls="desk-conversations"
          onClick={() => setHistoryCollapsed((value) => !value)}
          className="hidden rounded-lg p-2 text-stone-600 hover:bg-stone-100 lg:block"
        >
          {historyCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <span className="mr-auto" />
        {pending.length > 0 && (
          <button
            type="button"
            onClick={() => setInbox(true)}
            className="rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
          >
            Conferir ({pending.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMobile('piece');
            if (!location) setLocation('/app/trabalho');
          }}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
        >
          <Plus size={16} />
          {location ? 'Abrir peça' : 'Nova peça'}
        </button>
        {open && (
          <button
            type="button"
            aria-label="Recolher peça"
            onClick={() => {
              setOpen(false);
              setMobile('chat');
            }}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100"
          >
            <PanelRightClose size={18} />
          </button>
        )}
      </header>
      {open && (
        <nav aria-label="Áreas da mesa" className="flex justify-center gap-2 border-b border-stone-200 p-2 lg:hidden">
          <button
            type="button"
            aria-pressed={mobile === 'chat'}
            onClick={() => setMobile('chat')}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 aria-pressed:bg-stone-200"
          >
            <MessageSquare size={16} />
            Conversa
          </button>
          <button
            type="button"
            aria-pressed={mobile === 'piece'}
            onClick={() => setMobile('piece')}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 aria-pressed:bg-stone-200"
          >
            <FileText size={16} />
            Peça
          </button>
        </nav>
      )}
      <div className={`min-w-0 ${historyCollapsed ? '' : 'lg:grid lg:grid-cols-[224px_minmax(0,1fr)]'}`}>
        <aside
          id="desk-conversations"
          aria-label="Histórico de conversas"
          ref={setHistoryContainer}
          className={`${historyCollapsed ? 'hidden' : 'hidden lg:block'} min-w-0 border-r border-stone-200 bg-stone-50/60 px-3 py-5 lg:h-[calc(100dvh-8rem)] lg:overflow-y-auto`}
        />
        <div
          className={
            open ? 'grid min-w-0 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.4fr)]' : 'mx-auto w-full max-w-4xl'
          }
        >
          <div
            className={`${open && mobile === 'piece' ? 'hidden lg:block' : ''} min-w-0 ${open ? 'lg:h-[calc(100dvh-8rem)] lg:overflow-y-auto' : ''}`}
          >
            <AgenticWorkspaceScreen
              active={active}
              integrated
              historyContainer={historyContainer}
              onEditor={openPiece}
              onExecutionChange={onExecutionChange}
              piece={piece}
              request={request}
            />
          </div>
          {location && (
            <div
              style={!open ? { display: 'none' } : undefined}
              className={`${mobile === 'chat' ? 'hidden lg:block' : ''} min-w-0 border-l border-stone-200`}
            >
              <DraftStudioScreen integrated requestedLocation={location} onPieceChange={setPiece} onAsk={ask} />
            </div>
          )}
        </div>
      </div>
      {inbox && (
        <section aria-label="Conferências do caso" className="mx-5 my-3 rounded-xl border border-stone-200 p-4">
          <button
            type="button"
            disabled={deciding}
            onClick={() => {
              setInbox(false);
              setSelected(undefined);
            }}
            className="mb-2 text-sm underline"
          >
            Recolher conferências
          </button>
          {error && <p role="alert">{error}</p>}
          {selected ? (
            <div className="space-y-4">
              <h3 className="font-editorial text-lg">{selected.title}</h3>
              <p className="whitespace-pre-wrap text-sm leading-7">{selected.summary}</p>
              <div className="flex gap-3">
                <button
                  disabled={deciding}
                  type="button"
                  onClick={() => void decide('APPROVED')}
                  className="btn-primary"
                >
                  Aprovar
                </button>
                <button
                  disabled={deciding}
                  type="button"
                  onClick={() => void decide('REJECTED')}
                  className="btn-secondary"
                >
                  Devolver
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {!pending.length && <p className="text-sm text-stone-500">Nenhuma conferência pendente.</p>}
              {pending.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="block w-full rounded-lg border border-stone-200 p-3 text-left text-sm hover:bg-stone-50"
                  onClick={() => {
                    if (item.kind === 'DRAFT') {
                      openPiece(
                        `/app/trabalho?${new URLSearchParams({ matterId: item.matterId, draftId: item.targetId, ...(item.draftVersionId ? { versionId: item.draftVersionId } : {}) })}`,
                      );
                      setInbox(false);
                    } else setSelected(item);
                  }}
                >
                  {item.title}
                </button>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
