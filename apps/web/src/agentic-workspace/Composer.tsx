import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../api-client';
import type { WorkspaceClient, StartInput } from './client';
import { reais, type CommercialQuote } from './commercial-model';
import type { ActionId, Context, PublicAction } from './execution-model';

export interface ComposerFollowUp {
  conversationId: string;
  contextRevision: number;
  text: string;
  matterId: string | null;
  documents: Context['documents'];
  draft?: Context['draft'];
  /** The draft this result produced; offered when the next action is a review of it. */
  draftCandidate?: Context['draft'];
  action?: ActionId;
}
interface MatterDocument {
  id: string;
  title: string;
  versionId: string;
}
interface MatterDraft {
  id: string;
  title: string;
  currentVersionId: string;
}

const chip = (on: boolean) =>
  `min-h-11 rounded-full border px-4 text-sm font-medium ${on ? 'border-cognac-600 bg-cognac-100 text-cognac-900' : 'border-champagne-border bg-white text-stone-800 hover:bg-ivory-100'}`;

/** One request box. Everything beyond the request itself is optional and stays folded away. */
export function Composer({
  client,
  actions,
  commercial,
  busy,
  available,
  followUp,
  onFail,
  onSubmit,
}: {
  client: WorkspaceClient;
  actions: PublicAction[];
  commercial: boolean;
  busy: boolean;
  available: boolean;
  followUp?: ComposerFollowUp;
  onFail: (error: unknown) => void;
  onSubmit: (input: StartInput) => void;
}) {
  const [objective, setObjective] = useState('');
  const [action, setAction] = useState<ActionId | undefined>(followUp?.action);
  const [purpose, setPurpose] = useState('');
  const [text, setText] = useState(followUp?.text ?? '');
  const [matter, setMatter] = useState(followUp?.matterId ?? '');
  const [selected, setSelected] = useState<Context['documents']>(followUp?.documents ?? []);
  const [selectedDraft, setSelectedDraft] = useState<Context['draft']>(followUp?.draft);
  const [matters, setMatters] = useState<{ id: string; title: string }[]>([]);
  const [documents, setDocuments] = useState<MatterDocument[]>([]);
  const [drafts, setDrafts] = useState<MatterDraft[]>([]);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [quote, setQuote] = useState<CommercialQuote>();
  const fail = useRef(onFail);
  fail.current = onFail;

  useEffect(() => {
    if (!commercial) return;
    let active = true;
    client
      .commercialQuote()
      .then((value) => active && setQuote(value))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, commercial]);

  useEffect(() => {
    let active = true;
    setDocuments([]);
    setDrafts([]);
    if (!scopeOpen && !matter) return;
    requestApi<{ items: { id: string; title: string }[] }>('/api/v2/matters', {}, { sessionOnly: true })
      .then((r) => active && setMatters(r.items))
      .catch(() => {
        /* A case is optional; written context remains available. */
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
      .then((r) => active && setDrafts(r.items.filter((d) => d.currentVersionId)))
      .catch((e) => active && fail.current(e));
    requestApi<{ documents: { id: string; title: string; lifecycleState?: string }[] }>(
      `/api/v2/matters/${encodeURIComponent(matter)}`,
      {},
      { sessionOnly: true },
    )
      .then(async (r) => {
        const usable = await Promise.all(
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
        if (active) setDocuments(usable);
      })
      .catch((e) => active && fail.current(e));
    return () => {
      active = false;
    };
  }, [matter, scopeOpen]);

  const manual = actions.find((a) => a.id === action);
  const goal = [objective.trim(), purpose && `Finalidade informada: ${purpose}`].filter(Boolean).join('\n');
  const matterTitle = matters.find((m) => m.id === matter)?.title;
  const scopeSummary = [
    matter ? `Caso: ${matterTitle ?? 'selecionado'}` : 'Sem caso',
    selected.length ? `${selected.length} documento${selected.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const send = () => {
    if (!goal || busy || !available) return;
    onSubmit({
      objective: goal,
      ...(action ? { actionId: action } : {}),
      ...(followUp ? { conversationId: followUp.conversationId, contextRevision: followUp.contextRevision } : {}),
      ...(matter ? { matterId: matter } : {}),
      context: {
        text,
        origin: selected.length ? (text.trim() ? 'MIXED' : 'DOCUMENT') : 'USER',
        documents: selected,
        ...(selectedDraft ? { draft: selectedDraft } : {}),
      },
    });
  };
  return (
    <section aria-label="Novo pedido" className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-champagne-border bg-white p-4 shadow-card">
        <textarea
          aria-label="O que você precisa fazer?"
          className="w-full resize-none border-0 bg-transparent p-0 text-base focus:outline-none focus-visible:ring-0"
          maxLength={15000}
          rows={3}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder={
            followUp
              ? 'Peça um ajuste, pesquise fundamentos ou revise o texto…'
              : 'Descreva o que você precisa. Eu leio o caso, pergunto o que faltar e entrego um texto com as fontes.'
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-expanded={scopeOpen}
            className="inline-flex min-h-11 items-center rounded-full bg-champagne-light px-3 text-sm text-cognac-900"
            onClick={() => setScopeOpen((open) => !open)}
          >
            {scopeSummary}
          </button>
          <span className="grow" />
          <button type="button" className="btn-primary min-h-11" disabled={busy || !available || !goal} onClick={send}>
            Enviar
          </button>
        </div>
      </div>

      <div role="group" aria-label="Como o agente deve trabalhar" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={!action}
          className={chip(!action)}
          onClick={() => {
            setAction(undefined);
            setPurpose('');
            setSelectedDraft(followUp?.draft);
          }}
        >
          Deixar o agente decidir
        </button>
        {actions.map((a) => (
          <button
            type="button"
            key={a.id}
            aria-pressed={action === a.id}
            className={chip(action === a.id)}
            onClick={() => {
              setAction(a.id);
              setPurpose('');
              setSelectedDraft(
                a.id === 'review_text' && followUp?.draftCandidate ? followUp.draftCandidate : followUp?.draft,
              );
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      {manual?.dialogue[0] && (
        <div role="group" aria-label={manual.dialogue[0].prompt} className="space-y-2">
          <p className="text-sm font-medium text-stone-800">{manual.dialogue[0].prompt} (opcional)</p>
          <div className="flex flex-wrap gap-2">
            {manual.dialogue[0].options.map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={purpose === option}
                className={chip(purpose === option)}
                onClick={() => setPurpose(purpose === option ? '' : option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      )}

      {scopeOpen && (
        <section
          aria-label="Caso e documentos"
          className="space-y-4 rounded-2xl border border-champagne-border bg-white p-4"
        >
          <label className="block text-sm font-medium">
            Contexto escrito (opcional)
            <textarea
              maxLength={64000}
              rows={4}
              className="mt-2 w-full rounded-lg border border-stone-300 p-3 font-normal"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Caso (opcional)
            <select
              disabled={Boolean(followUp)}
              className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 p-2 font-normal"
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
            <label className="block text-sm font-medium">
              Minuta do caso (opcional)
              <select
                className="mt-2 min-h-11 w-full rounded-lg border border-stone-300 p-2 font-normal"
                value={selectedDraft ? `${selectedDraft.draftId}:${selectedDraft.versionId}` : ''}
                onChange={(e) => {
                  const d = drafts.find((x) => `${x.id}:${x.currentVersionId}` === e.target.value);
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
                    {d.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!!documents.length && (
            <fieldset>
              <legend className="text-sm font-medium">Documentos que o agente pode ler</legend>
              {documents.map((d) => (
                <label className="flex min-h-11 items-center gap-3 break-words text-sm" key={d.id}>
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
        </section>
      )}

      {!available && (
        <p className="text-sm text-stone-600">O processamento deste trabalho ainda não está disponível.</p>
      )}
      {commercial && quote && (
        <p className="text-sm text-stone-600">
          Custo de {reais(quote.minCostCents)} a {reais(quote.maxCostCents)} por trabalho; você confirma ao enviar.
          Saldo disponível: {reais(quote.availableCents)}.
        </p>
      )}
    </section>
  );
}
