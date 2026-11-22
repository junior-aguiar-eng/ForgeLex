import type { StartInput } from './client';
import type { ActionId } from './execution-model';

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
 * conversa existente, e a análise alvo se localiza pelo caso. O contexto é só o que o usuário escreveu.
 */
export function structureAdjustInput(input: { objective: string; matterId: string; text: string }): StartInput {
  return {
    objective: input.objective,
    actionId: 'adjust_structure',
    matterId: input.matterId,
    context: { text: input.text, origin: 'USER', documents: [] },
  };
}
