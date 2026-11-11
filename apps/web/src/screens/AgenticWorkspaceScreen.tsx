import { CanvasDialog } from './draft-review/DraftCanvas';
import { createPortal } from 'react-dom';
import type { DeskPiece, DeskRequest } from '../agentic-workspace/desk-model';
import { editorLink } from '../agentic-workspace/execution-model';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '../api-client';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceClient, type StartInput } from '../agentic-workspace/client';
import { Composer } from '../agentic-workspace/Composer';
import { GuidancePanel } from '../agentic-workspace/GuidancePanel';
import { useDeskGuidance, type DeskGuidanceRoute } from '../agentic-workspace/use-desk-guidance';
import type { GuidanceField } from '../agentic-workspace/guidance-model';
import { EvidenceChangesPanel } from '../agentic-workspace/EvidenceChangesPanel';
import { Conversation } from '../agentic-workspace/Conversation';
import { ResultCard } from '../agentic-workspace/ResultCard';
import { SideTable, type SideTab } from '../agentic-workspace/SideTable';
import { RecentConversations, type RecentItem } from '../agentic-workspace/RecentConversations';
import { ClosedPilotPanel } from '../agentic-workspace/ClosedPilotPanel';
import { CommercialAuthorizationPanel, CommercialReceiptPanel } from '../agentic-workspace/CommercialPanel';
import type { CommercialAuthorization } from '../agentic-workspace/commercial-model';
import { useExecutionEvents } from '../agentic-workspace/use-execution-events';
import { useDocumentTitles } from '../agentic-workspace/use-document-titles';
import { presentDelivery } from '../agentic-workspace/present-delivery';
import {
  statusText,
  type Answer,
  type Delivery,
  type Execution,
  type PublicAction,
  type Question,
} from '../agentic-workspace/execution-model';
import { DocumentReaderDialog } from '../components/DocumentReaderDialog';
import type { DocumentSource } from '../documents/document-reader-model';

function SupportingSurface({
  modal,
  onClose,
  children,
}: {
  modal: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return modal ? (
    <CanvasDialog title="Fontes e conferência" onClose={onClose}>
      {children}
    </CanvasDialog>
  ) : (
    <>{children}</>
  );
}
const initialId = () => new URLSearchParams(window.location.search).get('executionId');
export function AgenticWorkspaceScreen({
  onEditor,
  active: isActiveSurface,
  onExecutionChange,
  onConversationChange,
  onDeskEditorialAvailability,
  selectionKey,
  guidanceRoute,
  requestedExecutionId,
  integrated = false,
  piece,
  piecePending,
  request,
  historyContainer,
}: {
  onEditor: (url: string, keepSelected?: boolean) => void;
  integrated?: boolean;
  piece?: DeskPiece | null;
  piecePending?: boolean;
  request?: DeskRequest;
  historyContainer?: HTMLElement | null;
  active: boolean;
  requestedExecutionId?: string | null;
  onExecutionChange: (id: string | null, switched: boolean) => void;
  onDeskEditorialAvailability?: (enabled: boolean) => void;
  onConversationChange?: (run: Execution) => void;
  selectionKey?: () => string;
  guidanceRoute?: DeskGuidanceRoute;
}) {
  const { status: authStatus } = useAuth();
  const client = useMemo(() => new WorkspaceClient(), []);
  const [id, setId] = useState<string | null>(() =>
      requestedExecutionId === undefined ? initialId() : requestedExecutionId,
    ),
    [run, setRun] = useState<Execution>(),
    [actions, setActions] = useState<PublicAction[]>([]);
  const [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [closedPilot, setClosedPilot] = useState<boolean>();
  const [commercial, setCommercial] = useState(false);
  const [guidanceEnabled, setGuidanceEnabled] = useState(false);
  const navigationEpoch = useRef(0);
  const guidanceSelectionKey = guidanceRoute?.selectionKey;
  const currentGuidanceScope = useCallback(
    () => JSON.stringify([navigationEpoch.current, guidanceSelectionKey?.()]),
    [guidanceSelectionKey],
  );
  const guidance = useDeskGuidance(
    client,
    guidanceRoute && { ...guidanceRoute, selectionKey: currentGuidanceScope },
    integrated && guidanceEnabled && !id,
    isActiveSurface,
  );
  const [editGuidance, setEditGuidance] = useState<{ field: GuidanceField; id: string; revision: number }>();
  const guidanceField =
    editGuidance &&
    editGuidance.id === guidance.state?.conversationId &&
    editGuidance.revision === guidance.state.contextRevision
      ? editGuidance.field
      : undefined;
  const [paidCommand, setPaidCommand] = useState<{
    kind: string;
    body: unknown;
    send: (key: string, authorization: CommercialAuthorization) => Promise<Execution>;
  }>();
  useEffect(() => {
    if (paidCommand?.kind !== 'start') return;
    const input = paidCommand.body as StartInput;
    if (
      piecePending ||
      (piece &&
        (piece.dirty || input.matterId !== piece.matterId || input.context?.draft?.versionId !== piece.versionId))
    )
      setPaidCommand(undefined);
  }, [piece, piecePending, paidCommand]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [reading, setReading] = useState<DocumentSource>(),
    [correction, setCorrection] = useState<Question>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [trash, setTrash] = useState(false);
  const [historyPending, setHistoryPending] = useState<RecentItem>();
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [side, setSide] = useState<{ open: boolean; tab: SideTab; source: number | null }>({
    open: false,
    tab: 'sources',
    source: null,
  });
  const generation = useRef(0),
    command = useRef<{ hash: string; key: string }>(),
    mounted = useRef(true);
  const submittedRun = useRef<string>();
  const events = useExecutionEvents(client, id);
  const denied = /ACCESS_REVOKED|UNAUTHENTICATED|NOT_FOUND/.test(error || events.error);
  const titles = useDocumentTitles(run?.matterId ?? null, Boolean(run) && !denied);
  const changeId = useCallback(
    (next: string | null, switched = false) => {
      setId(next);
      onExecutionChange(next, switched);
    },
    [onExecutionChange],
  );
  useEffect(() => {
    if (run && run.id === id) onConversationChange?.(run);
  }, [id, run, onConversationChange]);
  const fail = useCallback(
    (e: unknown) => setError(e instanceof ApiRequestError ? e.code : 'EXECUTION_UNAVAILABLE'),
    [],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (authStatus !== 'authenticated') return;
    client
      .actions()
      .then((r) => {
        if (active) {
          setActions(r.actions);
          setAvailable(r.available);
          setClosedPilot(r.closedPilot ?? false);
          setCommercial(r.commercial === true && !r.closedPilot);
          setGuidanceEnabled(r.guidance === true && !r.closedPilot);
          onDeskEditorialAvailability?.(r.deskEditorial === true && !r.closedPilot);
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [client, authStatus, fail, onDeskEditorialAvailability]);
  const [pastDeliveries, setPastDeliveries] = useState<{ delivery: Delivery; createdAt: string }[]>([]);
  const transcript = useRef<HTMLDivElement>(null);
  const historyLoaded = useRef('');
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const resetSelection = useCallback(() => {
    navigationEpoch.current++;
    generation.current++;
    command.current = undefined;
    submittedRun.current = undefined;
    historyLoaded.current = '';
    setRun(undefined);
    setDeliveries([]);
    setPastDeliveries([]);
    setHistoryUnavailable(false);
    setReading(undefined);
    setCorrection(undefined);
    setPaidCommand(undefined);
    setBusy(false);
    setError('');
    setSide({ open: false, tab: 'sources', source: null });
  }, []);
  useLayoutEffect(() => {
    if (requestedExecutionId === undefined || requestedExecutionId === id) return;
    resetSelection();
    setId(requestedExecutionId);
  }, [requestedExecutionId, id, resetSelection]);
  useEffect(() => {
    if (integrated) return;
    const sync = () => {
      if (window.location.pathname !== '/app/trabalho' || initialId() === id) return;
      resetSelection();
      setId(initialId());
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [integrated, id, resetSelection]);
  useEffect(() => {
    const element = transcript.current;
    if (element && integrated) element.scrollTop = element.scrollHeight;
  }, [integrated, run?.id, run?.status, deliveries.length, pastDeliveries.length]);
  const refresh = useCallback(async () => {
    if (!id) return;
    const ticket = ++generation.current;
    try {
      let value = await client.get(id);
      for (let i = 0; value.successorId && !value.deliveryIds.length && i < 20; i++)
        value = await client.get(value.successorId);
      if (!mounted.current || ticket !== generation.current) return;
      if (value.id !== id) {
        if (submittedRun.current === id) submittedRun.current = value.id;
        setRun(undefined);
        setDeliveries([]);
        changeId(value.id);
        return;
      }
      setRun(value);
      const results = await Promise.all(value.deliveryIds.map((d) => client.delivery(d)));
      const prior = integrated ? (value.history ?? []).filter((entry) => entry.executionId !== value.id) : [];
      const historyKey = JSON.stringify([value.id, prior.map((entry) => entry.deliveryIds)]);
      if (historyKey !== historyLoaded.current) {
        const past = await Promise.allSettled(
          prior.flatMap((entry) =>
            entry.deliveryIds.map(async (deliveryId) => {
              const delivery = await client.delivery(deliveryId);
              return { delivery, createdAt: delivery.createdAt ?? entry.createdAt };
            }),
          ),
        );
        if (mounted.current && ticket === generation.current) {
          setPastDeliveries(past.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : [])));
          setHistoryUnavailable(past.some((item) => item.status === 'rejected'));
          historyLoaded.current = historyKey;
        }
      }
      if (mounted.current && ticket === generation.current) setDeliveries(results);
    } catch (e) {
      if (mounted.current && ticket === generation.current) fail(e);
    }
  }, [client, id, changeId, fail, integrated]);
  useEffect(() => {
    void refresh();
  }, [refresh, events.cursor]);
  const invoke = async (kind: string, body: unknown, fn: (key: string) => Promise<Execution>) => {
    if (busy) return;
    const hash = JSON.stringify({ kind, id, body });
    if (command.current?.hash !== hash) command.current = { hash, key: crypto.randomUUID() };
    setBusy(true);
    setError('');
    const epoch = navigationEpoch.current;
    const target = selectionKey?.();
    const isCurrent = () => mounted.current && epoch === navigationEpoch.current && target === selectionKey?.();
    try {
      const value = await fn(command.current.key);
      if (!isCurrent()) return;
      generation.current++;
      command.current = undefined;
      submittedRun.current = value.id;
      setRun(value);
      setDeliveries([]);
      setCorrection(undefined);
      setPaidCommand(undefined);
      setSide((old) => ({ ...old, open: false, source: null }));
      changeId(value.id);
    } catch (e) {
      if (isCurrent()) fail(e);
    } finally {
      if (mounted.current && epoch === navigationEpoch.current) setBusy(false);
    }
  };
  const start = (input: StartInput, authorization?: CommercialAuthorization) => {
    if (commercial && integrated && authorization) {
      void invoke('start', { ...input, ...authorization }, (key) =>
        client.commercialStart({ ...input, ...authorization }, key),
      );
      return;
    }
    if (commercial) {
      setPaidCommand({
        kind: 'start',
        body: input,
        send: (key, authorization) => client.commercialStart({ ...input, ...authorization }, key),
      });
      return;
    }
    void invoke('start', input, (key) => client.start(input, key));
  };
  const onAnswer = (answer: Answer) => {
    if (run) {
      if (commercial) {
        setPaidCommand({
          kind: correction ? 'correction' : 'answer',
          body: answer,
          send: (key, authorization) =>
            correction
              ? client.correct(run.id, { ...answer, ...authorization }, key)
              : client.answer(run.id, { ...answer, ...authorization }, key),
        });
        return;
      }
      void invoke(correction ? 'correction' : 'answer', answer, (key) =>
        correction ? client.correct(run.id, answer, key) : client.answer(run.id, answer, key),
      );
    }
  };
  const newWork = () => {
    resetSelection();
    changeId(null, true);
  };
  const openExecution = (next: string) => {
    if (busy || next === id) return;
    resetSelection();
    changeId(next, true);
  };
  const currentStatus = events.executionId === id && events.status ? events.status : (run?.status ?? '');
  const currentQuestion =
    correction ?? (currentStatus === 'WAITING_USER' ? (events.question ?? run?.question ?? null) : null);
  const active = ['QUEUED', 'RUNNING'].includes(currentStatus);
  const showRail = closedPilot === false && !integrated;
  useEffect(() => {
    if (authStatus !== 'authenticated' || closedPilot !== false) return;
    let active = true;
    client
      .recent(trash)
      .then((r) => active && setRecent(r.items))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, authStatus, closedPilot, id, currentStatus, trash, historyBusy]);
  const updateHistory = async (item: RecentItem, hidden: boolean) => {
    if (historyBusy) return;
    setHistoryBusy(true);
    setHistoryError('');
    const epoch = navigationEpoch.current;
    try {
      await client.setConversationHidden(item.executionId, hidden);
      setRecent((items) => items.filter((row) => row.executionId !== item.executionId));
      if (hidden && item.executionId === id && epoch === navigationEpoch.current) newWork();
      setHistoryPending(undefined);
    } catch {
      setHistoryError('Não foi possível atualizar o histórico. Tente novamente.');
    } finally {
      setHistoryBusy(false);
    }
  };
  const historyProps = {
    items: recent,
    currentId: id,
    onNew: newWork,
    onOpen: openExecution,
    trash,
    busy: busy || historyBusy,
    onTrashToggle: () => {
      setRecent([]);
      setTrash((value) => !value);
      setHistoryError('');
    },
    onHistory: (item: RecentItem, hidden: boolean) => {
      if (hidden) {
        setHistoryPending(item);
        setHistoryError('');
      } else void updateHistory(item, false);
    },
  };

  const shownError = error || events.error;
  const results = useMemo(
    () => deliveries.map((delivery) => ({ delivery, view: presentDelivery(delivery.delivery) })),
    [deliveries],
  );
  const latest = results.at(-1);
  const openedPiece = useRef<string>();
  useEffect(() => {
    if (!integrated || !isActiveSurface || denied || !run || run.id !== id || !latest || run.status !== 'COMPLETED')
      return;
    const url = editorLink(run, latest.delivery);
    if (url && openedPiece.current !== latest.delivery.id) {
      openedPiece.current = latest.delivery.id;
      onEditor(url, submittedRun.current !== run.id);
    }
  }, [integrated, isActiveSurface, denied, id, run, latest, onEditor]);
  const reevaluate = Boolean(run?.requiresReevaluation);
  // Without a result there is nothing to open: keep the lawyer's own text in view after a failure or revocation.
  const showSide = side.open || denied || (!latest && ['FAILED', 'CANCELLED'].includes(currentStatus));
  const canFollowUp = Boolean(
    run && !closedPilot && !denied && !reevaluate && !active && currentStatus === 'COMPLETED' && !correction,
  );
  const draftCandidate = deliveries.find((d) => d.draftId && d.versionId);
  if (authStatus !== 'authenticated')
    return (
      <div className="page-container py-10">
        <h1 className="font-editorial text-3xl">Trabalho</h1>
        <p>Entre na sua conta para iniciar e recuperar seu trabalho.</p>
      </div>
    );
  const landing = !run && !id;
  const paidBar = (kinds: 'start' | 'other') =>
    commercial &&
    paidCommand &&
    !denied &&
    (kinds === 'start') === (paidCommand.kind === 'start') && (
      <CommercialAuthorizationPanel
        client={client}
        busy={busy}
        onBack={() => setPaidCommand(undefined)}
        onConfirm={(authorization) =>
          void invoke(paidCommand.kind, { body: paidCommand.body, ...authorization }, (key) =>
            paidCommand.send(key, authorization),
          )
        }
      />
    );
  return (
    <div
      data-agentic-workspace
      aria-busy={busy}
      className={
        integrated
          ? 'flex h-full min-h-0 min-w-0 flex-col px-4 py-5 text-stone-800'
          : 'page-container py-8 text-stone-800'
      }
    >
      {integrated &&
        closedPilot === false &&
        historyContainer &&
        createPortal(<RecentConversations {...historyProps} expanded />, historyContainer)}
      <div
        className={
          showRail
            ? 'lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8'
            : integrated
              ? 'flex min-h-0 flex-1 flex-col'
              : ''
        }
      >
        {showRail && <RecentConversations {...historyProps} />}
        <div className={`min-w-0 space-y-4 ${integrated ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
          {integrated && closedPilot === false && (
            <button type="button" onClick={() => setHistoryOpen(true)} className="text-sm text-stone-600 lg:hidden">
              Conversas
            </button>
          )}
          {historyOpen && (
            <CanvasDialog title="Conversas" onClose={() => setHistoryOpen(false)}>
              <RecentConversations
                {...historyProps}
                expanded
                items={recent}
                currentId={id}
                onNew={() => {
                  newWork();
                  setHistoryOpen(false);
                }}
                onOpen={(next) => {
                  openExecution(next);
                  setHistoryOpen(false);
                }}
              />
            </CanvasDialog>
          )}
          {historyError && !historyPending && <p role="alert">{historyError}</p>}
          {historyPending && (
            <CanvasDialog
              title="Excluir conversa do histórico?"
              onClose={() => {
                if (!historyBusy) setHistoryPending(undefined);
              }}
            >
              <p className="text-sm text-stone-600">
                Você poderá restaurá-la em Conversas excluídas. As peças e os recibos serão preservados. Isso não
                cancela um trabalho em andamento.
              </p>
              <p className="my-4 font-medium">{historyPending.title}</p>
              {historyError && <p role="alert">{historyError}</p>}
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  disabled={historyBusy}
                  className="btn-secondary"
                  onClick={() => setHistoryPending(undefined)}
                >
                  Manter conversa
                </button>
                <button
                  type="button"
                  disabled={historyBusy}
                  className="btn-primary"
                  onClick={() => void updateHistory(historyPending, true)}
                >
                  Excluir do histórico
                </button>
              </div>
            </CanvasDialog>
          )}
          <header
            className={
              landing && guidance.id
                ? 'sr-only'
                : landing
                  ? 'mx-auto w-full max-w-3xl pt-8'
                  : 'mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3'
            }
          >
            {landing && guidance.id ? (
              <h1 className="sr-only">Mesa Jurídica</h1>
            ) : landing ? (
              <>
                <h1 className="font-editorial text-3xl font-medium text-stone-900">O que você precisa fazer hoje?</h1>
                <p className="mt-2 text-stone-600">
                  Descreva o que precisa preparar ou mudar. A peça fica aberta ao lado da conversa.
                </p>
              </>
            ) : (
              <>
                <h1 className="font-editorial text-xl text-stone-900">Trabalho</h1>
                <span className="grow" />
                <button
                  type="button"
                  className={`btn-secondary min-h-11 ${showRail || integrated ? 'lg:hidden' : ''}`}
                  disabled={busy}
                  onClick={newWork}
                >
                  Nova conversa
                </button>
              </>
            )}
          </header>
          <p
            role="status"
            aria-label="Andamento"
            aria-live="polite"
            className={active || shownError ? 'text-sm text-stone-600' : 'sr-only'}
          >
            {statusText(currentStatus, shownError)}
          </p>
          {integrated && showSide && !side.open && (
            <button
              className="text-sm underline"
              type="button"
              onClick={() => setSide((old) => ({ ...old, open: true }))}
            >
              Ver contexto preservado
            </button>
          )}
          {shownError && (
            <p role="alert" className="break-words rounded-xl border border-amber-300 bg-amber-50 p-4">
              {statusText('FAILED', shownError)}{' '}
              {!shownError.match(
                /ACCESS|BUDGET|BALANCE|FUNDS|NOT_FOUND|APPROVED_|COMMERCIAL_(DAILY|MONTHLY|EXECUTION_ACTIVE|POLICY)/,
              ) && 'O serviço está indisponível. Seu pedido permanece nesta tela.'}
            </p>
          )}
          {closedPilot && (
            <ClosedPilotPanel
              client={client}
              executionId={run?.id}
              refreshKey={`${currentStatus}:${events.cursor}`}
              active={active || currentStatus === 'WAITING_USER'}
              onStarted={(execution) => {
                submittedRun.current = execution.id;
                setRun(execution);
                setDeliveries([]);
                changeId(execution.id);
              }}
            />
          )}
          {closedPilot === false && landing && (
            <div
              className={`mx-auto w-full max-w-3xl space-y-4 ${guidance.id ? 'min-h-0 overflow-y-auto px-1 pb-3' : ''}`}
            >
              {guidance.id && (
                <GuidancePanel
                  guidance={guidance}
                  field={guidanceField}
                  blocked={busy || Boolean(paidCommand)}
                  onEdit={(field) =>
                    setEditGuidance(
                      field && guidance.state
                        ? { field, id: guidance.state.conversationId, revision: guidance.state.contextRevision }
                        : undefined,
                    )
                  }
                />
              )}
              <Composer
                key={navigationEpoch.current}
                client={client}
                piece={piece}
                piecePending={piecePending}
                request={request}
                actions={actions}
                commercial={commercial}
                authorizeOnSend={integrated}
                busy={busy || Boolean(paidCommand)}
                available={isActiveSurface && available}
                onFail={fail}
                onSubmit={start}
                onGuide={integrated && guidanceEnabled ? guidance.start : undefined}
                guidanceId={guidance.id}
                guidanceState={guidance.state}
                guidanceBusy={guidance.busy}
                guidanceEditing={Boolean(guidanceField)}
                guidanceError={!guidance.id ? guidance.feedback : undefined}
              />
              {paidBar('start')}
            </div>
          )}
          {run && (
            <div
              className={`${integrated ? 'min-h-0 flex-1' : ''} grid gap-6 ${showSide && !integrated ? 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]' : ''}`}
            >
              <div className={`mx-auto w-full min-w-0 max-w-3xl ${integrated ? 'flex min-h-0 flex-col' : 'space-y-5'}`}>
                <div
                  ref={transcript}
                  data-chat-transcript
                  className={`space-y-5 ${integrated ? 'min-h-0 flex-1 overflow-y-auto pr-1' : ''}`}
                >
                  {reevaluate && (
                    <div
                      role="status"
                      aria-label="Reavaliação necessária"
                      className="rounded-xl border border-amber-300 bg-amber-50 p-4"
                    >
                      <p>Este resultado foi feito com uma versão anterior do contexto e precisa ser refeito.</p>
                      {run.currentExecutionId && run.currentExecutionId !== run.id && (
                        <a
                          className="inline-flex min-h-11 items-center underline"
                          href={`/app/trabalho?executionId=${encodeURIComponent(run.currentExecutionId)}`}
                        >
                          Abrir o resultado atual
                        </a>
                      )}
                    </div>
                  )}
                  {integrated && !denied && historyUnavailable && (
                    <p className="text-xs text-stone-600">Algumas respostas anteriores estão indisponíveis.</p>
                  )}
                  <Conversation
                    deliveries={
                      integrated && !denied
                        ? pastDeliveries.map(({ delivery, createdAt }) => ({
                            id: delivery.id,
                            createdAt,
                            content: (
                              <article
                                className="rounded-xl border border-stone-200 bg-white p-4"
                                aria-label="Resposta anterior"
                              >
                                {delivery.delivery.document ? (
                                  <p>A peça “{delivery.delivery.document.title}” foi preparada nesta conversa.</p>
                                ) : (
                                  presentDelivery(delivery.delivery).blocks.map((block, index) => (
                                    <p key={index} className="mb-2 whitespace-pre-wrap text-sm leading-7">
                                      {block.text}
                                    </p>
                                  ))
                                )}
                              </article>
                            ),
                          }))
                        : []
                    }
                    question={closedPilot || denied || reevaluate ? null : currentQuestion}
                    messages={run.messages}
                    busy={busy || Boolean(paidCommand)}
                    onAnswer={onAnswer}
                    onCorrect={
                      !closedPilot && !active && !reevaluate && !run.successorId && currentStatus === 'COMPLETED'
                        ? (q) => {
                            if (!busy && !paidCommand) setCorrection({ ...q, contextRevision: run.contextRevision });
                          }
                        : undefined
                    }
                  />
                  {paidBar('other')}
                  {active && (
                    <div role="status" className="flex items-center gap-3 text-stone-600">
                      <span aria-hidden="true" className="inline-flex gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cognac-700" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cognac-700 [animation-delay:200ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cognac-700 [animation-delay:400ms]" />
                      </span>
                      <span>
                        {run.cancelRequested
                          ? 'Cancelando assim que a etapa em andamento terminar…'
                          : 'Trabalhando no seu pedido…'}
                      </span>
                      <button
                        type="button"
                        className="ml-auto min-h-11 px-3 text-sm text-cognac-700 underline"
                        disabled={busy || Boolean(run.cancelRequested)}
                        onClick={() => void invoke('cancel', {}, (key) => client.cancel(run.id, key))}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {events.reconciliation && (
                    <p role="status">
                      O trabalho precisa de conferência antes de outra tentativa. O consumo eventualmente ocorrido não é
                      repetido automaticamente.
                    </p>
                  )}
                  {!denied &&
                    !busy &&
                    results.map(({ delivery, view }) => (
                      <ResultCard
                        key={delivery.id}
                        compact={integrated}
                        run={run}
                        delivery={delivery}
                        view={view}
                        activeSource={side.open && latest?.delivery.id === delivery.id ? side.source : null}
                        onSource={(n) => setSide({ open: true, tab: 'sources', source: n })}
                        onPending={() => setSide({ open: true, tab: 'pending', source: null })}
                        onSources={() => setSide({ open: true, tab: 'sources', source: null })}
                        onEditor={onEditor}
                        receipt={
                          commercial && delivery.id === latest?.delivery.id ? (
                            <CommercialReceiptPanel
                              client={client}
                              executionId={run.id}
                              refreshKey={`${currentStatus}:${events.cursor}`}
                            />
                          ) : undefined
                        }
                      />
                    ))}
                  {commercial && !denied && !results.length && !active && (
                    <CommercialReceiptPanel
                      client={client}
                      executionId={run.id}
                      refreshKey={`${currentStatus}:${events.cursor}`}
                    />
                  )}
                  {!closedPilot &&
                    ['FAILED', 'CANCELLED'].includes(currentStatus) &&
                    !reevaluate &&
                    !denied &&
                    !events.reconciliation && (
                      <button
                        className="btn-primary min-h-11"
                        disabled={busy || Boolean(paidCommand)}
                        onClick={() =>
                          commercial
                            ? setPaidCommand({
                                kind: 'continue',
                                body: {},
                                send: (key, authorization) => client.continue(run.id, key, authorization),
                              })
                            : void invoke('continue', {}, (key) => client.continue(run.id, key))
                        }
                      >
                        Continuar trabalho
                      </button>
                    )}
                  {run.matterId && !denied && !closedPilot && !active && !canFollowUp && (
                    <EvidenceChangesPanel key={run.matterId} matterId={run.matterId} disabled={busy} />
                  )}
                </div>
                {canFollowUp && (
                  <div className="shrink-0 space-y-4 pt-3">
                    <Composer
                      key={`${navigationEpoch.current}:${run.id}:${run.contextRevision}`}
                      client={client}
                      piece={piece}
                      piecePending={piecePending}
                      request={request}
                      actions={actions}
                      commercial={commercial}
                      authorizeOnSend={integrated}
                      busy={busy || Boolean(paidCommand)}
                      available={isActiveSurface && available}
                      followUp={{
                        conversationId: run.conversationId,
                        contextRevision: run.contextRevision,
                        text: run.context.text,
                        matterId: run.matterId,
                        documents: run.context.documents,
                        draft: run.context.draft,
                        draftCandidate: draftCandidate
                          ? { draftId: draftCandidate.draftId!, versionId: draftCandidate.versionId! }
                          : undefined,
                      }}
                      onFail={fail}
                      onSubmit={start}
                    />
                    {paidBar('start')}
                  </div>
                )}
              </div>
              {showSide && (!integrated || side.open) && (
                <SupportingSurface
                  modal={integrated}
                  onClose={() => setSide((old) => ({ ...old, open: false, source: null }))}
                >
                  <SideTable
                    tab={side.tab}
                    onTab={(tab) => setSide((old) => ({ ...old, tab }))}
                    onClose={() => setSide((old) => ({ ...old, open: false, source: null }))}
                    view={denied ? undefined : latest?.view}
                    activeSource={side.source}
                    run={run}
                    context={denied ? { text: run.context.text, origin: 'USER', documents: [] } : run.context}
                    titles={denied ? {} : titles}
                    onRead={(source) => {
                      setSide((old) => ({ ...old, open: false, source: null }));
                      setReading(source);
                    }}
                    onEditor={(url) => {
                      setSide((old) => ({ ...old, open: false, source: null }));
                      onEditor(url);
                    }}
                    contextOnly={denied || !latest}
                  />
                </SupportingSurface>
              )}
            </div>
          )}
          {reading && !denied && (
            <DocumentReaderDialog source={reading} token="" onClose={() => setReading(undefined)} />
          )}
        </div>
      </div>
    </div>
  );
}
