import type { DeskPiece, DeskRequest } from './desk-model';
import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../api-client';
import type { WorkspaceClient, StartInput } from './client';
import { reais, type CommercialQuote } from './commercial-model';
import type { ActionId, Context, PublicAction } from './execution-model';
import { EvidenceChangesPanel } from './EvidenceChangesPanel';

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

/** One request box. Everything beyond the request itself is optional and stays folded away. */
export function Composer({
  client,
  actions,
  commercial,
  busy,
  available,
  followUp,
  piece,
  request,
  onFail,
  onSubmit,
}: {
  client: WorkspaceClient;
  actions: PublicAction[];
  commercial: boolean;
  busy: boolean;
  available: boolean;
  followUp?: ComposerFollowUp;
  piece?: DeskPiece | null;
  request?: DeskRequest;
  onFail: (error: unknown) => void;
  onSubmit: (input: StartInput) => void;
}) {
  const [objective, setObjective] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (request) {
      setObjective(request.text);
      inputRef.current?.focus();
    }
  }, [request]);
  const [action, setAction] = useState<ActionId | undefined>(followUp?.action);
  const [inheritedText, setInheritedText] = useState(followUp?.text ?? '');
  const [matter, setMatter] = useState(followUp?.matterId ?? '');
  const [selected, setSelected] = useState<Context['documents']>(followUp?.documents ?? []);
  const [selectedDraft, setSelectedDraft] = useState<Context['draft']>(followUp?.draft);
  const [matters, setMatters] = useState<{ id: string; title: string }[]>([]);
  const [documents, setDocuments] = useState<MatterDocument[]>([]);
  const [drafts, setDrafts] = useState<MatterDraft[]>([]);
  useEffect(() => {
    if (!piece || piece.matterId === matter) return;
    setMatter(piece.matterId);
    setInheritedText('');
    setSelected([]);
    setSelectedDraft(undefined);
  }, [piece, matter]);
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

  const goal = objective.trim();
  // One visible message supplies the written context; existing conversations retain theirs.
  const text = inheritedText || goal;
  const matterTitle = matters.find((m) => m.id === matter)?.title;
  const scopeSummary = [
    matter ? `Caso: ${matterTitle ?? 'selecionado'}` : 'Sem caso',
    selected.length ? `${selected.length} documento${selected.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const send = () => {
    if (!goal || busy || !available) return;
    if (piece?.dirty) return;
    onSubmit({
      objective: goal,
      ...(action ? { actionId: action } : {}),
      ...(followUp && (!piece || piece.matterId === followUp.matterId)
        ? { conversationId: followUp.conversationId, contextRevision: followUp.contextRevision }
        : {}),
      ...(piece?.matterId || matter ? { matterId: piece?.matterId || matter } : {}),
      context: {
        text: piece && piece.matterId !== matter ? '' : text,
        origin:
          piece && piece.matterId !== matter ? 'USER' : selected.length ? (text.trim() ? 'MIXED' : 'DOCUMENT') : 'USER',
        documents: piece && piece.matterId !== matter ? [] : selected,
        ...(piece
          ? { draft: { draftId: piece.draftId, versionId: piece.versionId } }
          : selectedDraft
            ? { draft: selectedDraft }
            : {}),
      },
    });
  };
  return (
    <section aria-label="Novo pedido" className="space-y-4">
      {piece && (
        <p className="text-xs text-stone-500">
          {piece.dirty ? 'Salve a edição para pedir mudanças nesta versão.' : `Sobre a peça: ${piece.title}`}
        </p>
      )}
      <div
        role="group"
        aria-label="Mensagem"
        className="space-y-3 rounded-2xl border border-champagne-border bg-white p-4 shadow-card"
      >
        <textarea
          ref={inputRef}
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
          {!followUp && (
            <select
              aria-label="Opção do pedido"
              className="min-h-11 w-auto max-w-full shrink-0 rounded-full border border-champagne-border bg-white py-2 pl-3 pr-8 text-sm font-medium text-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cognac-600"
              value={action ?? ''}
              disabled={busy}
              onChange={(event) => setAction(actions.find((item) => item.id === event.target.value)?.id)}
            >
              <option value="">Automático</option>
              {actions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            aria-expanded={scopeOpen}
            className="inline-flex min-h-11 min-w-0 max-w-full items-center rounded-full bg-champagne-light px-3 text-sm text-cognac-900"
            title={scopeSummary}
            onClick={() => setScopeOpen((open) => !open)}
          >
            <span className="truncate">{scopeSummary}</span>
          </button>
          <button
            type="button"
            className="btn-primary ml-auto min-h-11"
            disabled={busy || !available || !goal || Boolean(piece?.dirty)}
            onClick={send}
          >
            Enviar
          </button>
        </div>
      </div>

      {scopeOpen && (
        <section
          aria-label="Caso e documentos"
          className="space-y-4 rounded-2xl border border-champagne-border bg-white p-4"
        >
          <label className="block text-sm font-medium">
            Caso (opcional)
            <select
              disabled={Boolean(followUp || piece)}
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
          {matter && !piece && (
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
              <legend className="text-sm font-medium">Documentos para este pedido</legend>
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

      {matter && scopeOpen && <EvidenceChangesPanel key={matter} matterId={matter} disabled={busy} />}
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
