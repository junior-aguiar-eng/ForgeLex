import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FileText, MessageSquare, PanelLeftClose, PanelLeftOpen, PanelRightClose, Plus, Search } from 'lucide-react';
import { AgenticWorkspaceScreen } from './AgenticWorkspaceScreen';
import { DraftStudioScreen } from './DraftStudioScreen';
import { useApp } from '../context/AppContext';
import type { DeskPiece } from '../agentic-workspace/desk-model';
import type { Execution } from '../agentic-workspace/execution-model';
import type { GuidanceState } from '../agentic-workspace/guidance-model';
import {
  hasDeskPiece,
  matchesDeskPiece,
  selectDeskExecution,
  selectDeskPiece,
  type DeskDocumentSelection,
} from '../agentic-workspace/desk-selection';
import { deskLocation, readDeskLocation, writeDeskLocation } from '../navigation/desk-location';
import { tabForPath, updateDocumentTitle } from '../navigation/routes';
import { useAuth } from '../auth/AuthContext';
import { ScreenLoadBoundary } from '../components/ScreenLoadBoundary';
import { CanvasDialog } from './draft-review/DraftCanvas';
import { DeskCaseSources } from '../research/DeskCaseSources';
import { DashboardScreen } from './DashboardScreen';
import type { ReviewQueueItem } from '../operations/contracts';

const ResearchDeskScreen = lazy(() =>
  import('./ResearchDeskScreen').then(({ ResearchDeskScreen }) => ({ default: ResearchDeskScreen })),
);

function editorLocation(selection: ReturnType<typeof readDeskLocation>): string {
  return deskLocation(selectDeskPiece({}, selection));
}

export function WritingDeskScreen({ active, requestedLocation }: { active: boolean; requestedLocation: string }) {
  const { getDeskSelection, setDeskSelection, refreshOperationalState } = useApp();
  const { status, account } = useAuth();
  const legacyTab = tabForPath(new URL(requestedLocation).pathname);
  const routeSelection = readDeskLocation(requestedLocation);
  const selection = legacyTab === 'dashboard' && !routeSelection.draftId ? getDeskSelection() : routeSelection;
  const attached = active && hasDeskPiece(selection);
  const [location, setLocation] = useState(() => (attached ? editorLocation(selection) : ''));
  const [open, setOpen] = useState(Boolean(location));
  const [mobile, setMobile] = useState<'chat' | 'piece'>(location ? 'piece' : 'chat');
  const [piece, setPiece] = useState<DeskPiece | null>(null);
  const [historyContainer, setHistoryContainer] = useState<HTMLElement | null>(null);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const activePiece = attached && piece && matchesDeskPiece(selection, piece) ? piece : null;
  const target = attached ? editorLocation(selection) : '';
  const previousTarget = useRef(target);
  const [sources, setSources] = useState<{ kind: 'research' | 'case'; key: string }>();
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [requestedReview, setRequestedReview] = useState<DeskDocumentSelection>();
  const [deskEditorialEnabled, setDeskEditorialEnabled] = useState(false);
  const sourceKey = JSON.stringify([status, account?.user.id, account?.workspace.id, deskLocation(selection)]);
  const openCaseSources = selection.matterId ? () => setSources({ kind: 'case', key: sourceKey }) : undefined;

  useLayoutEffect(() => {
    if (!active) {
      setSources(undefined);
      setQueueOpen(false);
      setRequestedReview(undefined);
      return;
    }
    const tab = tabForPath(new URL(requestedLocation).pathname);
    const legacy = readDeskLocation(requestedLocation);
    if (tab === 'dashboard') {
      if (legacy.draftId) {
        setQueueOpen(false);
        setRequestedReview(legacy);
        setOpen(true);
        setMobile('piece');
      } else {
        setQueueError('');
        setQueueOpen(true);
        void refreshOperationalState();
      }
      writeDeskLocation(legacy.draftId ? legacy : getDeskSelection());
      updateDocumentTitle('work');
    } else if (tab === 'draft_studio') {
      writeDeskLocation(legacy);
      updateDocumentTitle('work');
    }
  }, [active, getDeskSelection, refreshOperationalState, requestedLocation]);

  const openQueuedDraft = (item: ReviewQueueItem) => {
    if (!item.draftVersionId) {
      setQueueError('A pendência não informa a versão do rascunho.');
      return;
    }
    if (piece?.dirty && (item.matterId !== piece.matterId || item.targetId !== piece.draftId)) {
      setQueueError('Salve a peça aberta antes de trocar de rascunho.');
      return;
    }
    const document = { matterId: item.matterId, draftId: item.targetId, versionId: item.draftVersionId };
    setRequestedReview(document);
    setDeskSelection(selectDeskPiece(getDeskSelection(), document), 'push');
    setOpen(true);
    setMobile('piece');
    setQueueOpen(false);
  };

  useLayoutEffect(() => {
    if (!active) return;
    if (!target) {
      setOpen(false);
      setMobile('chat');
    } else {
      setLocation(target);
      if (!previousTarget.current) {
        setOpen(true);
        setMobile('piece');
      }
    }
    previousTarget.current = target;
  }, [active, target]);

  const changeExecution = useCallback(
    (id: string | null, switched: boolean) => {
      const current = getDeskSelection();
      if (switched) setDeskSelection(selectDeskExecution(current, id ?? undefined), 'push');
      else setDeskSelection({ ...current, executionId: id ?? undefined });
    },
    [getDeskSelection, setDeskSelection],
  );

  const rememberConversation = useCallback(
    (run: Execution) => {
      const current = getDeskSelection();
      if (current.executionId !== run.id) return;
      setDeskSelection({ ...current, conversationId: run.conversationId, contextRevision: run.contextRevision });
    },
    [getDeskSelection, setDeskSelection],
  );
  const selectionKey = useCallback(() => deskLocation(getDeskSelection()), [getDeskSelection]);
  const guidanceSelectionKey = useCallback(() => {
    const { executionId, conversationId, contextRevision, matterId } = getDeskSelection();
    return deskLocation({ executionId, conversationId, contextRevision, matterId });
  }, [getDeskSelection]);
  const publishGuidance = useCallback(
    (state?: GuidanceState) => {
      const current = getDeskSelection();
      if (current.executionId) return;
      setDeskSelection({ ...current, conversationId: state?.conversationId, contextRevision: state?.contextRevision });
    },
    [getDeskSelection, setDeskSelection],
  );

  const openPiece = useCallback(
    (url: string, keepSelected = false) => {
      if (tabForPath(window.location.pathname) !== 'work') return;
      const current = readDeskLocation(window.location.href);
      const delivery = readDeskLocation(url);
      if (keepSelected && hasDeskPiece(current)) return;
      if (delivery.executionId !== current.executionId || piece?.canOpenDelivery?.(hasDeskPiece(current)) === false)
        return;
      writeDeskLocation(selectDeskPiece(current, delivery));
      setOpen(true);
      setMobile('piece');
    },
    [piece],
  );

  const reopenPiece = () => {
    if (!attached) {
      const document = piece
        ? {
            matterId: piece.matterId || undefined,
            draftId: piece.draftId || undefined,
            versionId: piece.versionId || undefined,
            deliveryId: piece.deliveryId,
          }
        : {};
      writeDeskLocation(selectDeskPiece(selection, document), 'push');
    }
    setOpen(true);
    setMobile('piece');
    if (!location) setLocation(target || editorLocation({}));
  };
  return (
    <div className="min-w-0" data-writing-desk>
      <header className="flex min-h-12 flex-wrap items-center gap-3 border-b border-stone-200 px-5 text-sm">
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
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
          onClick={() => {
            setQueueError('');
            setQueueOpen(true);
            void refreshOperationalState();
          }}
        >
          Pendências de revisão
        </button>
        <button
          type="button"
          onClick={() => setSources({ kind: 'research', key: sourceKey })}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-stone-600 hover:bg-stone-100"
        >
          <Search size={16} aria-hidden="true" />
          Pesquisa e fontes
        </button>
        <button
          type="button"
          onClick={reopenPiece}
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
            className={`${open && mobile === 'piece' ? 'hidden lg:block' : ''} min-w-0 lg:h-[calc(100dvh-8rem)] lg:overflow-hidden`}
          >
            <AgenticWorkspaceScreen
              active={active}
              historyContainer={historyContainer}
              onEditor={openPiece}
              requestedExecutionId={active ? (selection.executionId ?? null) : undefined}
              onExecutionChange={changeExecution}
              onConversationChange={rememberConversation}
              onDeskEditorialAvailability={setDeskEditorialEnabled}
              selectionKey={selectionKey}
              guidanceRoute={{
                id: selection.executionId ? undefined : selection.conversationId,
                revision: selection.contextRevision,
                selectionKey: guidanceSelectionKey,
                publish: publishGuidance,
              }}
              piece={activePiece}
              piecePending={attached && (!activePiece || activePiece.loadingSelection)}
            />
          </div>
          {location && (
            <div
              style={!open ? { display: 'none' } : undefined}
              className={`${mobile === 'chat' ? 'hidden lg:block' : ''} min-w-0 border-l border-stone-200`}
            >
              <DraftStudioScreen
                requestedLocation={location}
                selectedVersionId={attached ? selection.versionId : undefined}
                onPieceChange={setPiece}
                onCaseSources={openCaseSources}
                requestedReview={requestedReview}
                deskEditorialEnabled={deskEditorialEnabled}
              />
            </div>
          )}
        </div>
      </div>
      {active && sources?.key === sourceKey && (
        <CanvasDialog
          title={sources.kind === 'research' ? 'Pesquisa e fontes' : 'Fontes do caso'}
          onClose={() => setSources(undefined)}
        >
          {sources.kind === 'research' ? (
            <ScreenLoadBoundary fallback={<p role="alert">Não foi possível abrir a pesquisa.</p>}>
              <Suspense fallback={<p role="status">Carregando pesquisa…</p>}>
                <ResearchDeskScreen compact pieceMatterId={selection.matterId} />
              </Suspense>
            </ScreenLoadBoundary>
          ) : (
            selection.matterId && <DeskCaseSources key={sourceKey} matterId={selection.matterId} />
          )}
        </CanvasDialog>
      )}
      {active && queueOpen && (
        <CanvasDialog title="Revisão do caso" onClose={() => setQueueOpen(false)}>
          {queueError && (
            <p role="alert" className="text-sm text-amber-800">
              {queueError}
            </p>
          )}
          <DashboardScreen compact onOpenDraft={openQueuedDraft} />
        </CanvasDialog>
      )}
    </div>
  );
}
