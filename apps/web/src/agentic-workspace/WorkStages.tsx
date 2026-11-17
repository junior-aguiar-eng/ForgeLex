import type { WorkStage } from './work-stages';

const DOT: Record<WorkStage['state'], string> = {
  done: 'border-accent bg-accent',
  current: 'border-2 border-accent bg-surface',
  waiting: 'border-2 border-warn bg-surface',
  paused: 'border-warn bg-surface',
  pending: 'border-line-control bg-surface',
  error: 'border-danger bg-danger',
};
const STATE_TEXT: Record<WorkStage['state'], string> = {
  done: 'concluída',
  current: 'em andamento',
  waiting: 'esperando você',
  paused: 'pausada',
  pending: 'ainda não começou',
  error: 'com problema',
};

/**
 * Etapas do trabalho na conversa (tema gelo). É uma lista ordenada, não uma região viva: quem anuncia o andamento é o
 * parágrafo "Andamento" e quem anuncia o erro é o aviso de erro, que continua sempre visível. O estado de cada etapa
 * também vai em texto (leitor de tela), não só na cor do ponto.
 */
export function WorkStages({ stages }: { stages: WorkStage[] }) {
  if (!stages.length) return null;
  return (
    <section aria-label="Etapas do trabalho" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-editorial text-[17px] font-semibold text-ink">Etapas do trabalho</h2>
      <ol className="mt-3 space-y-0">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex gap-3" data-stage={stage.id} data-state={stage.state}>
            <span className="flex flex-col items-center" aria-hidden="true">
              <span className={`mt-1.5 size-2.5 shrink-0 rounded-full border ${DOT[stage.state]}`} />
              {index < stages.length - 1 && <span className="min-h-[22px] w-px flex-1 bg-line" />}
            </span>
            <span className="min-w-0 pb-3">
              <span
                className={`block text-sm font-medium ${stage.state === 'pending' ? 'text-subtle' : 'text-ink'}`}
              >
                {stage.label}
                <span className="sr-only"> — {STATE_TEXT[stage.state]}</span>
              </span>
              {stage.detail && <span className="block break-words text-[13px] text-muted">{stage.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
