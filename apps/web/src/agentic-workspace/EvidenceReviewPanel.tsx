import { useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../api-client';

interface Item {
  id: string;
  kind: 'FACT' | 'EVIDENCE' | 'TIMELINE' | 'ISSUE' | 'GAP';
  text: string;
  classification: string;
  blockedReasons: string[];
  references: { sourceId: string; quote: string; relation: string }[];
  sources: { documentId: string; versionId: string; anchorId: string; quote: string }[];
  factItemId?: string;
  eventDate?: string;
  dateText?: string;
}
interface Review {
  deliveryId: string;
  matterId: string;
  revision: number;
  reviewToken: string;
  items: Item[];
  decisions: Record<string, { action: 'ADOPT' | 'DISCARD'; text: string; decidedAt: string; eventDate?: string }>;
}
const labels = {
  FACT: 'Fato alegado',
  EVIDENCE: 'Prova documental',
  TIMELINE: 'Evento',
  ISSUE: 'Questão controvertida',
  GAP: 'Lacuna',
};
const relations: Record<string, string> = {
  SUPPORTS: 'Trecho relacionado',
  CONTRADICTS: 'Trecho contrário ao relato',
  CONTEXT: 'Contexto',
};
const api = <T,>(path: string, init?: RequestInit) => requestApi<T>(path, init, { sessionOnly: true });

/** Selection starts empty. A dependent fact is never selected or approved implicitly. */
export function EvidenceReviewPanel({
  deliveryId,
  sources,
  onSource,
}: {
  deliveryId: string;
  sources: { id: string; n: number; label: string; kind: string }[];
  onSource: (n: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const [review, setReview] = useState<Review | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<string | null>(null);
  const path = `/api/agentic/deliveries/${encodeURIComponent(deliveryId)}/evidence-review`;
  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      const current = await api<Review>(path);
      setReview(current);
      setOpen(true);
      setSelected((previous) => previous.filter((id) => !current.decisions[id]));
      pending.current = null;
      setUncertain(false);
      setNotice('');
    } catch {
      setError('Não foi possível abrir os itens do caso. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };
  const send = async (body: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<Review>(`${path}/decisions`, { method: 'POST', body });
      setReview(result);
      setSelected([]);
      pending.current = null;
      setUncertain(false);
      setNotice(actionNotice(body));
      setOpen(false);
    } catch (failure) {
      const definitive =
        !uncertain && failure instanceof ApiRequestError && failure.status >= 400 && failure.status < 500;
      if (definitive) {
        pending.current = null;
        setUncertain(false);
      } else setUncertain(true);
      setError(
        definitive
          ? 'Não foi possível guardar sua decisão. Atualize os itens e tente novamente. Seus textos foram preservados.'
          : 'Não foi possível confirmar se a decisão foi salva. Use Verificar decisão para conferir.',
      );
    } finally {
      setBusy(false);
    }
  };
  const decide = async (action: 'ADOPT' | 'DISCARD') => {
    if (!review || !selected.length || busy) return;
    setError('');
    if (selected.length > 50) {
      setError('Selecione até 50 itens por decisão.');
      return;
    }
    const items = review.items.filter((item) => selected.includes(item.id));
    if (action === 'ADOPT') {
      if (items.some((item) => item.blockedReasons.length)) {
        setError('Há itens com fonte indisponível. Retire-os da seleção ou descarte-os.');
        return;
      }
      if (
        items.some(
          (item) =>
            item.factItemId &&
            review.decisions[item.factItemId]?.action !== 'ADOPT' &&
            !selected.includes(item.factItemId),
        )
      ) {
        setError('Selecione também o fato relacionado à prova, após revisá-lo. Nada foi incorporado.');
        return;
      }
      if (
        items.some(
          (item) =>
            (edits[item.id] ?? item.text).trim().length < 3 || (edits[item.id] ?? item.text).trim().length > 4000,
        )
      ) {
        setError('Cada texto aprovado precisa ter entre 3 e 4.000 caracteres.');
        return;
      }
      if (items.some((item) => item.kind === 'TIMELINE' && !(dates[item.id] ?? item.eventDate))) {
        setError('Informe a data dos eventos que deseja incorporar.');
        return;
      }
    }
    const body = JSON.stringify({
      approved: true,
      commandId: crypto.randomUUID(),
      expectedRevision: review.revision,
      reviewToken: review.reviewToken,
      decisions: items.map((item) => ({
        itemId: item.id,
        action,
        ...(action === 'ADOPT'
          ? {
              text: edits[item.id] ?? item.text,
              ...(item.kind === 'TIMELINE' ? { eventDate: dates[item.id] ?? item.eventDate } : {}),
            }
          : {}),
      })),
    });
    pending.current = body;
    await send(body);
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
  return (
    <div>
      <button
        className="min-h-11 text-sm underline"
        disabled={busy}
        onClick={() => {
          if (review) setOpen(true);
          else void refresh();
        }}
      >
        Guardar no caso
      </button>
      {!open && messages}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-champagne-border bg-white p-5 text-stone-900 shadow-xl backdrop:bg-stone-900/30 sm:p-6"
      >
        <div className="flex items-center justify-between gap-4">
          <h3 id={titleId} className="font-editorial text-xl">
            Guardar no caso
          </h3>
          <button autoFocus className="min-h-11 px-2 text-sm underline" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </div>
        <p className="mb-4 text-sm text-stone-600">
          Escolha o que deseja guardar. Você pode editar os textos antes de aprovar.
        </p>
        <div className="divide-y divide-champagne-border">
          {review?.items.map((item, index) => {
            const decision = review.decisions[item.id];
            return (
              <fieldset key={item.id} disabled={busy || uncertain} className="min-w-0 space-y-2 py-4">
                <legend className="sr-only">
                  {labels[item.kind]} {index + 1}
                </legend>
                {decision ? (
                  <p className="text-sm">
                    <span className="text-stone-500">
                      {decision.action === 'ADOPT' ? 'Guardado no caso' : 'Descartado'}:{' '}
                    </span>
                    {decision.text}
                  </p>
                ) : (
                  <>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        aria-label={`Selecionar item ${index + 1}`}
                        checked={selected.includes(item.id)}
                        onChange={(e) =>
                          setSelected((previous) =>
                            e.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id),
                          )
                        }
                      />
                      <span>
                        <span className="mb-1 block text-xs text-stone-500">
                          {labels[item.kind]}
                          {item.classification === 'DISPUTED' ? ' · controvertido' : ''}
                        </span>
                        {edits[item.id] ?? item.text}
                      </span>
                    </label>
                    <details className="ml-6 text-sm">
                      <summary className="min-h-11 cursor-pointer py-2 underline">Editar texto</summary>
                      <textarea
                        aria-label={`Texto do item ${index + 1}`}
                        rows={3}
                        className="w-full rounded border border-stone-300 p-2"
                        value={edits[item.id] ?? item.text}
                        onChange={(e) => setEdits((previous) => ({ ...previous, [item.id]: e.target.value }))}
                      />
                    </details>
                    {item.kind === 'TIMELINE' && (
                      <label className="ml-6 block text-sm">
                        Data do evento
                        <input
                          aria-label={`Data do item ${index + 1}`}
                          type="date"
                          className="ml-2 rounded border p-2"
                          value={dates[item.id] ?? item.eventDate ?? ''}
                          onChange={(e) => setDates((previous) => ({ ...previous, [item.id]: e.target.value }))}
                        />
                        {item.dateText && <span className="block text-stone-500">No relato: {item.dateText}</span>}
                      </label>
                    )}
                  </>
                )}
                {item.blockedReasons.length > 0 && !decision && (
                  <p className="ml-6 text-sm text-red-800">A fonte precisa ser conferida antes de guardar este item.</p>
                )}
                {item.references.length > 0 && (
                  <details className="ml-6 text-sm">
                    <summary className="min-h-11 cursor-pointer py-2 underline">Conferir fontes</summary>
                    {item.references.map((ref, i) => {
                      const source = sources.find((source) => source.id === ref.sourceId);
                      return (
                        <blockquote key={i} className="mb-3 border-l-2 border-cognac-300 pl-3 text-stone-700">
                          {relations[ref.relation]}: “{ref.quote}”
                          {source && (
                            <button
                              className="block min-h-11 underline"
                              onClick={() => {
                                setOpen(false);
                                onSource(source.n);
                              }}
                            >
                              Abrir {source.label}
                            </button>
                          )}
                        </blockquote>
                      );
                    })}
                  </details>
                )}
              </fieldset>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="btn-primary min-h-11"
            disabled={busy || uncertain || !selected.length}
            onClick={() => void decide('ADOPT')}
          >
            Aprovar e guardar
          </button>
          <button
            className="btn-secondary min-h-11"
            disabled={busy || uncertain || !selected.length}
            onClick={() => void decide('DISCARD')}
          >
            Descartar selecionados
          </button>
          {uncertain && (
            <button
              disabled={busy}
              className="btn-secondary min-h-11"
              onClick={() => pending.current && void send(pending.current)}
            >
              Verificar decisão
            </button>
          )}
          {error && !uncertain && (
            <button className="min-h-11 text-sm underline" disabled={busy} onClick={() => void refresh()}>
              Atualizar itens
            </button>
          )}
        </div>
        {open && <div className="mt-3">{messages}</div>}
      </dialog>
    </div>
  );
}

function actionNotice(body: string): string {
  const { decisions } = JSON.parse(body) as { decisions: { action: string }[] };
  return decisions.every((decision) => decision.action === 'DISCARD')
    ? 'Itens descartados.'
    : 'Itens aprovados e guardados no caso.';
}
