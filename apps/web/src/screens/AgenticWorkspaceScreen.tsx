import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceClient } from '../agentic-workspace/client';
import { ActionEntry } from '../agentic-workspace/ActionEntry';
import { GuidedDialogue } from '../agentic-workspace/GuidedDialogue';
import { ContextSummary, SourceReferences } from '../agentic-workspace/ContextSummary';
import { DeliveryActions } from '../agentic-workspace/DeliveryActions';
import { ClosedPilotPanel } from '../agentic-workspace/ClosedPilotPanel';
import { useExecutionEvents } from '../agentic-workspace/use-execution-events';
import {
  statusText,
  type ActionId,
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
  const [entry, setEntry] = useState(!id),
    [objective, setObjective] = useState(''),
    [action, setAction] = useState<ActionId>(),
    [scope, setScope] = useState(false);
  const [entryDraft, setEntryDraft] = useState({ text: '', purpose: '' });
  const surface = useRef(isActiveSurface),
    navigationEpoch = useRef(0);
  surface.current = isActiveSurface;
  const [text, setText] = useState(''),
    [matter, setMatter] = useState(''),
    [matters, setMatters] = useState<{ id: string; title: string }[]>([]);
  const [documents, setDocuments] = useState<{ id: string; title: string; versionId: string }[]>([]),
    [selected, setSelected] = useState<{ documentId: string; versionId: string }[]>([]);
  const [drafts, setDrafts] = useState<{ id: string; title: string; currentVersionId: string }[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<{ draftId: string; versionId: string }>();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [reading, setReading] = useState<DocumentSource>(),
    [correction, setCorrection] = useState<Question>();
  const generation = useRef(0),
    command = useRef<{ hash: string; key: string }>(),
    mounted = useRef(true);
  const events = useExecutionEvents(client, id);
  const denied = /ACCESS_REVOKED|UNAUTHENTICATED|NOT_FOUND/.test(error || events.error);
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
  const fail = (e: unknown) => setError(e instanceof ApiRequestError ? e.code : 'EXECUTION_UNAVAILABLE');
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
        }
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [client, authStatus]);
  useEffect(() => {
    const sync = () => {
      if (window.location.pathname === '/app/trabalho') {
        const next = initialId();
        if (next !== id) {
          navigationEpoch.current++;
          setId(next);
          setEntry(!next);
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
      if (!entry) {
        setText(value.context.text);
        setMatter(value.matterId ?? '');
        setSelected(value.context.documents);
        setSelectedDraft(value.context.draft);
      }
      const results = await Promise.all(value.deliveryIds.map((d) => client.delivery(d)));
      if (mounted.current && ticket === generation.current) setDeliveries(results);
    } catch (e) {
      if (mounted.current && ticket === generation.current) fail(e);
    }
  }, [client, id, entry, changeId]);
  useEffect(() => {
    void refresh();
  }, [refresh, events.cursor]);
  useEffect(() => {
    let active = true;
    setDocuments([]);
    setDrafts([]);
    if (!scope) return;
    requestApi<{ items: { id: string; title: string }[] }>('/api/v2/matters', {}, { sessionOnly: true })
      .then((r) => {
        if (active) setMatters(r.items);
      })
      .catch(() => {
        /* Case is optional; written context remains available. */
      });
    if (!matter)
      return () => {
        active = false;
      };
    requestApi<{ items: { id: string; title: string; currentVersionId: string }[] }>(
      `/api/v2/matters/${encodeURIComponent(matter)}/drafts`,
      {},
      { sessionOnly: true },
    )
      .then((r) => {
        if (active) setDrafts(r.items.filter((d) => d.currentVersionId));
      })
      .catch((e) => {
        if (active) fail(e);
      });
    requestApi<{ documents: { id: string; title: string; lifecycleState?: string }[] }>(
      `/api/v2/matters/${encodeURIComponent(matter)}`,
      {},
      { sessionOnly: true },
    )
      .then(async (r) => {
        const availableDocs = await Promise.all(
          r.documents
            .filter((d) => !d.lifecycleState || d.lifecycleState === 'ACTIVE')
            .slice(0, 100)
            .map(async (d) => {
              const bundle = await requestApi<{ version: { id: string } }>(
                `/api/v2/matters/${encodeURIComponent(matter)}/documents/${encodeURIComponent(d.id)}`,
                {},
                { sessionOnly: true },
              );
              return { id: d.id, title: d.title, versionId: bundle.version.id };
            }),
        );
        if (active) setDocuments(availableDocs);
      })
      .catch((e) => {
        if (active) fail(e);
      });
    return () => {
      active = false;
    };
  }, [matter, scope]);
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
      setEntry(false);
      setScope(false);
      setCorrection(undefined);
      changeId(value.id);
    } catch (e) {
      if (mounted.current && epoch === navigationEpoch.current) fail(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const begin = () => {
    const context = {
      text,
      origin: selected.length ? (text.trim() ? ('MIXED' as const) : ('DOCUMENT' as const)) : ('USER' as const),
      documents: selected,
      ...(selectedDraft ? { draft: selectedDraft } : {}),
    };
    const input = {
      objective,
      ...(action ? { actionId: action } : {}),
      ...(run ? { conversationId: run.conversationId, contextRevision: run.contextRevision } : {}),
      ...(matter ? { matterId: matter } : {}),
      context,
    };
    void invoke('start', input, (key) => client.start(input, key));
  };
  const onAnswer = (answer: Answer) => {
    if (run)
      void invoke(correction ? 'correction' : 'answer', answer, (key) =>
        correction ? client.correct(run.id, answer, key) : client.answer(run.id, answer, key),
      );
  };
  const followUp = (next?: ActionId) => {
    setEntryDraft({ text: '', purpose: '' });
    setAction(next);
    setObjective('');
    setEntry(true);
    setScope(false);
    setText(run?.context.text ?? text);
    setMatter(run?.matterId ?? matter);
    setSelected(run?.context.documents ?? selected);
    const candidate = next === 'review_text' ? deliveries.find((d) => d.draftId && d.versionId) : undefined;
    setSelectedDraft(candidate ? { draftId: candidate.draftId!, versionId: candidate.versionId! } : run?.context.draft);
  };
  const currentStatus = events.executionId === id && events.status ? events.status : (run?.status ?? '');
  const currentQuestion =
    correction ?? (currentStatus === 'WAITING_USER' ? (events.question ?? run?.question ?? null) : null);
  const active = ['QUEUED', 'RUNNING'].includes(currentStatus);
  if (authStatus !== 'authenticated')
    return (
      <div className="page-container py-10">
        <h1 className="font-editorial text-3xl">Trabalho</h1>
        <p>Entre na sua conta para iniciar e recuperar seu trabalho.</p>
      </div>
    );
  return (
    <div data-agentic-workspace aria-busy={busy} className="page-container max-w-5xl space-y-6 py-8 text-stone-800">
      <header>
        <p className="eyebrow">ForgeLex</p>
        <h1 className="font-editorial text-3xl font-bold">Trabalho</h1>
        <p className="mt-2 text-stone-600">Da necessidade à entrega, com contexto e fontes para conferir.</p>
      </header>
      <p role="status" aria-label="Andamento" aria-live="polite">
        {statusText(currentStatus, error || events.error)}
      </p>
      {(error || events.error) && (
        <p role="alert" className="break-words rounded-xl border border-amber-300 bg-amber-50 p-4">
          {statusText('FAILED', error || events.error)}{' '}
          {!(error || events.error).match(/ACCESS|BUDGET|BALANCE|FUNDS|NOT_FOUND/) &&
            'O serviço está indisponível. Seu pedido permanece nesta tela.'}
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
            setEntry(false);
            setScope(false);
          }}
        />
      )}
      {closedPilot === false && entry && !scope && (
        <ActionEntry
          key={`${run?.id ?? 'new'}:${action ?? 'free'}`}
          initialAction={action}
          initialText={entryDraft.text}
          initialPurpose={entryDraft.purpose}
          actions={actions}
          busy={busy}
          onPrepare={(goal, next, draft) => {
            setEntryDraft(draft);
            setObjective(goal);
            setAction(next);
            setScope(true);
          }}
        />
      )}
      {closedPilot === false && entry && scope && (
        <section
          aria-label="Escopo do trabalho"
          className="space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6"
        >
          <h2 className="font-editorial text-xl">Conferir escopo</h2>
          <p className="whitespace-pre-wrap break-words">{objective}</p>
          <label className="block">
            Contexto escrito
            <textarea
              maxLength={64000}
              rows={5}
              className="mt-2 w-full rounded-lg border p-3"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label className="block">
            Caso (opcional)
            <select
              disabled={Boolean(run)}
              className="mt-2 min-h-11 w-full rounded-lg border p-2"
              value={matter}
              onChange={(e) => {
                setMatter(e.target.value);
                setSelected([]);
                setSelectedDraft(undefined);
              }}
            >
              <option value="">Sem caso — somente texto</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          {matter && (
            <label className="block">
              Minuta do caso (opcional)
              <select
                className="mt-2 min-h-11 w-full rounded-lg border p-2"
                value={selectedDraft ? `${selectedDraft.draftId}:${selectedDraft.versionId}` : ''}
                onChange={(e) => {
                  const d = drafts.find((d) => `${d.id}:${d.currentVersionId}` === e.target.value);
                  setSelectedDraft(d ? { draftId: d.id, versionId: d.currentVersionId } : undefined);
                }}
              >
                <option value="">Sem minuta selecionada</option>
                {selectedDraft &&
                  !drafts.some(
                    (d) => d.id === selectedDraft.draftId && d.currentVersionId === selectedDraft.versionId,
                  ) && (
                    <option value={`${selectedDraft.draftId}:${selectedDraft.versionId}`}>
                      Versão anterior selecionada — confira a versão atual
                    </option>
                  )}
                {drafts.map((d) => (
                  <option key={d.id} value={`${d.id}:${d.currentVersionId}`}>
                    {d.title} · versão {d.currentVersionId.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!!documents.length && (
            <fieldset>
              <legend className="font-medium">Documentos autorizados para este trabalho</legend>
              {documents.map((d) => (
                <label className="flex min-h-11 items-center gap-3 break-words" key={d.id}>
                  <input
                    type="checkbox"
                    checked={selected.some((s) => s.documentId === d.id)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelected((old) =>
                        checked
                          ? [...old.filter((s) => s.documentId !== d.id), { documentId: d.id, versionId: d.versionId }]
                          : old.filter((s) => s.documentId !== d.id),
                      );
                    }}
                  />
                  {d.title}
                </label>
              ))}
            </fieldset>
          )}
          <p className="text-sm text-stone-600">
            Serão usados o texto e os documentos selecionados. Novas entregas são preliminares. Uso pago exige
            autorização e orçamento próprios; esta tela não os concede.
          </p>
          {!available && <p>O processamento deste trabalho ainda não está disponível.</p>}
          <button className="btn-primary min-h-11" disabled={busy || !available} onClick={begin}>
            Executar trabalho
          </button>
          <details>
            <summary className="min-h-11 cursor-pointer">Mais opções</summary>
            <button className="min-h-11 underline" onClick={() => setScope(false)}>
              Rever pedido
            </button>
          </details>
        </section>
      )}
      {run && !entry && (
        <>
          {run.requiresReevaluation && (
            <div
              role="status"
              aria-label="Reavaliação necessária"
              className="rounded-xl border border-amber-300 bg-amber-50 p-4"
            >
              <p>Esta entrega usa uma revisão anterior do contexto e precisa de reavaliação.</p>
              {run.currentExecutionId && run.currentExecutionId !== run.id && (
                <a
                  className="inline-flex min-h-11 items-center underline"
                  href={`/app/trabalho?executionId=${encodeURIComponent(run.currentExecutionId)}`}
                >
                  Abrir trabalho atual
                </a>
              )}
            </div>
          )}
          <h2 className="break-words font-editorial text-xl">{run.objective}</h2>
          <GuidedDialogue
            question={closedPilot || denied || run.requiresReevaluation ? null : currentQuestion}
            messages={run.messages}
            busy={busy}
            onAnswer={onAnswer}
            onCorrect={
              !closedPilot && !active && !run.requiresReevaluation && !run.successorId && currentStatus === 'COMPLETED'
                ? (q) => setCorrection({ ...q, contextRevision: run.contextRevision })
                : undefined
            }
          />
          {!denied && !!run.history?.length && (
            <details>
              <summary className="min-h-11 cursor-pointer">Entregas anteriores</summary>
              <ul>
                {run.history.map((h) => (
                  <li key={h.executionId}>
                    <a
                      className="inline-flex min-h-11 items-center underline"
                      href={`/app/trabalho?executionId=${encodeURIComponent(h.executionId)}`}
                    >
                      Entrega de {new Date(h.createdAt).toLocaleString('pt-BR')}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!denied &&
            !busy &&
            deliveries.map((d) => (
              <article
                key={d.id}
                data-delivery-id={d.id}
                aria-label="Entrega preliminar"
                className="space-y-5 rounded-2xl border border-stone-200 bg-white p-4 sm:p-6"
              >
                <h2 className="font-editorial text-2xl">
                  {d.delivery.document?.title ??
                    (d.delivery.status === 'LIMITED' ? 'Análise de lacunas e limites' : 'Entrega preliminar')}
                </h2>
                <p className="text-sm text-amber-900">
                  Avaliação jurídica pendente. Confira fontes e lacunas antes de utilizar.
                </p>
                {d.delivery.document ? (
                  d.delivery.document.sections.map((s, i) => (
                    <section key={i} className="space-y-2 break-words">
                      <h3 className="font-semibold">{s.title}</h3>
                      <p className="whitespace-pre-wrap leading-relaxed">{s.content}</p>
                      <SourceReferences
                        label="Fontes da seção"
                        sourceIds={s.sourceIds}
                        sources={d.delivery.sources}
                        matterId={run.matterId}
                        onRead={setReading}
                      />
                    </section>
                  ))
                ) : (
                  <>
                    <ul className="space-y-2">
                      {d.delivery.issues.map((i) => (
                        <li key={i.id}>
                          {i.statement}
                          <SourceReferences
                            label="Fontes da questão"
                            sourceIds={i.sourceIds}
                            sources={d.delivery.sources}
                            matterId={run.matterId}
                            onRead={setReading}
                          />
                        </li>
                      ))}
                    </ul>
                    <ul className="space-y-2">
                      {d.delivery.claims.map((c) => (
                        <li key={c.id} className="break-words">
                          {c.classification === 'ALLEGATION'
                            ? 'Alegação'
                            : c.classification === 'CONFLICT'
                              ? 'Conflito'
                              : 'Inferência'}
                          : {c.statement}
                          <SourceReferences
                            label="Fontes da afirmação"
                            sourceIds={c.sourceIds}
                            sources={d.delivery.sources}
                            matterId={run.matterId}
                            onRead={setReading}
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <details>
                  <summary className="min-h-11 cursor-pointer">Observações para conferência</summary>
                  <ul className="space-y-2 break-words">
                    {d.delivery.findings.map((f) => (
                      <li key={f.id}>
                        {f.statement}
                        <SourceReferences
                          label="Fontes da observação"
                          sourceIds={f.sourceIds}
                          sources={d.delivery.sources}
                          matterId={run.matterId}
                          onRead={setReading}
                        />
                      </li>
                    ))}
                    {d.delivery.requirements.map((r) => (
                      <li key={r.id}>
                        {r.verified ? 'Requisito candidato' : 'Requisito não verificado'}: {r.statement}
                        <SourceReferences
                          label="Fontes do requisito"
                          sourceIds={r.sourceIds}
                          sources={d.delivery.sources}
                          matterId={run.matterId}
                          onRead={setReading}
                        />
                      </li>
                    ))}
                  </ul>
                </details>
                {!run.requiresReevaluation && (
                  <DeliveryActions
                    run={run}
                    delivery={d}
                    onFollowUp={followUp}
                    onEditor={onEditor}
                    allowFollowUp={!closedPilot}
                  />
                )}
              </article>
            ))}
          <ContextSummary
            context={denied ? { text: run.context.text, origin: 'USER', documents: [] } : run.context}
            matterId={run.matterId}
            executionId={run.id}
            onEditor={onEditor}
            sources={
              denied
                ? []
                : deliveries
                    .flatMap((d) => d.delivery.sources)
                    .filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i)
            }
            onRead={setReading}
          />
          {closedPilot && currentQuestion && (
            <p>Permanece uma lacuna neste exemplo: {currentQuestion.prompt} Nenhuma resposta foi presumida.</p>
          )}
          {(active || (closedPilot && currentStatus === 'WAITING_USER')) && (
            <details>
              <summary className="min-h-11 cursor-pointer">Mais opções</summary>
              <button
                className="min-h-11 underline"
                disabled={busy}
                onClick={() => void invoke('cancel', {}, (key) => client.cancel(run.id, key))}
              >
                Interromper processamento
              </button>
            </details>
          )}
          {events.reconciliation && (
            <p role="status">
              A execução precisa de conferência antes de outra tentativa. O consumo eventualmente ocorrido não é
              repetido automaticamente.
            </p>
          )}
          {!closedPilot &&
            ['FAILED', 'CANCELLED'].includes(currentStatus) &&
            !run.requiresReevaluation &&
            !denied &&
            !events.reconciliation && (
              <button
                className="btn-primary min-h-11"
                disabled={busy}
                onClick={() => void invoke('continue', {}, (key) => client.continue(run.id, key))}
              >
                Continuar trabalho
              </button>
            )}
        </>
      )}
      {reading && !denied && <DocumentReaderDialog source={reading} token="" onClose={() => setReading(undefined)} />}
    </div>
  );
}
