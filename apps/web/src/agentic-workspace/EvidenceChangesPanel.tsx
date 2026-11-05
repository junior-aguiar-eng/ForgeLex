import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiRequestError, requestApi } from '../api-client';
import { DocumentReaderDialog } from '../components/DocumentReaderDialog';
import type { DocumentSource } from '../documents/document-reader-model';

interface ApprovedItemSnapshot {
  kind: 'FACT' | 'EVIDENCE';
  text: string;
  status: string;
  relation?: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT';
  sources: {
    documentId: string;
    versionId: string;
    anchorId: string;
    quote: string;
    relation: 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT';
  }[];
}
interface EvidenceReapproval {
  reviewToken: string;
  items: {
    deliveryId: string;
    itemId: string;
    previous: ApprovedItemSnapshot;
    previousSourcesUnavailable?: boolean;
    current?: ApprovedItemSnapshot;
    relatedFactText?: string;
    previousRelatedFactText?: string;
    blocked?: string;
  }[];
}

const label = (s: ApprovedItemSnapshot) =>
  s.kind === 'EVIDENCE' ? 'Prova documental' : s.status === 'DISPUTED' ? 'Fato controvertido' : 'Fato alegado';
const relations = { SUPPORTS: 'Apoia o fato', CONTRADICTS: 'Contraria o fato', CONTEXT: 'Contexto do fato' };
const key = (item: { deliveryId: string; itemId: string }) => `${item.deliveryId}/${item.itemId}`;

/** Only an objective option is visible until the person chooses to review. */
export function EvidenceChangesPanel({ matterId, disabled = false }: { matterId: string; disabled?: boolean }) {
  const title = useId(),
    dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const [review, setReview] = useState<EvidenceReapproval>(),
    [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const [reading, setReading] = useState<DocumentSource>();
  const pending = useRef<string>();
  const path = `/api/agentic/matters/${encodeURIComponent(matterId)}/evidence-changes`;
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const refresh = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await requestApi<EvidenceReapproval>(path, {}, { sessionOnly: true });
      setReview(result);
      setSelected([]);
      setOpen(true);
      pending.current = undefined;
      setUncertain(false);
    } catch {
      setError('Não foi possível conferir as alterações. Verifique seu acesso e a disponibilidade das fontes do caso.');
    } finally {
      setBusy(false);
    }
  };
  const send = async (body: string) => {
    setBusy(true);
    setError('');
    try {
      await requestApi<EvidenceReapproval>(`${path}/decisions`, { method: 'POST', body }, { sessionOnly: true });
      pending.current = undefined;
      setUncertain(false);
      setSelected([]);
      setOpen(false);
      setNotice('Decisão registrada. Confira as alterações restantes antes de enviar seu pedido.');
    } catch (failure) {
      // The server checks the command receipt before returning a stale-preview conflict.
      // That response proves this command was not recorded, including after transport loss.
      const definitive =
        failure instanceof ApiRequestError &&
        (failure.code === 'EVIDENCE_REVIEW_CONFLICT' || (!uncertain && failure.status >= 400 && failure.status < 500));
      if (definitive) {
        pending.current = undefined;
        setUncertain(false);
      } else setUncertain(true);
      setError(
        definitive
          ? 'O caso mudou ou há um fato relacionado pendente. Atualize os itens e confira novamente.'
          : 'Não foi possível confirmar a decisão. Use Verificar decisão para conferir.',
      );
    } finally {
      setBusy(false);
    }
  };
  const approve = () => {
    if (!review || !selected.length || busy || uncertain) return;
    pending.current = JSON.stringify({
      approved: true,
      commandId: crypto.randomUUID(),
      reviewToken: review.reviewToken,
      items: review.items
        .filter((i) => selected.includes(key(i)))
        .map(({ deliveryId, itemId }) => ({ deliveryId, itemId })),
    });
    void send(pending.current);
  };
  const messages = (
    <>
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-stone-600">
          {notice}
        </p>
      )}
    </>
  );
  const content = (snapshot: ApprovedItemSnapshot, relatedText?: string) => (
    <>
      <p className="text-sm text-stone-600">{label(snapshot)}</p>
      <p className="whitespace-pre-wrap break-words">{snapshot.text}</p>
      {snapshot.kind === 'EVIDENCE' && snapshot.relation && (
        <p className="text-sm">
          {relations[snapshot.relation]}
          {relatedText ? `: ${relatedText}` : ''}
        </p>
      )}
      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 underline">Conferir fontes</summary>
        {!snapshot.sources.length && <p>Sem trecho documental vinculado.</p>}
        {snapshot.sources.map((source, index) => (
          <blockquote key={index} className="mb-3 border-l-2 border-cognac-300 pl-3">
            <p>
              {relations[source.relation]}: “{source.quote}”
            </p>
            <button
              type="button"
              className="min-h-11 underline"
              onClick={() => {
                setOpen(false);
                setReading({
                  matterId,
                  documentId: source.documentId,
                  versionId: source.versionId,
                  anchorId: source.anchorId,
                });
              }}
            >
              Abrir documento
            </button>
          </blockquote>
        ))}
      </details>
    </>
  );
  return (
    <div>
      <button
        type="button"
        className="min-h-11 text-sm underline"
        disabled={disabled || busy}
        onClick={() => (uncertain ? setOpen(true) : void refresh())}
      >
        Revisar alterações
      </button>
      {!open && messages}
      {createPortal(
        <dialog
          ref={dialog}
          aria-labelledby={title}
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
          className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-champagne-border bg-white p-5 text-stone-900 shadow-xl backdrop:bg-stone-900/30 sm:p-6"
        >
          <div className="flex items-center justify-between gap-4">
            <h3 id={title} className="font-editorial text-xl">
              Revisar alterações
            </h3>
            <button type="button" autoFocus className="min-h-11 px-2 underline" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
          <p className="mb-4 text-sm text-stone-600">
            Confira o que mudou. Aprove apenas os itens que deseja voltar a usar nos pedidos.
          </p>
          {review?.items.length === 0 && <p>Não há alterações pendentes de aprovação.</p>}
          {review?.items.map((item, index) => (
            <fieldset
              key={key(item)}
              disabled={busy || uncertain}
              className="min-w-0 space-y-3 border-b border-champagne-border py-4"
            >
              <legend className="sr-only">Alteração {index + 1}</legend>
              <div>
                <h4 className="font-medium">Última aprovação</h4>
                {content(item.previous, item.previousRelatedFactText)}
                {item.previousSourcesUnavailable && (
                  <p className="text-sm text-stone-600">
                    A fonte anterior está indisponível. Confira as fontes atuais antes de aprovar.
                  </p>
                )}
              </div>
              {item.current && (
                <div>
                  <h4 className="font-medium">Como está agora</h4>
                  {content(item.current, item.relatedFactText)}
                </div>
              )}
              {item.blocked ? (
                <p className="text-sm text-red-800">{item.blocked}</p>
              ) : (
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(key(item))}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked ? [...old, key(item)] : old.filter((k) => k !== key(item)),
                      )
                    }
                  />
                  Aprovar alteração {index + 1}
                </label>
              )}
            </fieldset>
          ))}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className="btn-primary min-h-11"
              disabled={busy || uncertain || !selected.length}
              onClick={approve}
            >
              Aprovar alterações
            </button>
            {uncertain ? (
              <button
                type="button"
                className="btn-secondary min-h-11"
                disabled={busy}
                onClick={() => pending.current && void send(pending.current)}
              >
                Verificar decisão
              </button>
            ) : (
              <button type="button" className="btn-secondary min-h-11" disabled={busy} onClick={() => void refresh()}>
                Atualizar itens
              </button>
            )}
          </div>
          {messages}
        </dialog>,
        document.body,
      )}
      {reading && (
        <DocumentReaderDialog
          source={reading}
          token=""
          onClose={() => {
            setReading(undefined);
            setOpen(true);
          }}
        />
      )}
    </div>
  );
}
