import { useEffect, useState } from 'react';
import { reais, type CommercialAuthorization, type CommercialQuote, type CommercialReceipt } from './commercial-model';
import type { WorkspaceClient } from './client';
import { observeCommercialReceipt } from './commercial-receipt-observer';

export function CommercialAuthorizationPanel({
  client,
  busy,
  onConfirm,
  onBack,
}: {
  client: WorkspaceClient;
  busy: boolean;
  onConfirm: (authorization: CommercialAuthorization) => void;
  onBack?: () => void;
}) {
  const [quote, setQuote] = useState<CommercialQuote>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    client
      .commercialQuote()
      .then((value) => {
        if (active) setQuote(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [client, attempt]);
  return (
    <section aria-label="Autorizar trabalho" className="space-y-3 rounded-xl border border-cognac-400 bg-cognac-50 p-4">
      {quote ? (
        <CommercialPriceReview quote={quote} busy={busy} onConfirm={onConfirm} />
      ) : (
        <p role="status">
          {failed
            ? 'Não foi possível consultar o preço. Seu pedido foi preservado.'
            : 'Consultando o preço do trabalho…'}
        </p>
      )}
      {failed && (
        <button type="button" className="btn-secondary min-h-11" onClick={() => setAttempt((value) => value + 1)}>
          Tentar novamente
        </button>
      )}
      {onBack && (
        <button type="button" disabled={busy} className="block min-h-11 underline" onClick={onBack}>
          Voltar
        </button>
      )}
    </section>
  );
}

export function CommercialReceiptPanel({
  client,
  executionId,
  refreshKey,
}: {
  client: WorkspaceClient;
  executionId: string;
  refreshKey: string;
}) {
  const [result, setResult] = useState<{ id: string; receipt: CommercialReceipt }>();
  const [failedId, setFailedId] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    return observeCommercialReceipt(
      () => client.commercialReceipt(executionId),
      (receipt) => {
        setResult({ id: executionId, receipt });
        setFailedId('');
      },
      () => setFailedId(executionId),
    );
  }, [client, executionId, refreshKey, attempt]);
  return (
    <div className="space-y-3">
      {result?.id === executionId && <CommercialReceiptDetails receipt={result.receipt} />}
      {failedId === executionId && (
        <p role="status">
          Comprovante temporariamente indisponível.{' '}
          <button type="button" className="min-h-11 underline" onClick={() => setAttempt((value) => value + 1)}>
            Consultar comprovante
          </button>
        </p>
      )}
    </div>
  );
}

export function CommercialPriceReview({
  quote,
  busy,
  onConfirm,
}: {
  quote: CommercialQuote;
  busy: boolean;
  onConfirm: (authorization: CommercialAuthorization) => void;
}) {
  const sufficient = quote.availableCents >= quote.maxCostCents;
  return (
    <div className="space-y-3" aria-label="Preço do trabalho">
      <p>Este trabalho custa até {reais(quote.maxCostCents)}. O saldo não utilizado será liberado.</p>
      <p className="text-sm text-stone-600">
        Sem entrega utilizável, não há cobrança. Ao cancelar, uma entrega parcial utilizável pode ser cobrada dentro
        deste limite.
      </p>
      <p className="text-sm text-stone-600">
        Ao iniciar, o pedido e as fontes selecionadas serão enviados à OpenAI para processamento.{' '}
        <a href="/legal/privacidade.html" target="_blank" rel="noreferrer" className="underline">
          Privacidade
        </a>
      </p>
      {!sufficient && <p role="alert">Saldo insuficiente para reservar este trabalho.</p>}
      <button
        type="button"
        className="btn-primary min-h-11"
        disabled={busy || !sufficient}
        onClick={() => onConfirm({ confirmed: true, policyVersion: quote.policyVersion })}
      >
        Iniciar trabalho
      </button>
    </div>
  );
}

export function CommercialReceiptDetails({ receipt }: { receipt: CommercialReceipt }) {
  return (
    <div className="space-y-2">
      {receipt.status === 'ACTIVE' && (
        <p role="status" className="text-sm text-stone-600">
          Valores em atualização. O comprovante final será exibido após o fechamento.
        </p>
      )}
      <details className="border-t border-champagne-border-subtle pt-2">
        <summary className="min-h-11 cursor-pointer text-sm text-stone-600 underline">Custo deste trabalho</summary>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          {(
            [
              ['Reservado', receipt.reservedCents],
              ['Cobrado', receipt.chargedCents],
              ['Liberado', receipt.releasedCents],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className="font-semibold">{reais(value)}</dd>
            </div>
          ))}
          {(receipt.expiredPromoCents ?? 0) > 0 && (
            <div>
              <dt>Crédito expirado</dt>
              <dd className="font-semibold">{reais(receipt.expiredPromoCents!)}</dd>
            </div>
          )}
        </dl>
      </details>
    </div>
  );
}
