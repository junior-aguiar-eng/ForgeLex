import { useEffect, useRef, useState } from 'react';
import { requestApi } from '../api-client';
import type { EditorialProposal } from './editorial-review-model';

type Command = {
  commandId: string;
  status: string;
  receipt?: { reservedCents: number; chargedCents: number; releasedCents: number; status: string };
  result?: { proposal: EditorialProposal };
};
const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function EditorialCommercialControls({
  base,
  draftId,
  versionId,
  policyVersion,
  maxCostCents,
  disabled,
  onProposal,
}: {
  base: string;
  draftId: string;
  versionId: string;
  policyVersion: string;
  maxCostCents: number;
  disabled: boolean;
  onProposal: (proposal: EditorialProposal) => Promise<void>;
}) {
  const storageKey = `forgelex:editorial:${base}:${draftId}:${versionId}`;
  const [requestId, setRequestId] = useState<string | null>(null);
  const [command, setCommand] = useState<Command | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [newReview, setNewReview] = useState(false);
  const presented = useRef<string | null>(null);
  const mounted = useRef(true);
  const presentation = useRef({ onProposal, disabled });
  useEffect(() => {
    presentation.current = { onProposal, disabled };
  }, [onProposal, disabled]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(storageKey);
        } catch {
          /* Server history remains authoritative. */
        }
        setRequestId(saved);
        const lookup = (key?: string) =>
          requestApi<{ command: Command | null }>(
            `${base}/commands?${new URLSearchParams({ draftId, versionId, ...(key ? { requestId: key } : {}) })}`,
            { signal: controller.signal },
            { sessionOnly: true },
          );
        let response = await lookup(saved ?? undefined);
        // A missing/in-flight saved request must keep its key, even if an older
        // failed review exists. Only a confirmed terminal request may yield to latest.
        const savedTerminal =
          saved && response.command && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(response.command.status);
        if (savedTerminal) response = await lookup();
        if (cancelled) return;
        setCommand(response.command);
        if (savedTerminal) {
          setRequestId(null);
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* Optional browser hint. */
          }
        }
        setNotFound(!response.command);
        setReady(true);
        if (response.command?.status === 'COMPLETED' && response.command.result && !presentation.current.disabled) {
          presented.current = response.command.commandId;
          await presentation.current.onProposal(response.command.result.proposal);
        }
      } catch {
        if (!cancelled) setError('Não foi possível conferir revisões anteriores. Atualize antes de iniciar.');
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      mounted.current = false;
    };
  }, [storageKey, base, draftId, versionId]);
  const active = !!command && ['QUEUED', 'RUNNING'].includes(command.status);
  const canRequestAgain =
    !!command && ['FAILED', 'CANCELLED'].includes(command.status) && command.receipt?.status !== 'ACTIVE';
  const accept = async (value: Command | null) => {
    if (!mounted.current) return;
    setCommand(value);
    if (value?.status === 'COMPLETED' && value.result && presented.current !== value.commandId && !disabled) {
      presented.current = value.commandId;
      await onProposal(value.result.proposal);
    }
  };
  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await requestApi<{ command: Command | null }>(
        `${base}/commands?${new URLSearchParams({ draftId, versionId, ...(requestId ? { requestId } : {}) })}`,
        {},
        { sessionOnly: true },
      );
      await accept(response.command);
      if (mounted.current) {
        setNotFound(!response.command);
        setReady(true);
      }
      if (!response.command && mounted.current)
        setError('Solicitação ainda não localizada. Atualize antes de autorizar novamente.');
    } catch {
      if (mounted.current)
        setError('Não foi possível recuperar a revisão. Atualize para conferir; nenhuma nova geração foi solicitada.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const start = async () => {
    if (!confirmed || busy || (command && !newReview) || (requestId && !notFound && !newReview) || disabled || !ready)
      return;
    setBusy(true);
    setError('');
    try {
      const id = newReview ? crypto.randomUUID() : (requestId ?? crypto.randomUUID());
      // Persist only the request identifier, never proposal text or credentials.
      try {
        sessionStorage.setItem(storageKey, id);
      } catch {
        /* Recovery also works through server history. */
      }
      setRequestId(id);
      setNotFound(false);
      setNewReview(false);
      setCommand(null);
      await accept(
        await requestApi<Command>(
          `${base}/commands`,
          {
            method: 'POST',
            headers: { 'idempotency-key': id },
            body: JSON.stringify({ draftId, versionId, confirmed: true, policyVersion }),
          },
          { sessionOnly: true },
        ),
      );
    } catch {
      if (mounted.current)
        setError('A resposta não foi confirmada. Atualize a revisão para recuperar o resultado e o comprovante.');
    } finally {
      if (mounted.current) {
        setBusy(false);
        setConfirmed(false);
      }
    }
  };
  const cancel = async () => {
    if (!command || !active || busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      await accept(
        await requestApi<Command>(
          `${base}/commands/${encodeURIComponent(command.commandId)}/cancel`,
          {
            method: 'POST',
            headers: { 'idempotency-key': `cancel:${command.commandId}` },
            body: JSON.stringify({ draftId, versionId }),
          },
          { sessionOnly: true },
        ),
      );
    } catch {
      if (mounted.current) setError('Cancelamento não confirmado. Atualize a revisão para conferir.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <section aria-label="Revisão com saldo" className="my-3 space-y-2 text-sm">
      {((!command && (!requestId || notFound)) || newReview) && (
        <>
          <p>Esta revisão custa até {money(maxCostCents)}. O saldo não utilizado será liberado.</p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || disabled || !ready}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Autorizo a revisão, com cobrança quando concluída, mesmo sem sugestões de alteração.
          </label>
          <button
            type="button"
            className="min-h-11 underline"
            disabled={!confirmed || busy || disabled || !ready}
            onClick={() => void start()}
          >
            Iniciar revisão
          </button>
        </>
      )}
      {(requestId || command || !ready) && (
        <button type="button" className="min-h-11 underline" disabled={busy} onClick={() => void refresh()}>
          Conferir andamento e recibo
        </button>
      )}
      {canRequestAgain && !newReview && (
        <button
          type="button"
          className="min-h-11 underline"
          disabled={busy || disabled}
          onClick={() => {
            setNewReview(true);
            setConfirmed(false);
          }}
        >
          Solicitar nova revisão
        </button>
      )}
      {active && (
        <>
          <p role="status">
            {command?.status === 'QUEUED' && !command.receipt
              ? 'Revisão ainda não iniciada. Nenhum saldo foi reservado.'
              : 'Revisão em andamento. Atualize para acompanhar.'}
          </p>
          <button
            type="button"
            className="min-h-11 underline"
            disabled={busy || disabled}
            onClick={() => void cancel()}
          >
            Cancelar revisão
          </button>
        </>
      )}
      {command?.status === 'COMPLETED' && (
        <p role="status">
          {command.result?.proposal.changes.length === 0 && command.result.proposal.substantiveSuggestions.length === 0
            ? 'Revisão concluída sem sugestões de alteração.'
            : 'Revisão concluída. Confira as sugestões.'}
        </p>
      )}
      {command && ['FAILED', 'CANCELLED'].includes(command.status) && (
        <p role="status">
          {command.status === 'CANCELLED' ? 'Revisão cancelada.' : 'Não foi possível concluir a revisão.'}
        </p>
      )}
      {command?.receipt && (
        <p>
          Reservado: {money(command.receipt.reservedCents)} · Cobrado: {money(command.receipt.chargedCents)} · Liberado:{' '}
          {money(command.receipt.releasedCents)}
          {command.receipt.status === 'ACTIVE' ? ' · Comprovante em atualização.' : ''}
        </p>
      )}
      {busy && <p role="status">Conferindo revisão…</p>}
      {error && <p role="alert">{error}</p>}
      <p className="text-xs text-stone-600">
        A revisão não aplica alterações à minuta. Confira a proposta antes de decidir.
      </p>
    </section>
  );
}
