import { useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';
import { EditorialApplicationControls } from './EditorialApplicationControls';
import { EditorialCommercialControls } from './EditorialCommercialControls';
import {
  editorialActionLabels,
  type EditorialAction,
  type EditorialProposal,
  type EditorialReview,
} from './editorial-review-model';

/** Human decisions, explicitly requested generation and separately confirmed version creation. */
export function EditorialReviewPanel({
  deliveryId,
  draftId,
  versionId,
  matterId,
}: {
  deliveryId: string;
  draftId: string;
  versionId: string;
  matterId: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    title = useId();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [review, setReview] = useState<EditorialReview | null>(null),
    [proposal, setProposal] = useState<EditorialProposal | null>(null);
  const [forms, setForms] = useState<Record<string, { action: EditorialAction | ''; reason: string }>>({});
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [blocked, setBlocked] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [generation, setGeneration] = useState<{
      enabled: boolean;
      mode: 'REAL' | 'SIMULATED' | 'COMMERCIAL';
      maxCostUsd: number;
      policyVersion?: string;
      maxCostCents?: number;
    } | null>(null),
    [generationConfirmed, setGenerationConfirmed] = useState(false),
    [generationAttempted, setGenerationAttempted] = useState(false);
  const pending = useRef<string | null>(null),
    pendingKind = useRef<'decision' | 'application'>('decision'),
    sequence = useRef(0),
    active = useRef<AbortController | null>(null);
  const base = `/api/agentic/deliveries/${encodeURIComponent(deliveryId)}/editorial-review`;
  const target = { draftId, versionId };
  const generationBase = `/api/agentic/deliveries/${encodeURIComponent(deliveryId)}/editorial-proposals`;
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  useEffect(
    () => () => {
      sequence.current++;
      active.current?.abort();
    },
    [],
  );
  const begin = () => {
    active.current?.abort();
    active.current = new AbortController();
    setBusy(true);
    setError('');
    setNotice('');
    return { ticket: ++sequence.current, signal: active.current.signal };
  };
  const read = async (input?: EditorialProposal) => {
    const { ticket, signal } = begin();
    setProposal(null);
    setForms({});
    setBlocked(true);
    try {
      const result = await requestApi<EditorialReview>(
        base + (input ? '/preview' : `?${new URLSearchParams(target)}`),
        input ? { method: 'POST', signal, body: JSON.stringify({ ...target, proposal: input }) } : { signal },
        { sessionOnly: true },
      );
      if (ticket !== sequence.current) return;
      setReview(result);
      setProposal(
        result.context
          ? (result.proposal ??
              result.history.filter((e) => e.contextHash === result.contextHash).at(-1)?.proposal ??
              null)
          : null,
      );
      setBlocked(!!result.stale);
      setUncertain(false);
      pending.current = null;
      if (!input) {
        const availability = await requestApi<typeof generation>(
          `${generationBase}/generation?${new URLSearchParams(target)}`,
          { signal },
          { sessionOnly: true },
        ).catch(() => null);
        if (ticket === sequence.current) setGeneration(availability);
      }
    } catch {
      if (ticket !== sequence.current) return;
      setReview(null);
      setError(
        'Não foi possível validar a revisão. Confira a proposta, a versão da minuta e seu acesso; depois atualize.',
      );
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  };
  const generate = async () => {
    if (
      busy ||
      blocked ||
      pending.current ||
      generationAttempted ||
      !generation?.enabled ||
      (generation.mode === 'REAL' && !generationConfirmed)
    )
      return;
    const { ticket, signal } = begin();
    setGenerationAttempted(true);
    setGenerationConfirmed(false);
    try {
      const result = await requestApi<{ proposal: EditorialProposal }>(
        `${generationBase}/generate`,
        { method: 'POST', signal, body: JSON.stringify({ ...target, confirmed: true }) },
        { sessionOnly: true },
      );
      if (ticket !== sequence.current) return;
      await read(result.proposal);
    } catch {
      if (ticket !== sequence.current) return;
      setError(
        'A geração não foi confirmada. Confira o registro financeiro antes de autorizar outra tentativa; a minuta permanece intacta.',
      );
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  };
  const importFile = async (file?: File) => {
    if (!file || pending.current) return;
    const { ticket } = begin();
    setProposal(null);
    setForms({});
    setBlocked(true);
    try {
      if (file.size > 8192) throw new Error('FILE_LIMIT');
      const input = JSON.parse(await file.text());
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_PROPOSAL');
      if (ticket !== sequence.current) return;
      await read(input?.proposal ?? input);
    } catch {
      if (ticket !== sequence.current) return;
      setError('Não foi possível carregar a proposta. Use o arquivo JSON da proposta editorial, com até 8 KB.');
      setBusy(false);
    }
  };
  const send = async (body: string) => {
    const application = pendingKind.current === 'application';
    const { ticket, signal } = begin();
    try {
      const result = await requestApi<EditorialReview>(
        `${base}/${application ? 'applications' : 'decisions'}`,
        { method: 'POST', signal, body },
        { sessionOnly: true },
      );
      if (ticket !== sequence.current) return;
      setReview(result);
      setForms({});
      pending.current = null;
      setUncertain(false);
      if (application) {
        setProposal(null);
        setBlocked(true);
      }
      setNotice(
        application
          ? 'Nova versão criada. A versão original foi preservada.'
          : 'Decisão salva no histórico. O texto da minuta permanece intacto.',
      );
    } catch (failure) {
      if (ticket !== sequence.current) return;
      if (uncertain && failure instanceof ApiRequestError && failure.status >= 400 && failure.status < 500) {
        try {
          const { commandId } = JSON.parse(body) as { commandId: string };
          const result = await requestApi<EditorialReview>(
            `${base}?${new URLSearchParams({ ...target, commandId })}`,
            { signal },
            { sessionOnly: true },
          );
          if (ticket !== sequence.current) return;
          if (result.reconciliation?.commandId !== commandId)
            throw new Error('RECONCILIATION_UNAVAILABLE', { cause: failure });
          setReview(result);
          setForms({});
          setUncertain(false);
          pending.current = null;
          setBlocked(!!result.stale);
          setProposal(
            result.context
              ? (result.history.filter((e) => e.contextHash === result.contextHash).at(-1)?.proposal ?? null)
              : null,
          );
          setNotice(
            application
              ? result.reconciliation.status === 'RECORDED'
                ? 'Aplicação localizada no histórico. Confira a versão criada.'
                : 'Comando não consta do histórico. Confira a versão atual antes de uma nova aplicação.'
              : result.reconciliation.status === 'RECORDED'
                ? 'Decisão localizada no histórico. Confira o registro; a minuta permanece intacta.'
                : 'Comando não consta do histórico. Confira a revisão atual antes de uma nova decisão.',
          );
        } catch {
          if (ticket !== sequence.current) return;
          setError('Não foi possível consultar o histórico. Restabeleça o acesso e verifique novamente.');
        }
      } else if (failure instanceof ApiRequestError && failure.status >= 400 && failure.status < 500) {
        pending.current = null;
        setBlocked(true);
        setError(
          'A revisão não pôde ser salva. Atualize para conferir a versão e as permissões antes de decidir novamente.',
        );
      } else {
        setUncertain(true);
        setError(
          application
            ? 'Não foi possível confirmar a criação da versão. Use Verificar aplicação; não envie outro comando.'
            : 'Não foi possível confirmar se a decisão foi salva. Use Verificar decisão; não envie outra decisão.',
        );
      }
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  };
  const decide = (id: string) => {
    const form = Object.hasOwn(forms, id) ? forms[id] : undefined;
    if (
      !review ||
      !review.context ||
      !proposal ||
      busy ||
      blocked ||
      pending.current ||
      !form?.action ||
      form.reason.trim().length < 3 ||
      form.reason.length > 1000
    )
      return;
    const body = JSON.stringify({
      ...target,
      proposal,
      contextHash: review.contextHash,
      expectedRevision: review.revision,
      commandId: crypto.randomUUID(),
      decision: { itemId: id, action: form.action, reason: form.reason },
    });
    pending.current = body;
    pendingKind.current = 'decision';
    void send(body);
  };
  const apply = (selection: { proposalHash: string; itemIds: string[]; reason: string; confirmed: true }) => {
    if (!review?.context || review.stale || busy || blocked || pending.current) return;
    const body = JSON.stringify({
      ...target,
      ...selection,
      contextHash: review.contextHash,
      expectedRevision: review.revision,
      commandId: crypto.randomUUID(),
    });
    pendingKind.current = 'application';
    pending.current = body;
    void send(body);
  };
  const known = [
    ...new Map(
      review?.history.filter((e) => e.contextHash === review.contextHash).map((e) => [e.proposalHash, e]) ?? [],
    ).values(),
  ];
  const close = () => {
    sequence.current++;
    active.current?.abort();
    setBusy(false);
    setOpen(false);
    if (pending.current) {
      setUncertain(true);
      setError(
        pendingKind.current === 'application'
          ? 'Não foi possível confirmar a criação da versão. Use Verificar aplicação; não envie outro comando.'
          : 'Não foi possível confirmar se a decisão foi salva. Use Verificar decisão; não envie outra decisão.',
      );
    }
  };
  const items = proposal
    ? [
        ...proposal.changes.map((item) => ({ ...item, substantive: false })),
        ...proposal.substantiveSuggestions.map((item) => ({ ...item, substantive: true })),
      ]
    : [];
  return (
    <div>
      <button
        className="min-h-11 text-sm underline"
        onClick={() => {
          setOpen(true);
          if (!pending.current) void read();
        }}
      >
        Revisar proposta editorial
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={title}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => setOpen(false)}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-champagne-border bg-white p-5 text-stone-900 shadow-xl backdrop:bg-stone-900/30 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id={title} className="font-editorial text-xl">
            Revisão editorial
          </h3>
          <button autoFocus className="min-h-11 px-2 text-sm underline" onClick={close}>
            Fechar
          </button>
        </div>
        <p className="my-3 text-sm text-stone-600">
          Decida sobre cada sugestão. Concordar registra sua avaliação editorial; não altera a minuta nem aprova seu
          conteúdo jurídico.
        </p>
        {generation?.mode === 'COMMERCIAL' && generation.policyVersion && generation.maxCostCents !== undefined && (
          <EditorialCommercialControls
            key={`${deliveryId}:${draftId}:${versionId}`}
            base={generationBase}
            draftId={draftId}
            versionId={versionId}
            policyVersion={generation.policyVersion}
            maxCostCents={generation.maxCostCents}
            disabled={busy || blocked || uncertain || !generation.enabled}
            onProposal={read}
          />
        )}
        {generation?.enabled && generation.mode !== 'COMMERCIAL' && !review?.stale && (
          <span className="my-3 block">
            {generation.mode === 'REAL' && (
              <label className="mb-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={generationConfirmed}
                  disabled={busy || uncertain || generationAttempted}
                  onChange={(event) => setGenerationConfirmed(event.target.checked)}
                />
                {`Autorizo gerar uma proposta, com custo máximo de US$ ${generation.maxCostUsd.toFixed(2).replace('.', ',')}.`}
              </label>
            )}
            <button
              type="button"
              className="min-h-11 text-sm underline"
              disabled={
                busy ||
                blocked ||
                uncertain ||
                generationAttempted ||
                (generation.mode === 'REAL' && !generationConfirmed)
              }
              onClick={() => void generate()}
            >
              {generation.mode === 'REAL' ? 'Gerar proposta editorial' : 'Gerar proposta de teste'}
            </button>
            <span className="block text-xs text-stone-600">
              A proposta será apresentada para revisão; gerar não aplica alterações.
            </span>
          </span>
        )}
        <label className="block text-sm">
          Arquivo da proposta editorial
          <input
            type="file"
            accept=".json,application/json"
            className="my-2 block w-full min-w-0 text-sm"
            disabled={busy || uncertain || review?.stale}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void importFile(file);
            }}
          />
        </label>
        <p className="text-xs text-stone-600">
          Carregue uma proposta para conferência. A origem de um arquivo importado não é autenticada.
        </p>
        {busy && (
          <p role="status" className="my-3 text-sm">
            Conferindo revisão…
          </p>
        )}
        {error && (
          <p role="alert" className="my-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="my-3 text-sm">
            {notice}
          </p>
        )}
        {uncertain ? (
          <button
            disabled={busy}
            className="btn-secondary min-h-11"
            onClick={() => pending.current && void send(pending.current)}
          >
            {pendingKind.current === 'application' ? 'Verificar aplicação' : 'Verificar decisão'}
          </button>
        ) : (
          <button disabled={busy} className="min-h-11 text-sm underline" onClick={() => void read()}>
            Atualizar revisão
          </button>
        )}
        {known.length > 1 && (
          <label className="block text-sm">
            Proposta salva
            <select
              aria-label="Proposta salva"
              className="my-2 w-full rounded border p-2"
              value={known.find((e) => JSON.stringify(e.proposal) === JSON.stringify(proposal))?.proposalHash ?? ''}
              disabled={busy || uncertain}
              onChange={(e) => {
                const item = known.find((item) => item.proposalHash === e.target.value);
                if (item) void read(item.proposal);
              }}
            >
              <option value="">Selecione uma proposta</option>
              {known.map((e, i) => (
                <option key={e.proposalHash} value={e.proposalHash}>
                  Proposta {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        {review && (
          <>
            {review.application && (
              <div className="my-4 space-y-2 break-words rounded-xl border border-champagne-border p-4 text-sm">
                <p className="font-semibold">Nova versão criada: {review.application.versionNumber}</p>
                <p className="break-words">{review.application.reason}</p>
                <p>
                  {review.application.itemIds.length} ajuste(s) aplicado(s). A versão original permanece no histórico.
                </p>
                <p className="text-xs text-stone-600">
                  {review.application.appliedBy} · {new Date(review.application.appliedAt).toLocaleString('pt-BR')}
                </p>
                <a
                  className="inline-block min-h-11 py-2 underline"
                  href={`/app/rascunhos?${new URLSearchParams({ matterId, draftId, versionId: review.application.versionId })}`}
                >
                  Abrir versão criada
                </a>
              </div>
            )}
            {review.stale && !busy && (
              <p role="status" className="my-3 text-sm">
                Esta entrega está desatualizada. O histórico continua disponível; novas decisões estão bloqueadas.
              </p>
            )}
            <h4 className="mt-4 font-semibold">{review.context?.document.title ?? 'Histórico editorial'}</h4>
            <div className="my-3 space-y-1 text-sm text-stone-700">
              <p>Ressalvas e pontos a conferir</p>
              {review.context?.requirements
                .filter((r) => !r.verified)
                .map((r) => (
                  <p key={r.id}>{r.statement}</p>
                ))}
              {review.context?.findings.map((f) => (
                <p key={f.id}>{f.statement}</p>
              ))}
              {proposal?.limitations.map((text, i) => (
                <p key={i}>{text}</p>
              ))}
            </div>
            {proposal && !items.length && (
              <p className="my-3 text-sm">Esta proposta não contém mudanças. Isso não significa aprovação da minuta.</p>
            )}
            <div className="divide-y divide-champagne-border">
              {items.map((item, i) => {
                const form = Object.hasOwn(forms, item.id) ? forms[item.id] : { action: '' as const, reason: '' };
                const previous = review.history
                  .filter(
                    (e) =>
                      e.contextHash === review.contextHash &&
                      JSON.stringify(e.proposal) === JSON.stringify(proposal) &&
                      e.decision.itemId === item.id,
                  )
                  .at(-1);
                return (
                  <fieldset key={item.id} disabled={busy || uncertain || blocked} className="min-w-0 space-y-2 py-4">
                    <legend className="font-medium">
                      {item.substantive ? 'Sugestão substantiva' : 'Ajuste editorial'} {i + 1}
                    </legend>
                    <p className="text-xs text-stone-600">
                      Seção: {review.context?.document.sections[item.sectionIndex]?.title}
                    </p>
                    <p className="text-sm font-medium">Original</p>
                    <blockquote className="break-words whitespace-pre-wrap border-l-2 border-stone-300 pl-3 text-sm">
                      {item.before}
                    </blockquote>
                    {!item.substantive && (
                      <>
                        <p className="text-sm font-medium">Sugestão</p>
                        <blockquote className="break-words whitespace-pre-wrap border-l-2 border-cognac-300 pl-3 text-sm">
                          {item.after}
                        </blockquote>
                      </>
                    )}
                    <p className="break-words text-sm">{item.reason}</p>
                    {item.substantive && (
                      <p className="text-sm text-stone-600">
                        Exige análise própria; não contém alteração pronta para aplicar.
                      </p>
                    )}
                    <details className="text-sm">
                      <summary className="min-h-11 cursor-pointer py-2 underline">Conferir seção e fontes</summary>
                      <p className="break-words whitespace-pre-wrap">
                        {review.context?.document.sections[item.sectionIndex]?.content}
                      </p>
                      {item.sourceIds.map((id) => (
                        <blockquote
                          key={id}
                          className="my-2 break-words whitespace-pre-wrap border-l-2 border-stone-300 pl-3"
                        >
                          {review.context?.sources.find((s) => s.id === id)?.text}
                        </blockquote>
                      ))}
                    </details>
                    {previous && (
                      <p className="text-sm">
                        Última decisão: {editorialActionLabels[previous.decision.action]} — {previous.decision.reason}
                      </p>
                    )}
                    <label className="block text-sm">
                      Decisão {i + 1}
                      <select
                        className="mt-1 w-full rounded border border-stone-300 p-2"
                        value={form.action}
                        onChange={(e) =>
                          setForms((old) => ({
                            ...old,
                            [item.id]: { ...form, action: e.target.value as EditorialAction },
                          }))
                        }
                      >
                        <option value="">Selecione após conferir</option>
                        {Object.entries(editorialActionLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      Fundamento {i + 1}
                      <textarea
                        className="mt-1 w-full rounded border border-stone-300 p-2"
                        rows={2}
                        maxLength={1000}
                        value={form.reason}
                        onChange={(e) =>
                          setForms((old) => ({ ...old, [item.id]: { ...form, reason: e.target.value } }))
                        }
                      />
                    </label>
                    <button
                      className="btn-secondary min-h-11"
                      disabled={!form.action || form.reason.trim().length < 3}
                      onClick={() => decide(item.id)}
                    >
                      Salvar decisão {i + 1}
                    </button>
                  </fieldset>
                );
              })}
            </div>
            {proposal && (
              <EditorialApplicationControls
                key={`${review.revision}:${JSON.stringify(proposal)}`}
                review={review}
                proposal={proposal}
                disabled={busy || blocked || uncertain}
                apply={apply}
              />
            )}
            <details className="mt-4 text-sm" open={!proposal}>
              <summary className="min-h-11 cursor-pointer py-2 underline">
                Histórico de decisões ({review.history.length})
              </summary>
              {!review.history.length && <p>Nenhuma decisão editorial salva.</p>}
              {review.history.map((e) => (
                <div key={e.commandId} className="my-3 space-y-1 break-words border-b border-champagne-border pb-3">
                  <p>
                    {editorialActionLabels[e.decision.action]} — {e.decision.reason}
                  </p>
                  <p className="whitespace-pre-wrap">
                    Trecho:{' '}
                    {
                      [...e.proposal.changes, ...e.proposal.substantiveSuggestions].find(
                        (item) => item.id === e.decision.itemId,
                      )?.before
                    }
                  </p>
                  <p className="text-xs text-stone-600">
                    {e.decidedBy} · {new Date(e.decidedAt).toLocaleString('pt-BR')}
                    {e.contextHash !== review.contextHash ? ' · Contexto anterior' : ''}
                  </p>
                </div>
              ))}
            </details>
          </>
        )}
      </dialog>
    </div>
  );
}
