import React, { useEffect, useState } from 'react';
import { getAccountClosureStatus, type AccountClosureSagaStatus, type AccountClosureStatus } from '../api-client';
import {
  completeClosureReceipt,
  readActiveClosureReceipt,
  readCompletedClosureReceipt,
  type ClosureReceipt,
  type CompletedClosureReceipt,
} from '../account-closure-storage';

export function isTerminalClosureStatus(status: AccountClosureSagaStatus): boolean {
  return status === 'COMPLETED' || status === 'RECONCILIATION_REQUIRED';
}

const statusLabels: Record<AccountClosureSagaStatus, string> = {
  REQUESTED: 'Solicitação recebida',
  ACCESS_BLOCKED: 'Acesso bloqueado; encerramento em andamento',
  IDENTITY_REMOVED: 'Identidade removida; demais etapas em andamento',
  CREDENTIALS_REVOKED: 'Credenciais revogadas; demais etapas em andamento',
  CONTENT_PURGING: 'Conteúdo privado em eliminação',
  RETAINED_ONLY: 'Verificação final em andamento',
  COMPLETED: 'Encerramento concluído',
  RECONCILIATION_REQUIRED: 'Acompanhamento pelo suporte necessário',
};

type ReceiptView = ClosureReceipt | CompletedClosureReceipt;

export function receiptForDownload(receipt: ReceiptView, status: AccountClosureStatus | null): ReceiptView {
  if (status?.status !== 'COMPLETED' || !('statusToken' in receipt)) return receipt;
  return {
    closureId: receipt.closureId,
    requestedAt: receipt.requestedAt,
    policyVersion: receipt.policyVersion,
    completedAt: status.completedAt ?? status.updatedAt,
  };
}

export const AccountClosureStatusView: React.FC<{
  receipt: ReceiptView | null;
  status: AccountClosureStatus | null;
  error?: string;
  onDownload?: () => void;
}> = ({ receipt, status, error, onDownload }) => {
  const completed = Boolean(receipt && 'completedAt' in receipt) || status?.status === 'COMPLETED';
  return (
    <main className="min-h-screen bg-[#FBF9F5] py-12">
      <div className="page-container max-w-3xl space-y-6">
        <p className="eyebrow">Conta · acompanhamento</p>
        <h1 className="font-editorial text-3xl font-bold text-stone-900">
          {completed ? 'Encerramento concluído' : 'Acompanhamento do encerramento'}
        </h1>
        {!receipt ? (
          <p role="alert">
            Não há recibo nesta aba. Se você fechou a aba antes da conclusão, use o recibo que exportou ou contate o
            suporte.
          </p>
        ) : (
          <>
            <section className="surface space-y-3 p-6">
              <p className="text-sm text-stone-700">
                Estado:{' '}
                {completed
                  ? statusLabels.COMPLETED
                  : status
                    ? statusLabels[status.status]
                    : 'Consultando a solicitação…'}
              </p>
              <p className="text-sm text-stone-600">
                Referência: <code>{receipt.closureId}</code>
              </p>
              <p className="text-sm text-stone-600">Solicitado em: {receipt.requestedAt}</p>
              {completed && 'completedAt' in receipt && (
                <p className="text-sm text-stone-600">Concluído em: {receipt.completedAt}</p>
              )}
              {status?.status === 'RECONCILIATION_REQUIRED' && (
                <p role="alert" className="text-sm text-amber-800">
                  Uma etapa exige reconciliação. Informe ao suporte apenas a referência acima; não envie o token de
                  acompanhamento.
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              )}
            </section>
            {'statusToken' in receipt && !completed && (
              <p className="text-sm text-stone-600">
                O acompanhamento depende desta aba. Antes de fechá-la, exporte e guarde o recibo em local seguro; ele
                contém um token secreto. Sem ele, procure o suporte.
              </p>
            )}
            {onDownload && (
              <button type="button" className="btn-secondary" onClick={onDownload}>
                {completed ? 'Baixar recibo sem segredo' : 'Exportar recibo de acompanhamento'}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
};

function downloadReceipt(receipt: ReceiptView): void {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `forgelex-encerramento-${receipt.closureId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export const AccountClosureStatusScreen: React.FC = () => {
  const [receipt, setReceipt] = useState<ReceiptView | null>(
    () => readActiveClosureReceipt() ?? readCompletedClosureReceipt(),
  );
  const [status, setStatus] = useState<AccountClosureStatus | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!receipt || !('statusToken' in receipt)) return undefined;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await getAccountClosureStatus(receipt.closureId, receipt.statusToken);
        if (!active) return;
        setStatus(next);
        setError(undefined);
        if (next.status === 'COMPLETED') {
          try {
            setReceipt(completeClosureReceipt(next.completedAt ?? next.updatedAt));
          } catch {
            setError(
              'O encerramento foi concluído, mas o recibo local não pôde ser atualizado. Não compartilhe o token de acompanhamento.',
            );
          }
          return;
        }
        if (isTerminalClosureStatus(next.status)) return;
      } catch {
        if (!active) return;
        setError('Não foi possível consultar o andamento. A consulta será repetida.');
      }
      if (active) timer = setTimeout(() => void poll(), 5_000);
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [receipt]);

  return (
    <AccountClosureStatusView
      receipt={receipt}
      status={status}
      error={error}
      onDownload={receipt ? () => downloadReceipt(receiptForDownload(receipt, status)) : undefined}
    />
  );
};
