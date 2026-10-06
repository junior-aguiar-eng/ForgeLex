export type { DraftReviewRun, DraftReviewCheck, DraftReviewFinding } from '../../../../../packages/domain/src/index';
import type { DraftReviewRun, DraftReviewCheck, DraftReviewFinding } from '../../../../../packages/domain/src/index';
export interface ReviewPoint {
  check: DraftReviewCheck;
  finding?: DraftReviewFinding;
}
export function reviewSummary(run?: DraftReviewRun): string {
  if (!run) return 'Conferência pendente';
  if (run.state === 'RUNNING') return 'Conferência em andamento';
  if (run.state === 'INCOMPLETE') return 'Não foi possível concluir a conferência';
  if (run.status === 'BLOCKED') return 'Há pontos que precisam de correção';
  if (run.status === 'WARNINGS') return 'Conferência concluída com pontos de atenção';
  return 'Conferência concluída';
}
export function reviewCheckLabel(check: DraftReviewCheck): string {
  if (check.source?.method === 'CASE_DOCUMENT' && check.state === 'CONFIRMED') return 'Documento do caso localizado';
  if (check.code === 'AUTHORITY_NOT_FOUND') return 'Não localizada no acervo';
  if (check.kind === 'CITATION' && check.state === 'CONFIRMED')
    return check.source?.method === 'PERSISTED_CORPUS' ? 'Localizada no acervo' : 'Localizada na fonte consultada';
  return {
    CONFIRMED: 'Conferido',
    ATTENTION: 'Precisa de atenção',
    UNAVAILABLE: 'Não foi possível conferir',
    NOT_APPLICABLE: 'Fora do alcance da conferência',
  }[check.state];
}
