import type { ReactNode, RefObject } from 'react';
import { CanvasDialog } from '../screens/draft-review/DraftCanvas';
import { ReviewPanel } from '../screens/draft-review/ReviewPanel';
import type { DraftReviewRun } from '../screens/draft-review/review-model';
import { UndoNotice } from '../components/UndoNotice';
import { statusLabel, type DraftDetails } from './draft-studio-model';

type ReviewCheck = DraftReviewRun['checks'][number];

/** Confirmação de aprovação: o cliente registra a decisão; a conferência automática não a substitui. */
export function ApprovalDialog({
  dialogRef,
  title,
  versionNumber,
  attention,
  error,
  busy,
  confirmDisabled,
  onConfirm,
  onCancel,
}: {
  dialogRef: RefObject<HTMLDialogElement>;
  title: string;
  versionNumber: number;
  /** Pontos da conferência que ainda pedem atenção (nem confirmados nem sem aplicação); `undefined` sem conferência. */
  attention?: ReviewCheck[];
  error: string | null;
  busy: boolean;
  confirmDisabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="draft-approval-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
      className="rounded-2xl p-6 max-w-lg w-[calc(100%-2rem)] backdrop:bg-stone-900/50"
    >
      <h2 id="draft-approval-title" className="text-xl font-bold">
        Aprovar esta versão
      </h2>
      <p className="mt-3">
        {title} · Versão {versionNumber}
      </p>
      <p className="mt-3 text-sm">
        Você registra sua decisão sobre esta versão. A conferência automática não confirma a veracidade dos fatos nem a
        pertinência jurídica. Esta ação não publica ou envia o documento.
      </p>
      <ul className="mt-3 space-y-2 text-sm text-amber-900">
        {attention?.map((check, index) => (
          <li key={index}>{check.message}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        {attention?.length ?? 0} pontos de atenção na conferência. Consulte os alertas antes de confirmar.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex gap-3">
        <button type="button" className="btn-primary" disabled={confirmDisabled} onClick={onConfirm}>
          Confirmar aprovação
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
          Voltar à conferência
        </button>
      </div>
    </dialog>
  );
}

/** Conferência da peça: a versão salva, ou o histórico somente leitura de uma versão antiga. */
export function ReviewBody({
  details,
  requestedVersion,
  historyMode,
  historyLoading,
  historyVersion,
  historyRuns,
  activeVersionNumber,
  currentReview,
  busy,
  dirty,
  caseUnavailable,
  canApprove,
  approveDisabled,
  error,
  reviewStatus,
  onReview,
  onApprove,
}: {
  details: DraftDetails;
  requestedVersion?: string | null;
  /** A versão pedida na URL não é a aberta: mostra o histórico, sem ações. */
  historyMode: boolean;
  historyLoading: boolean;
  historyVersion: string;
  historyRuns: DraftReviewRun[];
  activeVersionNumber?: number;
  currentReview: ReactNode;
  busy: boolean;
  dirty: boolean;
  caseUnavailable: boolean;
  /** O botão "Aprovar esta versão" existe (ação primária e versão ativa). */
  canApprove: boolean;
  approveDisabled: boolean;
  error: string | null;
  reviewStatus: string | null;
  onReview: () => void;
  onApprove: () => void;
}) {
  return (
    <>
      {historyMode ? (
        <div className="space-y-3">
          <p role="status">
            Histórico da versão {details.versions.find((v) => v.id === requestedVersion)?.versionNumber ?? 'solicitada'}
            . Somente leitura.
          </p>
          {historyLoading && <p role="status">Carregando conferências…</p>}
          {!historyLoading && historyVersion === requestedVersion && !error && historyRuns.length === 0 && (
            <p>Nenhuma conferência registrada para esta versão.</p>
          )}
          {historyVersion === requestedVersion &&
            historyRuns.map((run) => <ReviewPanel key={run.id} latestRun={run} findings={[]} stale={false} />)}
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-600">Versão salva {activeVersionNumber}</p>
          {currentReview}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || dirty || caseUnavailable}
              onClick={onReview}
            >
              Conferir rascunho
            </button>
            {canApprove && (
              <button type="button" className="btn-primary" disabled={approveDisabled} onClick={onApprove}>
                Aprovar esta versão
              </button>
            )}
          </div>
          {dirty && <p className="mt-3 text-sm text-stone-600">Salve as alterações para conferir o texto editado.</p>}
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-900">
          {error}
        </p>
      )}
      {reviewStatus && (
        <p role="status" className="mt-3 text-sm text-emerald-800">
          {reviewStatus}
        </p>
      )}
    </>
  );
}

type ReviewBodyProps = Parameters<typeof ReviewBody>[0];

/** A conferência em diálogo (tema clássico). No gelo o mesmo conteúdo vira a aba Revisão da peça. */
export function ReviewDialog({ onClose, ...props }: ReviewBodyProps & { onClose: () => void }) {
  return (
    <CanvasDialog title="Conferência da peça" onClose={onClose}>
      <ReviewBody {...props} />
    </CanvasDialog>
  );
}

/** "Criar caso" recolhido no cabeçalho da peça; o cadastro em si fica com a tela. */
export function CreateCaseControls({
  name,
  busy,
  onName,
  onCreate,
}: {
  name: string;
  busy: boolean;
  onName: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <details>
      <summary className="cursor-pointer text-xs text-stone-600">Criar caso</summary>
      <label className="mt-2 block text-xs">
        Nome do caso
        <input
          className="mt-1 w-full rounded border p-2"
          value={name}
          maxLength={200}
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      <button type="button" className="mt-2 text-sm text-cognac-800" disabled={busy || !name.trim()} onClick={onCreate}>
        Criar caso e usar na peça
      </button>
    </details>
  );
}

/** Histórico de versões da peça com as conferências da versão aberta no histórico. */
export function VersionHistory({
  versions,
  loading,
  runs,
  onOpen,
}: {
  versions?: DraftDetails['versions'];
  loading: boolean;
  runs: DraftReviewRun[];
  onOpen: (versionId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {versions?.map((version) => (
        <button
          type="button"
          key={version.id}
          onClick={() => onOpen(version.id)}
          className="block w-full rounded-lg border border-stone-200 p-3 text-left"
        >
          Versão {version.versionNumber} · {statusLabel[version.status]}
        </button>
      ))}
      {loading && <p>Carregando…</p>}
      {runs.map((run) => (
        <div key={run.id}>
          {run.checks.map((check, index) => (
            <p key={index} className="py-2 text-sm">
              {check.message}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Avisos acima do editor: peça excluída (com "Desfazer"), link para outra versão ou entrega sem caso. */
export function PieceNotices({
  undo,
  busy,
  differentVersion,
  actionDisabled,
  importedWithoutMatter,
  onUndo,
  onDismissUndo,
  onUseOpenVersion,
}: {
  undo?: { title: string };
  busy: boolean;
  differentVersion: boolean;
  actionDisabled: boolean;
  importedWithoutMatter: boolean;
  onUndo: () => void;
  onDismissUndo: () => void;
  onUseOpenVersion: () => void;
}) {
  return (
    <>
      {undo && (
        <UndoNotice
          message={`Peça excluída: ${undo.title}. As versões, revisões e recibos foram preservados.`}
          busy={busy}
          onUndo={onUndo}
          onDismiss={onDismissUndo}
        />
      )}
      {differentVersion ? (
        <p className="px-5 pt-3 text-sm text-stone-600">
          Este link aponta para outra versão.{' '}
          <button type="button" className="underline" disabled={actionDisabled} onClick={onUseOpenVersion}>
            Usar versão aberta
          </button>
        </p>
      ) : importedWithoutMatter ? (
        <p className="px-5 pt-3 text-sm text-stone-600">
          Escolha um caso em “Abrir peça” para guardar esta entrega. Você já pode editar e exportar localmente.
        </p>
      ) : undefined}
    </>
  );
}
