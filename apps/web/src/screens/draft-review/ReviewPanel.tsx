import {
  reviewSummary,
  reviewCheckLabel,
  type DraftReviewRun,
  type DraftReviewFinding,
  type ReviewPoint,
} from './review-model';
export function ReviewPanel({
  latestRun,
  currentRun,
  findings,
  stale,
  onOpenPoint,
}: {
  latestRun?: DraftReviewRun;
  currentRun?: DraftReviewRun;
  findings: DraftReviewFinding[];
  stale: boolean;
  onOpenPoint: (point: ReviewPoint) => void;
}) {
  const shown = latestRun ?? currentRun;
  return (
    <section
      id="conferencia"
      aria-label="Conferência do rascunho"
      className="champagne-card bg-white rounded-2xl p-5 sm:p-6 space-y-4"
    >
      <h2 className="font-editorial text-xl font-bold text-stone-900">Conferência do rascunho</h2>
      <p role="status" className="text-sm text-stone-800">
        {stale ? 'Há alterações. Confira novamente a versão salva.' : reviewSummary(latestRun)}
      </p>
      {shown && (
        <p className="text-xs text-stone-600">
          Conferência {shown.runNumber} · {new Date(shown.startedAt).toLocaleString('pt-BR')}
        </p>
      )}
      {latestRun && latestRun.state !== 'COMPLETE' && currentRun && (
        <p className="text-xs text-stone-600">
          A conferência anterior foi concluída, mas esta tentativa ainda não permite encaminhar à aprovação.
        </p>
      )}
      <p className="text-xs text-stone-600">
        Conferimos referências cadastradas, vínculos com fatos e provas e o preenchimento das seções. A pertinência
        jurídica e o teor das citações exigem leitura humana.
      </p>
      {shown?.checks.map((check, index) => (
        <div
          key={index}
          className={`rounded-xl border p-3 space-y-2 ${check.state === 'CONFIRMED' ? 'border-stone-200 bg-stone-50' : 'border-amber-200 bg-amber-50'}`}
        >
          <p className="text-sm font-semibold text-stone-900">{reviewCheckLabel(check)}</p>
          <p className="text-sm text-stone-700">{check.message}</p>
          {check.targetType === 'AUTHORITY' && (
            <p className="text-xs text-stone-600">
              {check.humanConfirmed ? 'Conferência humana registrada' : 'Conferência humana ainda não registrada'}
            </p>
          )}
          <button
            type="button"
            onClick={() =>
              onOpenPoint({
                check,
                finding: findings.find(
                  (f) => f.code === check.code && f.sectionId === check.sectionId && f.targetId === check.targetId,
                ),
              })
            }
            className="btn-secondary"
          >
            Ver ponto
          </button>
        </div>
      ))}
    </section>
  );
}
