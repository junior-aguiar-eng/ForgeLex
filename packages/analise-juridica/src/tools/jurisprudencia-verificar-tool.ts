import { z } from 'zod';
import type { AgentTool } from '@forgelex/agent-core';
import { NOMES_TOOLS, PrecedenteRefSchema, PrecedenteVerificadoSchema } from '../contratos.js';
import type { JurisprudenciaVerificador } from '../jurisprudencia-verificar.js';

const EntradaSchema = z.object({ precedentes: z.array(PrecedenteRefSchema).min(1).max(40) });
const SaidaSchema = z.object({ precedentes: z.array(PrecedenteVerificadoSchema) });

/**
 * Registrada no ToolRegistry para uso interno das demais tools, mas fora da lista de tools
 * expostas ao cliente MCP: não é cobrada nem chamada isoladamente (custo embutido nas tools que a usam).
 */
export function criarToolJurisprudenciaVerificar(
  verificador: JurisprudenciaVerificador,
): AgentTool<z.infer<typeof EntradaSchema>, z.infer<typeof SaidaSchema>> {
  return {
    name: NOMES_TOOLS.jurisprudenciaVerificar,
    description:
      'Interna. Confirma precedentes (qualquer tribunal) por busca ao vivo em fontes oficiais; retorna status_verificacao confirmado_busca_externa (com a fonte) ou nao_verificado (com o motivo). Nunca inventa confirmação.',
    impactLevel: 'L0_OBSERVATION',
    inputSchema: EntradaSchema,
    outputSchema: SaidaSchema,
    timeoutMs: 60_000,
    execute: async (input, context) => ({
      success: true,
      data: { precedentes: await verificador.verificarTodos(input.precedentes, context.abortSignal) },
    }),
  };
}
