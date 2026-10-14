import { z } from 'zod';
import type { AgentTool } from '@forgelex/agent-core';
import { ID_SESSAO_NOVA, NOMES_TOOLS } from '../contratos.js';
import { COMBO_IDS, COMBOS, DESCONTO_COMBO_PERCENTUAL, precoComboCents } from '../precos.js';

export const ComboAtivarInputSchema = z.object({
  sessao_analitica_id: z.string().trim().min(1).max(120).refine((id) => id !== ID_SESSAO_NOVA, 'Abra a sessão antes de ativar um combo.'),
  combo: z.enum(COMBO_IDS),
});
export type ComboAtivarInput = z.infer<typeof ComboAtivarInputSchema>;

export const ComboAtivarOutputSchema = z.object({
  sessao_analitica_id: z.string(),
  combo: z.enum(COMBO_IDS),
  preco_cents: z.number(),
  tools_incluidas: z.array(z.string()),
});
export type ComboAtivarOutput = z.infer<typeof ComboAtivarOutputSchema>;

/**
 * A ativação em si (débito do pacote + gravação do combo) é executada pela cobrança do módulo
 * (`CobrancaAnalise.ativarCombo`); esta definição existe para listagem e validação de entrada.
 */
export function criarToolComboAtivar(): AgentTool<ComboAtivarInput, ComboAtivarOutput> {
  const catalogo = COMBO_IDS.map((id) => `"${id}" (${COMBOS[id].descricao}; R$ ${(precoComboCents(id) / 100).toFixed(2)})`).join('; ');
  return {
    name: NOMES_TOOLS.comboAtivar,
    description:
      `Ativa, no início de uma sequência, um pacote pré-pago para uma sessao_analitica_id já existente: ${catalogo}. ` +
      `As chamadas seguintes das tools incluídas, nessa sessão, descontam do pacote (${DESCONTO_COMBO_PERCENTUAL}% abaixo da soma dos preços individuais) em vez de cobrar o preço cheio; cada tool incluída é coberta uma vez. ` +
      'Não há reembolso retroativo de chamadas anteriores à ativação. NÃO FAZ análise nenhuma: só cobra o pacote e o associa à sessão.',
    impactLevel: 'L3_INTERNAL_MUTATION',
    inputSchema: ComboAtivarInputSchema,
    outputSchema: ComboAtivarOutputSchema,
    execute: async () => {
      throw new Error('ANALISE_COMBO_VIA_COBRANCA');
    },
  };
}
