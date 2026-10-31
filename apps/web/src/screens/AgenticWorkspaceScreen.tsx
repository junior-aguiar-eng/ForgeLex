import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '../api-client';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceClient, type StartInput } from '../agentic-workspace/client';
import { Composer } from '../agentic-workspace/Composer';
import { Conversation } from '../agentic-workspace/Conversation';
import { ResultCard } from '../agentic-workspace/ResultCard';
import { SideTable, type SideTab } from '../agentic-workspace/SideTable';
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

const initialId = () => new URLSearchParams(window.location.search).get('executionId');
export function AgenticWorkspaceScreen({
  onEditor,
  active: isActiveSurface,
  onExecutionChange,
}: {
  onEditor: (url: string) => void;
  active: boolean;
  onExecutionChange: (id: string | null) => void;
}) {
  const { status: authStatus } = useAuth();
  const client = useMemo(() => new WorkspaceClient(), []);
  const [id, setId] = useState<string | null>(initialId),
    [run, setRun] = useState<Execution>(),
    [actions, setActions] = useState<PublicAction[]>([]);
  const [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [closedPilot, setClosedPilot] = useState<boolean>();
  const [commercial, setCommercial] = useState(false);
  const [paidCommand, setPaidCommand] = useState<{
    kind: string;
    body: unknown;
    send: (key: string, authorization: CommercialAuthorization) => Promise<Execution>;
  }>();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [reading, setReading] = useState<DocumentSource>(),
    [correction, setCorrection] = useState<Question>();
  const [side, setSide] = useState<{ open: boolean; tab: SideTab; source: number | null }>({
    open: false,
    tab: 'sources',
    source: null,
  });
  const surface = useRef(isActiveSurface),
    navigationEpoch = useRef(0);
  surface.current = isActiveSurface;
  const generation = useRef(0),
    command = useRef<{ hash: string; key: string }>(),
    mounted = useRef(true);
  const events = useExecutionEvents(client, id);
  const denied = /ACCESS_REVOKED|UNAUTHENTICATED|NOT_FOUND/.test(error || events.error);
  const titles = useDocumentTitles(run?.matterId ?? null, Boolean(run) && !denied);
  const changeId = useCallback(
    (next: string) => {
      setId(next);
      onExecutionChange(next);
      if (!surface.current || window.location.pathname !== '/app/trabalho') return;
      const url = new URL(window.location.href);
      url.pathname = '/app/trabalho';
      url.search = '';
      url.searchParams.set('executionId', next);
      window.history.replaceState({}, '', url);
    },
    [onExecutionChange],
  );
  useEffect(() => {
    onExecutionChange(id);
  }, [id, onExecutionChange]);
  useEffect(() => {
    if (isActiveSurface && id && window.location.pathname === '/app/trabalho' && !initialId()) changeId(id);
  }, [isActiveSurface, id, changeId]);
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
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [client, authStatus, fail]);
  useEffect(() => {
    const sync = () => {
      if (window.location.pathname === '/app/trabalho') {
        const next = initialId();
        if (next !== id) {
          navigationEpoch.current++;
          setId(next);
          if (!next) setRun(undefined);
          setPaidCommand(undefined);
        }
      }
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [id]);
  const refresh = useCallback(async () => {
    if (!id) return;
    const ticket = ++generation.current;
    try {
      let value = await client.get(id);
      for (let i = 0; value.successorId && !value.deliveryIds.length && i < 20; i++)
        value = await client.get(value.successorId);
      if (!mounted.current || ticket !== generation.current) return;
      if (value.id !== id) {
        changeId(value.id);
        return;
      }
      setRun(value);
      const results = await Promise.all(value.deliveryIds.map((d) => client.delivery(d)));
      if (mounted.current && ticket === generation.current) setDeliveries(results);
    } catch (e) {
      if (mounted.current && ticket === generation.current) fail(e);
    }
  }, [client, id, changeId, fail]);
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
    try {
      const value = await fn(command.current.key);
      if (!mounted.current || epoch !== navigationEpoch.current) return;
      command.current = undefined;
      setRun(value);
      setDeliveries([]);
      setCorrection(undefined);
      setPaidCommand(undefined);
      setSide((old) => ({ ...old, open: false, source: null }));
      changeId(value.id);
    } catch (e) {
      if (mounted.current && epoch === navigationEpoch.current) fail(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const start = (input: StartInput) => {
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
    navigationEpoch.current++;
    generation.current++;
    command.current = undefined;
    setId(null);
    setRun(undefined);
    setDeliveries([]);
    setCorrection(undefined);
    setPaidCommand(undefined);
    setError('');
    setSide({ open: false, tab: 'sources', source: null });
    onExecutionChange(null);
    if (surface.current && window.location.pathname === '/app/trabalho')
      window.history.replaceState({}, '', '/app/trabalho');
  };
  const currentStatus = events.executionId === id && events.status ? events.status : (run?.status ?? '');
  const currentQuestion =
    correction ?? (currentStatus === 'WAITING_USER' ? (events.question ?? run?.question ?? null) : null);
  const active = ['QUEUED', 'RUNNING'].includes(currentStatus);
  const shownError = error || events.error;
  const results = useMemo(
    () => deliveries.map((delivery) => ({ delivery, view: presentDelivery(delivery.delivery) })),
    [deliveries],
  );
  const latest = results.at(-1);
  const reevaluate = Boolean(run?.requiresReevaluation);
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
    <div data-agentic-workspace aria-busy={busy} className="page-container space-y-6 py-8 text-stone-800">
      <header
        className={
          landing ? 'mx-auto w-full max-w-3xl pt-8' : 'mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3'
        }
      >
        {landing ? (
          <>
            <h1 className="font-editorial text-4xl font-medium text-stone-900">O que você precisa fazer hoje?</h1>
            <p className="mt-2 text-stone-600">
              Descreva em suas palavras. O agente lê o caso, pergunta o que faltar e entrega um texto com as fontes.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-editorial text-xl text-stone-900">Trabalho</h1>
            <span className="grow" />
            {run && (
              <button
                type="button"
                className="min-h-11 px-3 text-sm text-cognac-700 underline"
                onClick={() => setSide({ open: true, tab: 'context', source: null })}
              >
                Contexto do trabalho
              </button>
            )}
            <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={newWork}>
              Novo trabalho
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
      {shownError && (
        <p role="alert" className="break-words rounded-xl border border-amber-300 bg-amber-50 p-4">
          {statusText('FAILED', shownError)}{' '}
          {!shownError.match(
            /ACCESS|BUDGET|BALANCE|FUNDS|NOT_FOUND|COMMERCIAL_(DAILY|MONTHLY|EXECUTION_ACTIVE|POLICY)/,
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
            setRun(execution);
            setDeliveries([]);
            changeId(execution.id);
          }}
        />
      )}
      {closedPilot === false && landing && (
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <Composer
            client={client}
            actions={actions}
            commercial={commercial}
            busy={busy || Boolean(paidCommand)}
            available={available}
            onFail={fail}
            onSubmit={start}
          />
          {paidBar('start')}
        </div>
      )}
      {run && (
        <div className={`grid gap-6 ${side.open ? 'lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]' : ''}`}>
          <div className="mx-auto w-full min-w-0 max-w-3xl space-y-5">
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
            <Conversation
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
                <span>Trabalhando no seu pedido…</span>
                <button
                  type="button"
                  className="ml-auto min-h-11 px-3 text-sm text-cognac-700 underline"
                  disabled={busy}
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
            {canFollowUp && (
              <div className="space-y-4 pt-2">
                <Composer
                  key={`${run.id}:${run.contextRevision}`}
                  client={client}
                  actions={actions}
                  commercial={commercial}
                  busy={busy || Boolean(paidCommand)}
                  available={available}
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
          {side.open && (
            <SideTable
              tab={side.tab}
              onTab={(tab) => setSide((old) => ({ ...old, tab }))}
              onClose={() => setSide((old) => ({ ...old, open: false, source: null }))}
              view={denied ? undefined : latest?.view}
              activeSource={side.source}
              run={run}
              context={denied ? { text: run.context.text, origin: 'USER', documents: [] } : run.context}
              titles={denied ? {} : titles}
              onRead={setReading}
              onEditor={onEditor}
              contextOnly={denied}
            />
          )}
        </div>
      )}
      {reading && !denied && <DocumentReaderDialog source={reading} token="" onClose={() => setReading(undefined)} />}
    </div>
  );
}
