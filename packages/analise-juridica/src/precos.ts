import { NOMES_TOOLS } from './contratos.js';

/**
 * Pesos de cobrança deste módulo (centavos de BRL). Valores iniciais, no meio das
 * faixas definidas para o produto; calibrar com o uso real observado.
 * A triagem é embutida em toda chamada analítica; `jurisprudencia_verificar`
 * não tem preço próprio (custo embutido na tool que a invoca).
 */
export const PRECO_TRIAGEM_CENTS = 12;

export const PRECO_TOOL_CENTS = {
  [NOMES_TOOLS.pecaAnalisar]: 75,
  [NOMES_TOOLS.mapearTeses]: 125,
  [NOMES_TOOLS.avaliarProva]: 125,
  [NOMES_TOOLS.estrategiaDefinir]: 200,
  [NOMES_TOOLS.pecaRedigir]: 300,
} as const;

export type ToolAnaliticaNome = keyof typeof PRECO_TOOL_CENTS;

export function ehToolAnalitica(nome: string): nome is ToolAnaliticaNome {
  return Object.prototype.hasOwnProperty.call(PRECO_TOOL_CENTS, nome);
}

/** Preço cheio individual de uma chamada: preço da tool + triagem embutida. */
export function precoCheioCents(tool: ToolAnaliticaNome): number {
  return PRECO_TOOL_CENTS[tool] + PRECO_TRIAGEM_CENTS;
}

export const DESCONTO_COMBO_PERCENTUAL = 15;

export const COMBOS = {
  decisao: {
    id: 'decisao',
    descricao: 'Decisão sem redação: peca_analisar + mapear_teses + estrategia_definir',
    tools: [NOMES_TOOLS.pecaAnalisar, NOMES_TOOLS.mapearTeses, NOMES_TOOLS.estrategiaDefinir],
  },
  completo: {
    id: 'completo',
    descricao: 'Cinco funções analíticas completas',
    tools: [
      NOMES_TOOLS.pecaAnalisar,
      NOMES_TOOLS.mapearTeses,
      NOMES_TOOLS.avaliarProva,
      NOMES_TOOLS.estrategiaDefinir,
      NOMES_TOOLS.pecaRedigir,
    ],
  },
} as const;

export type ComboId = keyof typeof COMBOS;
export const COMBO_IDS = Object.keys(COMBOS) as [ComboId, ...ComboId[]];

export function precoComboCents(combo: ComboId): number {
  const cheio = COMBOS[combo].tools.reduce((total, tool) => total + precoCheioCents(tool as ToolAnaliticaNome), 0);
  return Math.round((cheio * (100 - DESCONTO_COMBO_PERCENTUAL)) / 100);
}
