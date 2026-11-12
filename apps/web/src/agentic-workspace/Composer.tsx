import type { DeskPiece, DeskRequest } from './desk-model';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ATTACHMENTS_ENABLED } from '../config/site-capabilities';
import { AttachButton, AttachmentChips } from './AttachmentChips';
import { attachmentContext, hasReadingAttachment } from './attachments';
import { useAttachments } from './use-attachments';
import { requestApi } from '../api-client';
import type { WorkspaceClient, StartInput } from './client';
import { reais, type CommercialAuthorization, type CommercialQuote } from './commercial-model';
import type { ActionId, Context, PublicAction } from './execution-model';
import { EvidenceChangesPanel } from './EvidenceChangesPanel';
import type { GuidanceStart, GuidanceState } from './guidance-model';

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
  authorizeOnSend = false,
  busy,
  available,
  followUp,
  piece,
  piecePending = false,
  request,
  onFail,
  onSubmit,
  onGuide,
  guidanceId,
  guidanceState,
  guidanceBusy = false,
  guidanceEditing = false,
  guidanceError,
}: {
  client: WorkspaceClient;
  actions: PublicAction[];
  commercial: boolean;
  authorizeOnSend?: boolean;
  busy: boolean;
  available: boolean;
  followUp?: ComposerFollowUp;
  piece?: DeskPiece | null;
  piecePending?: boolean;
  request?: DeskRequest;
  onFail: (error: unknown) => void;
  onSubmit: (input: StartInput, authorization?: CommercialAuthorization) => void;
  onGuide?: (input: GuidanceStart) => void;
  guidanceId?: string;
  guidanceState?: GuidanceState;
  guidanceBusy?: boolean;
  guidanceEditing?: boolean;
  guidanceError?: string;
}) {
  const [objective, setObjective] = useState<string>();
  const attachments = useAttachments();
  const reading = ATTACHMENTS_ENABLED && hasReadingAttachment(attachments.items);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const lastGuidance = useRef<string>();
  const startFromComposer = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasGuided = useRef(false);
  useEffect(() => {
    if (!guidanceId && wasGuided.current && document.activeElement === document.body) inputRef.current?.focus();
    wasGuided.current = Boolean(guidanceId);
  }, [guidanceId]);
  useEffect(() => {
    if (!guidanceState || lastGuidance.current === guidanceState.conversationId) return;
    lastGuidance.current = guidanceState.conversationId;
    if (!startFromComposer.current) {
      setObjective(guidanceState.objective || undefined);
      setMatter(guidanceState.matterId ?? '');
      setSelected([]);
      setSelectedDraft(undefined);
    }
    startFromComposer.current = false;
    setDescriptionOpen(false);
  }, [guidanceState]);
  useEffect(() => {
    if (guidanceError) startFromComposer.current = false;
  }, [guidanceError]);
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
  const hadPiece = useRef(false);
  useEffect(() => {
    if (piecePending || followUp) return;
    if (!piece && !hadPiece.current) return;
    hadPiece.current = Boolean(piece);
    const nextMatter = piece?.matterId ?? '';
    if (nextMatter === matter) return;
    setMatter(nextMatter);
    setInheritedText('');
    setSelected([]);
    setSelectedDraft(undefined);
  }, [piece, piecePending, followUp, matter]);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [quote, setQuote] = useState<CommercialQuote>();
  const fail = useRef(onFail);
  fail.current = onFail;

  useEffect(() => {
    if (!commercial) return;
    let active = true;
    client
      .commercialQuote()
      .then((value) => active && setQuote(value))
      .catch(() => active && setQuoteFailed(true));
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

  const description = guidanceState?.description;
  const message = objective ?? (description && description.length <= 15000 ? description : '');
  const goal = message.trim();
  // One visible message supplies the written context; existing conversations retain theirs.
  const text = inheritedText || goal;
  const matterTitle = matters.find((m) => m.id === matter)?.title;
  const scopeSummary = [
    matter ? `Caso: ${matterTitle ?? 'selecionado'}` : 'Sem caso',
    selected.length ? `${selected.length} documento${selected.length > 1 ? 's' : ''}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const [preparing, setPreparing] = useState(false);
  const preparation = useRef(0);
  useLayoutEffect(() => {
    const ticket = preparation.current;
    return () => {
      preparation.current = ticket + 1;
    };
  }, [available]);
  const conversationMatter = guidanceState ? guidanceState.matterId : followUp?.matterId;
  const pieceConflict = Boolean(
    piece && conversationMatter !== undefined && (piece.matterId || null) !== conversationMatter,
  );
  const guided = Boolean(guidanceId);
  const canSendGuide = Boolean(guidanceState && !guidanceState.question && !guidanceEditing);
  const authorization =
    commercial && authorizeOnSend && quote
      ? { confirmed: true as const, policyVersion: quote.policyVersion }
      : undefined;
  const send = async () => {
    if (!goal || busy || preparing || !available || piecePending || pieceConflict || guidanceBusy || reading) return;
    if (commercial && authorizeOnSend && (!quote || quote.availableCents < quote.maxCostCents)) return;
    if (guided && !canSendGuide) return;
    const ticket = preparation.current;
    const index = window.history.state?.forgelexIndex;
    const isCurrent = () => ticket === preparation.current && index === window.history.state?.forgelexIndex;
    setPreparing(true);
    try {
      const currentPiece = piece?.prepare ? await piece.prepare() : piece;
      if (!isCurrent()) return;
      if (currentPiece?.dirty) throw new Error('A peça ainda está sendo atualizada.');
      const conversation = guidanceState ?? followUp;
      const matterId = currentPiece ? currentPiece.matterId : conversation ? conversation.matterId : matter;
      if (conversation && (matterId || null) !== conversation.matterId)
        throw new Error('A peça pertence a outro caso.');
      const actionId = guidanceState
        ? actions.find((item) => item.id === guidanceState.decisions.action.value)?.id
        : action;
      const draft = currentPiece
        ? currentPiece.draftId && currentPiece.versionId
          ? { draftId: currentPiece.draftId, versionId: currentPiece.versionId }
          : undefined
        : selectedDraft;
      // Anexos (U5): só o texto extraído segue com o pedido, somado ao contexto escrito.
      const attached = ATTACHMENTS_ENABLED ? attachmentContext(attachments.items) : '';
      const contextText = (base: string) => [base, attached].filter(Boolean).join('\n\n');
      if (attached && contextText(currentPiece?.localText ?? text).length > 100_000) {
        throw new Error('O pedido com os anexos passa de 100.000 caracteres. Remova ou troque algum anexo.');
      }
      onSubmit(
        {
          objective: goal,
          ...(actionId ? { actionId } : {}),
          ...(conversation
            ? { conversationId: conversation.conversationId, contextRevision: conversation.contextRevision }
            : {}),
          ...(followUp && !guided ? { useGuidance: false } : {}),
          ...(matterId ? { matterId } : {}),
          ...(!guided || currentPiece || selected.length || draft || attached
            ? {
                context: {
                  text: contextText(
                    currentPiece?.localText
                      ? `Peça aberta (conteúdo do usuário):\n${currentPiece.localText}`
                      : currentPiece && currentPiece.matterId !== matter
                        ? goal
                        : text,
                  ),
                  origin:
                    currentPiece && currentPiece.matterId !== matter
                      ? 'USER'
                      : selected.length
                        ? text.trim()
                          ? 'MIXED'
                          : 'DOCUMENT'
                        : 'USER',
                  documents: currentPiece && currentPiece.matterId !== matter ? [] : selected,
                  ...(draft ? { draft } : {}),
                  ...(currentPiece?.editSelection && currentPiece.editSelection.versionId === draft?.versionId
                    ? { deskEdit: currentPiece.editSelection }
                    : {}),
                },
              }
            : {}),
        },
        authorization,
      );
      attachments.clear();
    } catch (error) {
      if (isCurrent()) onFail(error);
    } finally {
      setPreparing(false);
    }
  };
  if (guided && !guidanceState) return null;
  const pendingQuestion = guidanceEditing || Boolean(guidanceState?.question);
  return (
    <section aria-label="Novo pedido" className="space-y-4">
      {piece && !pieceConflict && (!guided || canSendGuide) && (
        <p className="text-xs text-stone-500">{`Sobre a peça: ${piece.title}`} · Ao enviar, uso o texto aberto.</p>
      )}
      {piece?.editSelection && !pieceConflict && (
        <div className="flex items-start gap-2 text-sm text-stone-700">
          <span className="min-w-0 flex-1 truncate">Trecho para editar · {piece.editSelection.before}</span>
          <button type="button" className="shrink-0 underline" onClick={piece.clearEditSelection}>
            Retirar seleção
          </button>
        </div>
      )}
      {piecePending && (
        <p role="status" className="text-xs text-stone-600">
          A peça selecionada precisa estar disponível para enviar.
        </p>
      )}
      {pieceConflict && (
        <p role="status" className="text-xs text-stone-600">
          Abra uma nova conversa para trabalhar com a peça de outro caso.
        </p>
      )}
      {pendingQuestion && !descriptionOpen && (goal || !guidanceState?.question?.allowFreeText) && (
        <button
          type="button"
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-cognac-800 hover:bg-ivory-100"
          onClick={() => {
            setDescriptionOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          {goal ? 'Editar descrição do pedido' : 'Descrever o pedido'}
        </button>
      )}
      <div
        hidden={pendingQuestion && !descriptionOpen}
        role="group"
        aria-label="Mensagem"
        className="space-y-3 rounded-3xl border border-stone-200 bg-white p-4 has-[textarea:focus-visible]:border-cognac-700 has-[textarea:focus-visible]:ring-1 has-[textarea:focus-visible]:ring-cognac-700"
      >
        <textarea
          ref={inputRef}
          aria-label="O que você precisa fazer?"
          className="w-full resize-none border-0 bg-transparent p-1 text-base focus-visible:outline-none"
          maxLength={15000}
          rows={guided ? 2 : 3}
          value={message}
          onChange={(e) => setObjective(e.target.value)}
          placeholder={
            guided
              ? 'Descreva o que você precisa resolver…'
              : followUp
                ? 'Peça um ajuste, pesquise fundamentos ou revise o texto…'
                : 'Descreva o que você precisa. Você pode incluir a peça e as fontes do pedido.'
          }
        />
        {ATTACHMENTS_ENABLED && (
          <AttachmentChips
            attachments={attachments.items}
            notice={attachments.notice}
            busy={busy || preparing}
            onReplace={attachments.replace}
            onRemove={attachments.remove}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {ATTACHMENTS_ENABLED && (
            <AttachButton disabled={busy || preparing} count={attachments.items.length} onFiles={attachments.add} />
          )}
          {!guided && !followUp && (
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
          {(!guided || (canSendGuide && matter)) && (
            <button
              type="button"
              aria-expanded={scopeOpen}
              className="inline-flex min-h-11 min-w-0 max-w-full items-center rounded-full bg-champagne-light px-3 text-sm text-cognac-900"
              title={scopeSummary}
              onClick={() => setScopeOpen((open) => !open)}
            >
              <span className="truncate">{scopeSummary}</span>
            </button>
          )}
          {(!guided || canSendGuide) && (
            <button
              type="button"
              className="btn-primary ml-auto min-h-11 rounded-full disabled:cursor-default disabled:opacity-50"
              disabled={
                busy ||
                preparing ||
                piecePending ||
                pieceConflict ||
                guidanceBusy ||
                !available ||
                reading ||
                !goal ||
                (commercial && authorizeOnSend && (!quote || quote.availableCents < quote.maxCostCents))
              }
              onClick={() => void send()}
            >
              Enviar
            </button>
          )}
        </div>
      </div>

      {!guided && onGuide && (
        <div className="space-y-1">
          <button
            type="button"
            disabled={busy || preparing || guidanceBusy || piecePending}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-cognac-800 hover:bg-ivory-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cognac-700"
            onClick={() => {
              startFromComposer.current = true;
              const selectedMatter = piece ? piece.matterId : matter;
              if (!goal) setObjective(undefined);
              onGuide({
                ...(goal ? { objective: goal } : {}),
                ...(selectedMatter ? { matterId: selectedMatter } : {}),
              });
            }}
          >
            <Sparkles size={16} aria-hidden="true" /> Me ajude a começar
          </button>
          {guidanceBusy && (
            <p role="status" className="text-sm text-stone-700">
              Preparando seu pedido…
            </p>
          )}
          {guidanceError && (
            <p role="alert" className="text-sm text-stone-700">
              {guidanceError}
            </p>
          )}
        </div>
      )}
      {(!guided || canSendGuide) && scopeOpen && (
        <section
          aria-label="Caso e documentos"
          className="space-y-4 rounded-2xl border border-champagne-border bg-white p-4"
        >
          <label className="block text-sm font-medium">
            Caso (opcional)
            <select
              disabled={Boolean(followUp || piece || guided)}
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

      {!guided && matter && scopeOpen && <EvidenceChangesPanel key={matter} matterId={matter} disabled={busy} />}
      {!available && (
        <p className="text-sm text-stone-600">O processamento deste trabalho ainda não está disponível.</p>
      )}
      {commercial && !quote && (
        <p role="status" className="text-xs text-stone-600">
          {quoteFailed ? 'Preço indisponível. Recarregue a página para consultar novamente.' : 'Consultando preço…'}
        </p>
      )}
      {commercial && quote && (
        <p className="text-sm text-stone-600">
          Custo de {reais(quote.minCostCents)} a {reais(quote.maxCostCents)} por trabalho. Enviar autoriza até{' '}
          {reais(quote.maxCostCents)}; o restante é liberado. Saldo: {reais(quote.availableCents)}.{' '}
          {quote.availableCents < quote.maxCostCents && 'Saldo insuficiente.'} O texto e as fontes são processados pela
          OpenAI.{' '}
          <a href="/legal/privacidade.html" target="_blank" rel="noreferrer" className="underline">
            Privacidade
          </a>
        </p>
      )}
    </section>
  );
}
