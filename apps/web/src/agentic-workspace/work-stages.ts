import { statusText } from './execution-model';

/**
 * Etapas do trabalho (V3, tema gelo), derivadas só do que o servidor realmente informa: o status da execução, os
 * documentos lidos (SOURCE), a pergunta pendente (QUESTION), as entregas (DELIVERY) e o erro (ERROR). Não há etapa
 * inventada: onde o servidor não informa um passo (por exemplo, cada consulta de pesquisa), a tela não finge que sabe.
 */
export type StageState = 'done' | 'current' | 'waiting' | 'paused' | 'pending' | 'error';

export interface WorkStage {
  id: 'received' | 'reading' | 'working' | 'question' | 'delivery';
  label: string;
  detail?: string;
  state: StageState;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function workStages(input: { status: string; sources: number; deliveries: number; error: string }): WorkStage[] {
  const { status, sources, deliveries, error } = input;
  if (!status && !error) return [];
  const failed = Boolean(error) || status === 'FAILED';
  const cancelled = status === 'CANCELLED';
  const finished = status === 'COMPLETED';
  const waiting = status === 'WAITING_USER';
  const stages: WorkStage[] = [{ id: 'received', label: 'Pedido recebido', state: 'done' }];
  if (sources > 0) {
    stages.push({
      id: 'reading',
      label: 'Lendo o contexto do caso',
      detail: plural(sources, 'documento lido', 'documentos lidos'),
      state: 'done',
    });
  }
  stages.push({
    id: 'working',
    label: 'Trabalhando no pedido',
    ...(failed
      ? { state: 'error' as const, detail: statusText(status === 'FAILED' ? 'FAILED' : status, error) }
      : cancelled
        ? { state: 'error' as const, detail: statusText('CANCELLED') }
        : waiting
          ? { state: 'paused' as const, detail: 'Pausado até você responder' }
          : finished
            ? { state: 'done' as const }
            : status === 'RUNNING'
              ? { state: 'current' as const }
              : { state: 'pending' as const }),
  });
  if (waiting) {
    stages.push({
      id: 'question',
      label: 'Esperando a sua resposta',
      detail: 'Responda na conversa para continuar',
      state: 'waiting',
    });
  }
  const delivered = finished || deliveries > 0;
  stages.push({
    id: 'delivery',
    label: 'Entrega',
    ...(delivered
      ? {
          state: 'done' as const,
          ...(deliveries > 0 ? { detail: plural(deliveries, 'entrega preliminar', 'entregas preliminares') } : {}),
        }
      : { state: 'pending' as const }),
  });
  return stages;
}
