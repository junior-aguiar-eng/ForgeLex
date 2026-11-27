import type { ReactNode } from 'react';
import { presentDelivery } from '../agentic-workspace/present-delivery';
import type { Delivery } from '../agentic-workspace/execution-model';

/** Cabeçalho da Mesa: título da tela inicial ou o cabeçalho curto de uma conversa aberta. */
export function WorkspaceHeader({
  centered = false,
  landing,
  guided,
  hasPiece,
  busy,
  onNew,
}: {
  /** Gelo, Mesa vazia: saudação centrada, na largura da caixa de pedido. */
  centered?: boolean;
  landing: boolean;
  /** Há uma orientação guiada em andamento (o título visível passa a ser só para leitor de tela). */
  guided: boolean;
  hasPiece: boolean;
  busy: boolean;
  onNew: () => void;
}) {
  return (
    <header
      className={
        landing && guided
          ? 'sr-only'
          : landing && centered
            ? 'mx-auto w-full max-w-[680px] text-center'
            : landing
            ? `mx-auto w-full max-w-3xl ${hasPiece ? 'pt-0' : 'pt-8'}`
            : 'mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3'
      }
    >
      {landing && guided ? (
        <h1 className="sr-only">Mesa Jurídica</h1>
      ) : landing ? (
        <>
          <h1 className={`font-editorial font-medium text-stone-900 ${hasPiece ? 'text-2xl' : 'text-3xl'}`}>
            O que você precisa fazer hoje?
          </h1>
          <p className={`text-stone-600 ${hasPiece ? 'mt-1 text-sm' : 'mt-2'}`}>
            Descreva o que precisa preparar ou mudar. A peça fica aberta ao lado da conversa.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-editorial text-xl text-stone-900">Trabalho</h1>
          <span className="grow" />
          <button type="button" className="btn-secondary min-h-11 lg:hidden" disabled={busy} onClick={onNew}>
            Nova conversa
          </button>
        </>
      )}
    </header>
  );
}

/** Aviso de que o resultado veio de uma versão anterior do contexto. */
export function ReevaluationNotice({
  runId,
  currentExecutionId,
}: {
  runId: string;
  currentExecutionId?: string | null;
}) {
  return (
    <div
      role="status"
      aria-label="Reavaliação necessária"
      className="rounded-xl border border-amber-300 bg-amber-50 p-4"
    >
      <p>Este resultado foi feito com uma versão anterior do contexto e precisa ser refeito.</p>
      {currentExecutionId && currentExecutionId !== runId && (
        <a
          className="inline-flex min-h-11 items-center underline"
          href={`/app/trabalho?executionId=${encodeURIComponent(currentExecutionId)}`}
        >
          Abrir o resultado atual
        </a>
      )}
    </div>
  );
}

/** "Trabalhando no seu pedido…" com o botão de cancelar. */
export function WorkingIndicator({
  cancelRequested,
  busy,
  onCancel,
}: {
  cancelRequested?: boolean;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
    <div role="status" className="flex items-center gap-3 text-stone-600">
      <span aria-hidden="true" className="inline-flex gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cognac-700" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cognac-700 [animation-delay:200ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cognac-700 [animation-delay:400ms]" />
      </span>
      <span>
        {cancelRequested ? 'Cancelando assim que a etapa em andamento terminar…' : 'Trabalhando no seu pedido…'}
      </span>
      <button
        type="button"
        className="ml-auto min-h-11 px-3 text-sm text-cognac-700 underline"
        disabled={busy || Boolean(cancelRequested)}
        onClick={onCancel}
      >
        Cancelar
      </button>
    </div>
  );
}

/** Respostas anteriores da conversa, no formato que `Conversation` mostra entre as mensagens. */
export function pastResponses(
  pastDeliveries: readonly { delivery: Delivery; createdAt: string }[],
): { id: string; createdAt: string; content: ReactNode }[] {
  return pastDeliveries.map(({ delivery, createdAt }) => ({
    id: delivery.id,
    createdAt,
    content: (
      <article className="rounded-xl border border-stone-200 bg-white p-4" aria-label="Resposta anterior">
        {delivery.delivery.document ? (
          <p>A peça “{delivery.delivery.document.title}” foi preparada nesta conversa.</p>
        ) : (
          presentDelivery(delivery.delivery).blocks.map((block, index) => (
            <p key={index} className="mb-2 whitespace-pre-wrap text-sm leading-7">
              {block.text}
            </p>
          ))
        )}
      </article>
    ),
  }));
}
