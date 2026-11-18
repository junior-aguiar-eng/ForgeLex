import {
  lifecycleActions,
  type LifecycleAction,
  type LifecycleRecord,
} from '../screens/matter-lifecycle/lifecycle-model';

/** Mesmos limites da API: de 3 a 200 caracteres, depois de aparado. */
export const CASE_TITLE_MIN = 3;
export const CASE_TITLE_MAX = 200;

/** Por que o nome não serve, em texto para o cliente; sem valor, serve. */
export function caseTitleProblem(raw: string): string | undefined {
  const length = raw.trim().length;
  if (length === 0) return 'Escreva o nome do caso.';
  if (length < CASE_TITLE_MIN) return `O nome precisa ter pelo menos ${CASE_TITLE_MIN} letras.`;
  if (length > CASE_TITLE_MAX) return `O nome pode ter no máximo ${CASE_TITLE_MAX} letras.`;
  return undefined;
}

/**
 * Ações de ciclo de vida oferecidas na Mesa: arquivar, mover para a lixeira e restaurar. A exclusão definitiva (com
 * confirmação pelo nome e acompanhamento do diário) continua na tela do caso, onde mora hoje.
 */
export function deskLifecycleActions(record: Pick<LifecycleRecord, 'lifecycleState'>): LifecycleAction[] {
  return lifecycleActions(record.lifecycleState).filter((action) => action !== 'purge');
}

export interface ManagedCase extends LifecycleRecord {
  createdBy?: string;
}

/** Casos ativos, na forma que o seletor da Mesa usa, a partir de uma lista da API. */
export function activeCaseOptions(items: ManagedCase[]): Array<{ id: string; title: string }> {
  return items.filter((item) => (item.lifecycleState ?? 'ACTIVE') === 'ACTIVE').map(({ id, title }) => ({ id, title }));
}

/** Frase de aviso depois da operação, que diz o efeito sobre a IA quando há. */
export function lifecycleNotice(action: LifecycleAction): string {
  switch (action) {
    case 'archive':
      return 'Caso arquivado para consulta. O acesso pela IA foi encerrado.';
    case 'trash':
      return 'Caso movido para a lixeira. O acesso pela IA foi encerrado.';
    case 'restore':
      return 'Caso restaurado. Para usar na IA, autorize o acesso novamente.';
    case 'purge':
      return 'Exclusão definitiva concluída.';
  }
}
