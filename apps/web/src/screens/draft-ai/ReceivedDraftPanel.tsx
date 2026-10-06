import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../../api-client';
import { shouldApplyReceiptResponse, type Receipt } from './received-draft-model';
type Preview = { receipt: Receipt; version: { sections: { ordinal: number; title: string; content: string }[] } };
export function ReceivedDraftPanel({
  matterId,
  draftId,
  currentVersionId,
  dirty,
  onAdopt,
}: {
  matterId: string;
  draftId: string;
  currentVersionId?: string;
  dirty: boolean;
  onAdopt: (receipt: Receipt, choice: 'SAVE' | 'DISCARD' | 'ADOPT') => Promise<void>;
}) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [choose, setChoose] = useState<Receipt>();
  const identity = useRef({ matterId, draftId });
  identity.current = { matterId, draftId };
  const mounted = useRef(true),
    pending = useRef(false),
    generation = useRef(0);
  const path = `/api/v2/matters/${matterId}/drafts/${draftId}/ai-receipts`;
  const active = () =>
    mounted.current &&
    shouldApplyReceiptResponse({
      requestMatterId: matterId,
      requestDraftId: draftId,
      currentMatterId: identity.current.matterId,
      currentDraftId: identity.current.draftId,
    });
  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    const sequence = ++generation.current;
    try {
      const rows = await requestApi<Receipt[]>(path, undefined, { sessionOnly: true });
      if (active() && sequence === generation.current) setReceipts(rows);
    } catch {
      if (active()) setError('Não foi possível consultar os textos recebidos.');
    } finally {
      pending.current = false;
      if (active()) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    setReceipts([]);
    setPreview(undefined);
    setChoose(undefined);
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [matterId, draftId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function view(receipt: Receipt) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const value = await requestApi<Preview>(path + '/' + receipt.id, undefined, { sessionOnly: true });
      if (active()) setPreview(value);
    } catch {
      if (active()) setError('Não foi possível abrir o texto recebido.');
    } finally {
      pending.current = false;
      if (active()) setBusy(false);
    }
  }
  async function use(receipt: Receipt, choice: 'SAVE' | 'DISCARD' | 'ADOPT') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await onAdopt(receipt, choice);
      if (active()) {
        setChoose(undefined);
        setPreview(undefined);
      }
    } catch (error) {
      if (active())
        setError(error instanceof Error ? error.message : 'Não foi possível usar esta versão. Sua edição foi mantida.');
    } finally {
      pending.current = false;
      if (active()) setBusy(false);
    }
  }
  const waiting = receipts.filter((r) => r.versionId !== currentVersionId);
  const currentReceipt = receipts.find((r) => r.versionId === currentVersionId);
  return (
    <section
      aria-label="Textos recebidos da IA"
      className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Textos recebidos da IA</h3>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => void refresh()}>
          Atualizar textos recebidos
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {currentReceipt && (
        <p className="text-sm">
          Texto recebido da IA · versão {currentReceipt.versionNumber}. Confira as fontes e conclua a revisão antes de
          usar.
        </p>
      )}
      {!waiting.length && <p className="text-sm text-stone-600">Nenhum texto aguardando sua escolha.</p>}
      {waiting.map((r) => (
        <article key={r.id} className="space-y-2 text-sm">
          <p className="font-semibold">Texto recebido da IA — Aguardando revisão</p>
          <p>
            Versão {r.versionNumber} · {new Date(r.receivedAt).toLocaleString('pt-BR')}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void view(r)}>
              Ver texto recebido
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={() => (dirty ? setChoose(r) : void use(r, 'ADOPT'))}
            >
              Usar esta versão
            </button>
          </div>
        </article>
      ))}
      {preview && (
        <div className="border-t pt-3 space-y-3">
          <p className="text-sm font-semibold">Texto recebido · versão {preview.receipt.versionNumber}</p>
          {preview.version.sections.map((s) => (
            <article key={s.ordinal}>
              <h4 className="font-semibold">{s.title}</h4>
              <p className="whitespace-pre-wrap text-sm">{s.content}</p>
            </article>
          ))}
          <button type="button" className="btn-secondary" onClick={() => setPreview(undefined)}>
            Fechar texto recebido
          </button>
        </div>
      )}
      {choose && (
        <div className="border-t pt-3 space-y-3">
          <p className="text-sm">Há alterações não salvas. Escolha como continuar antes de usar o texto recebido.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void use(choose, 'SAVE')}>
              Salvar minha edição e usar
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void use(choose, 'DISCARD')}>
              Descartar minha edição e usar
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => setChoose(undefined)}>
              Continuar editando
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
