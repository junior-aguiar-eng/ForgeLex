import type { StartInput } from './client';
import type { ActionId, Execution } from './execution-model';

/**
 * A aba Estrutura só torna o pedido um ajuste quando há estrutura a ajustar (fase `ready`). Com a aba vazia, carregando
 * ou com falha, o pedido segue o fluxo normal: a própria aba vazia orienta a pedir a análise pela conversa, e um relato
 * colado continua virando análise (E1b).
 */
export function pieceStructureTabActive(input: {
  ice: boolean;
  tab: string;
  matterId: string | null | undefined;
  ready: boolean;
}): boolean {
  return Boolean(input.ice && input.tab === 'estrutura' && input.matterId && input.ready);
}

/** Dica do campo de pedido enquanto o pedido corrige a estrutura do caso (só texto, sem controle novo). */
export const STRUCTURE_COMPOSER_PLACEHOLDER = 'Corrija a estrutura do caso (ex.: tire a P2 ou o fato 3 foi em 2021)…';

/** Um ajuste da estrutura concluído: a aba recarrega para mostrar o resultado. A chave muda a cada ajuste. */
export function structureRefreshKey(
  run: Pick<Execution, 'id' | 'status' | 'matterId'> & { actionId: string | null },
): string | undefined {
  return run.actionId === 'adjust_structure' && run.status === 'COMPLETED' && run.matterId ? run.id : undefined;
}

/**
 * E2: com a aba Estrutura da peça aberta, o pedido é uma correção da estrutura do caso. O contexto da tela decide, sem
 * opção nova no seletor. Só vale no modo Automático: a ação que o usuário escolheu no seletor nunca é sobrescrita, e a
 * orientação guiada segue as decisões dela. Sem caso, não há estrutura a ajustar.
 */
export function adjustsStructure(input: {
  structureTabActive?: boolean;
  guided: boolean;
  matterId: string | null | undefined;
  chosenAction?: ActionId;
}): boolean {
  return Boolean(input.structureTabActive && !input.guided && !input.chosenAction && input.matterId);
}

/**
 * O pedido de ajuste: ação explícita (o servidor só desvia relato colado quando não há ação, então uma correção longa
 * nunca vira "Analisar fatos e provas"), o caso da peça e uma conversa nova. O servidor recusa o ajuste dentro de uma
 * conversa existente, e a análise alvo se localiza pelo caso. O contexto é só o que o usuário escreveu: anexos e
 * matérias indicadas ficam de fora, porque o selo "informado por você" vale apenas para as palavras do próprio usuário.
 */
export function structureAdjustInput(input: { objective: string; matterId: string }): StartInput {
  return {
    objective: input.objective,
    actionId: 'adjust_structure',
    matterId: input.matterId,
    context: { text: input.objective, origin: 'USER', documents: [] },
  };
}
