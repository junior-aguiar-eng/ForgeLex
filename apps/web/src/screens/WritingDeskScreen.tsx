import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { AgenticWorkspaceScreen } from './AgenticWorkspaceScreen';
import { DraftStudioScreen } from './DraftStudioScreen';
import { useApp } from '../context/AppContext';
import type { DeskPiece, DeskRequest } from '../agentic-workspace/desk-model';
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
import { DeskShell } from '../desk/DeskShell';
import { DeskShortcuts, reviewTextRequest } from '../desk/DeskShortcuts';
import { DESK_SHELL_ENABLED } from '../config/site-capabilities';
import { DeskMobileTabs, DeskToolbar } from '../desk/DeskToolbar';
import { DeskQueueDialog, DeskSourcesDialog } from '../desk/DeskDialogs';
import type { ReviewQueueItem } from '../operations/contracts';

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
  const [request, setRequest] = useState<DeskRequest>();
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
    <DeskShell
      historyRef={setHistoryContainer}
      historyCollapsed={historyCollapsed}
      open={open}
      mobile={mobile}
      toolbar={
        <DeskToolbar
          historyCollapsed={historyCollapsed}
          onToggleHistory={() => setHistoryCollapsed((value) => !value)}
          onOpenQueue={() => {
            setQueueError('');
            setQueueOpen(true);
            void refreshOperationalState();
          }}
          onOpenResearch={() => setSources({ kind: 'research', key: sourceKey })}
          onReopenPiece={reopenPiece}
          hasPiece={Boolean(location)}
          pieceOpen={open}
          onCollapsePiece={() => {
            setOpen(false);
            setMobile('chat');
          }}
        />
      }
      mobileTabs={<DeskMobileTabs mobile={mobile} onChange={setMobile} />}
      conversation={
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
          request={request}
          emptyState={
            DESK_SHELL_ENABLED ? (
              <DeskShortcuts
                onNewPiece={reopenPiece}
                onReviewText={() => setRequest((old) => ({ id: (old?.id ?? 0) + 1, text: reviewTextRequest }))}
                onResearch={() => setSources({ kind: 'research', key: sourceKey })}
              />
            ) : undefined
          }
        />
      }
      piece={
        location && (
          <DraftStudioScreen
            requestedLocation={location}
            selectedVersionId={attached ? selection.versionId : undefined}
            onPieceChange={setPiece}
            onCaseSources={openCaseSources}
            requestedReview={requestedReview}
            deskEditorialEnabled={deskEditorialEnabled}
          />
        )
      }
      overlays={
        <>
          {active && sources?.key === sourceKey && (
            <DeskSourcesDialog
              kind={sources.kind}
              sourceKey={sourceKey}
              matterId={selection.matterId}
              onClose={() => setSources(undefined)}
            />
          )}
          {active && queueOpen && (
            <DeskQueueDialog error={queueError} onClose={() => setQueueOpen(false)} onOpenDraft={openQueuedDraft} />
          )}
        </>
      }
    />
  );
}
