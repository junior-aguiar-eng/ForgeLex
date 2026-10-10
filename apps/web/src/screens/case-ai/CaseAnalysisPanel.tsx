import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, requestApi } from '../../api-client';
import type { DocumentSource } from '../../documents/document-reader-model';

interface Source {
  documentId: string;
  versionId: string;
  anchorId: string;
  quote: string;
  relation: string;
}
interface Item {
  id: string;
  kind: 'FACT' | 'EVIDENCE' | 'TIMELINE' | 'ISSUE' | 'GAP';
  text: string;
  classification: string;
  sources: Source[];
  eventDate?: string;
  factItemId?: string;
  relation?: string;
}
interface Decision {
  action: 'ADOPT' | 'DISCARD';
  text: string;
  targetId?: string;
  decidedAt: string;
  decidedBy: string;
}
interface Summary {
  id: string;
  objective: string;
  revision: number;
  receivedAt: string;
  itemCount: number;
  pendingCount: number;
  application: { clientId: string };
}
interface Review {
  id: string;
  objective: string;
  revision: number;
  receivedAt: string;
  items: Item[];
  decisions: Record<string, Decision>;
}
const labels: Record<string, string> = {
  FACT: 'Fato',
  EVIDENCE: 'Prova',
  TIMELINE: 'Evento',
  ISSUE: 'Questão jurídica',
  GAP: 'Lacuna',
  EXTRACTED: 'Dado extraído',
  ALLEGATION: 'Alegação',
  SUPPORTED: 'Suporte indicado',
  DISPUTED: 'Controvertido',
  INFERENCE: 'Inferência',
  LEGAL_QUESTION: 'Questão jurídica',
  SUPPORTS: 'Suporte indicado',
  CONTRADICTS: 'Contradição indicada',
  CONTEXT: 'Contexto',
};
const button = 'px-3 py-2 rounded-lg border border-stone-300 text-sm disabled:opacity-50';

export function CaseAnalysisPanel({
  matterId,
  readOnly,
  onChanged,
  onSource,
  onAnalyze,
}: {
  matterId: string;
  readOnly: boolean;
  onChanged: () => Promise<void>;
  onSource: (source: DocumentSource) => void;
  onAnalyze: () => void;
}) {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [review, setReview] = useState<Review>();
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const live = useRef(true);
  const running = useRef(false);
  const base = `/api/v2/matters/${matterId}/analyses`;
  const api = <T,>(path: string, init?: RequestInit) => requestApi<T>(path, init, { sessionOnly: true });
  async function load() {
    const data = await api<Summary[]>(base);
    if (live.current) setSummaries(data);
  }
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    void api<Summary[]>(base, { signal: controller.signal })
      .then((s) => {
        if (live.current) setSummaries(s);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Não foi possível consultar análises.');
      });
    return () => {
      live.current = false;
      controller.abort();
    };
    // Parent remounts the panel for each case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);
  async function run(fn: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      if (live.current)
        setError(e instanceof ApiRequestError ? e.message : 'Não foi possível concluir. Sua seleção foi mantida.');
    } finally {
      running.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function open(id: string) {
    await run(async () => {
      const data = await api<Review>(`${base}/${id}`);
      if (live.current) {
        setReview(data);
        setEdited({});
        setSelected([]);
      }
    });
  }
  async function decide(ids: string[], action: 'ADOPT' | 'DISCARD') {
    if (!review || readOnly) return;
    await run(async () => {
      const data = await api<Review>(`${base}/${review.id}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: review.revision,
          decisions: ids.map((itemId) => ({
            itemId,
            action,
            ...(edited[itemId] !== undefined ? { text: edited[itemId] } : {}),
          })),
        }),
      });
      if (!live.current) return;
      setReview(data);
      setSelected([]);
      setNotice(action === 'ADOPT' ? 'Itens incorporados ao caso.' : 'Propostas descartadas.');
      await load();
      await onChanged();
    });
  }
  return (
    <section
      aria-label="Análises dos documentos"
      className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-4 break-words"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-editorial text-xl font-bold">Análises dos documentos</h3>
        <button type="button" className={button} disabled={busy} onClick={() => void run(load)}>
          Atualizar análises
        </button>
      </div>
      <p className="text-sm text-stone-600">
        A IA propõe; você confere o trecho e decide o que entra no caso. Suporte documental não confirma a veracidade do
        fato.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      {!summaries.length && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            Nenhuma análise recebida. Escolha documentos e objetivo, copie a instrução e peça a análise na conversa com
            sua IA.
          </p>
          {!readOnly && (
            <button type="button" className={button} onClick={onAnalyze}>
              Preparar análise
            </button>
          )}
        </div>
      )}
      {!!summaries.length && (
        <div className="space-y-2">
          {summaries.map((s) => (
            <div key={s.id} className="border rounded-lg p-3 flex flex-wrap justify-between items-center gap-3">
              <div>
                <p className="font-semibold text-sm">{s.objective}</p>
                <p className="text-xs text-stone-500">
                  {new Date(s.receivedAt).toLocaleString('pt-BR')} · {s.pendingCount} de {s.itemCount} propostas
                  aguardando conferência
                </p>
              </div>
              <button type="button" className={button} disabled={busy} onClick={() => void open(s.id)}>
                Conferir análise
              </button>
            </div>
          ))}
        </div>
      )}
      {review && (
        <div className="space-y-4 border-t pt-4">
          <h4 className="font-semibold">{review.objective}</h4>
          <p className="text-xs text-stone-600">
            Para incorporar uma prova vinculada, selecione também o fato relacionado ou incorpore-o primeiro. As
            referências originais permanecem registradas.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button + ' bg-cognac-700 text-white'}
              disabled={busy || readOnly || !selected.length}
              onClick={() => void decide(selected, 'ADOPT')}
            >
              Incorporar selecionados
            </button>
            <button
              type="button"
              className={button}
              disabled={busy || readOnly || !selected.length}
              onClick={() => void decide(selected, 'DISCARD')}
            >
              Descartar selecionados
            </button>
            <button type="button" className={button} disabled={busy} onClick={() => void open(review.id)}>
              Atualizar conferência
            </button>
          </div>
          {review.items.map((item) => {
            const decision = review.decisions[item.id];
            return (
              <article
                aria-label={`Proposta ${item.id}`}
                key={item.id}
                className="rounded-xl border border-stone-200 bg-[#FDFBF7] p-4 space-y-3"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="text-xs font-semibold">
                    {labels[item.kind]} · {labels[item.classification]}
                    {item.eventDate ? ` · ${item.eventDate}` : ''}
                  </p>
                  {decision ? (
                    <span className="text-xs font-semibold">
                      {decision.action === 'ADOPT' ? 'Incorporado' : 'Descartado'}
                    </span>
                  ) : (
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={busy || readOnly}
                        checked={selected.includes(item.id)}
                        onChange={(e) =>
                          setSelected((s) => (e.target.checked ? [...s, item.id] : s.filter((id) => id !== item.id)))
                        }
                      />
                      Selecionar proposta
                    </label>
                  )}
                </div>
                {decision ? (
                  <p className="text-sm whitespace-pre-wrap">{decision.text}</p>
                ) : (
                  <label className="block text-xs">
                    Texto da proposta
                    <textarea
                      className="input-control w-full mt-1 min-h-20"
                      maxLength={4000}
                      disabled={busy || readOnly}
                      value={edited[item.id] ?? item.text}
                      onChange={(e) => setEdited({ ...edited, [item.id]: e.target.value })}
                    />
                  </label>
                )}
                {item.factItemId && (
                  <p className="text-xs">
                    Relação proposta: {labels[item.relation ?? 'CONTEXT']} com “
                    {review.items.find((i) => i.id === item.factItemId)?.text}”.
                  </p>
                )}
                {item.sources.map((source, index) => (
                  <div key={index} className="text-sm border-l-2 border-cognac-200 pl-3 space-y-2">
                    <p className="text-xs font-semibold">{labels[source.relation]}</p>
                    <blockquote className="whitespace-pre-wrap">{source.quote}</blockquote>
                    <button
                      type="button"
                      className={button}
                      onClick={() =>
                        onSource({
                          matterId,
                          documentId: source.documentId,
                          versionId: source.versionId,
                          anchorId: source.anchorId,
                        })
                      }
                    >
                      Abrir fonte
                    </button>
                  </div>
                ))}
                <details className="text-xs text-stone-500">
                  <summary>Proposta original e histórico</summary>
                  <p className="whitespace-pre-wrap mt-2">{item.text}</p>
                  {decision && (
                    <p className="mt-2">
                      Conferido em {new Date(decision.decidedAt).toLocaleString('pt-BR')}. A incorporação não confirma
                      suficiência probatória.
                    </p>
                  )}
                </details>
                {!decision && !readOnly && (
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => void decide([item.id], 'DISCARD')}
                  >
                    Descartar
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
