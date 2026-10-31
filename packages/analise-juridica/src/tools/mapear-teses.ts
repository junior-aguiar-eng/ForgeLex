import { z } from 'zod';
import type { AgentTool } from '@forgelex/agent-core';
import { DispositivoCitadoSchema, NOMES_TOOLS, PrecedenteRefSchema, SessaoRefSchema } from '../contratos.js';
import {
  NAO_INFERIR,
  PROTOCOLO_VERIFICACAO,
  PrecedenteSaidaSchema,
  TriagemSaidaSchema,
  VerificacaoNormativaSchema,
  contarNaoVerificados,
  exigirEtapaPrevia,
  iniciarChamada,
  resumirPrecedentes,
  truncar,
  verificarDispositivos,
  verificarPrecedentes,
  type DepsAnalise,
} from './comum.js';

const ViabilidadeSchema = z.enum(['baixa', 'media', 'alta']);

const TeseSchema = z.object({
  tese: z.string().trim().min(5).max(1200),
  fundamento: z.string().trim().max(1500).optional(),
  viabilidade: ViabilidadeSchema,
  justificativa_viabilidade: z.string().trim().min(5).max(1500),
});

export const MapearTesesInputSchema = SessaoRefSchema.extend({
  resultado_peca_analisar: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Opcional: resultado de peca_analisar enviado diretamente, quando a sessão não o tem registrado.'),
  teses_sustentadas: z.array(TeseSchema).max(30).default([]),
  teses_adversas_potenciais: z.array(TeseSchema).max(30).default([]),
  precedentes: z
    .array(
      z.object({
        tese_relacionada: z.string().trim().max(600).optional(),
        referencia: PrecedenteRefSchema,
      }),
    )
    .max(30)
    .default([]),
  dispositivos_citados: z.array(DispositivoCitadoSchema).max(60).default([]),
}).refine((valor) => valor.teses_sustentadas.length + valor.teses_adversas_potenciais.length > 0, {
  message: 'Informe ao menos uma tese sustentada ou adversa potencial.',
  path: ['teses_sustentadas'],
});
export type MapearTesesInput = z.infer<typeof MapearTesesInputSchema>;

export const MapearTesesOutputSchema = z.object({
  sessao_analitica_id: z.string(),
  triagem: TriagemSaidaSchema,
  teses_sustentadas: z.array(TeseSchema),
  teses_adversas_potenciais: z.array(TeseSchema),
  precedentes: z.array(PrecedenteSaidaSchema.extend({ tese_relacionada: z.string().nullable() })),
  precedentes_nao_verificados: z.number(),
  verificacao_normativa: VerificacaoNormativaSchema,
  proxima_etapa_sugerida: z.string().nullable(),
});
export type MapearTesesOutput = z.infer<typeof MapearTesesOutputSchema>;

export function criarToolMapearTeses(deps: DepsAnalise): AgentTool<MapearTesesInput, MapearTesesOutput> {
  return {
    name: NOMES_TOOLS.mapearTeses,
    description:
      'Mapeia as teses sustentadas na peça e as teses potenciais da parte adversa, avalia a viabilidade de cada uma (baixa/média/alta, com justificativa) e vincula precedentes aplicáveis, cada um conferido pelo servidor em fonte oficial. ' +
      'MÉTODO: parta da estrutura produzida por peca_analisar (recuperada da sessão); para cada tese, indique o fundamento e o risco; liste os precedentes que você considera aplicáveis — o servidor devolve o status_verificacao de cada um. ' +
      'NÃO FAZ: não decompõe o documento (peca_analisar), não trata de prova ou ônus (avaliar_prova), não recomenda movimento processual (estrategia_definir) e não redige. ' +
      NAO_INFERIR +
      ' ' +
      PROTOCOLO_VERIFICACAO +
      ' SESSÃO: exige sessao_analitica_id de uma sessão existente com peca_analisar já executada (ou envie resultado_peca_analisar diretamente); não abre sessão nova com sentido.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: MapearTesesInputSchema,
    outputSchema: MapearTesesOutputSchema,
    timeoutMs: 60_000,
    execute: async (input, context) => {
      const chamada = await iniciarChamada(deps, context, input);
      exigirEtapaPrevia(chamada.sessao, 'analisar', NOMES_TOOLS.pecaAnalisar, input.resultado_peca_analisar);

      const verificados = await verificarPrecedentes(
        deps,
        input.precedentes.map((item) => item.referencia),
        context.abortSignal,
      );
      const precedentes = verificados.map((item, indice) => ({
        ...item,
        tese_relacionada: input.precedentes[indice]?.tese_relacionada ?? null,
      }));
      const naoVerificados = contarNaoVerificados(precedentes);
      const fase = chamada.triagem.fase_processual;
      const proxima =
        fase === 'postulatoria' || fase === 'saneamento_instrucao'
          ? NOMES_TOOLS.avaliarProva
          : NOMES_TOOLS.estrategiaDefinir;

      const saida: MapearTesesOutput = {
        sessao_analitica_id: chamada.id,
        triagem: chamada.triagem,
        teses_sustentadas: input.teses_sustentadas,
        teses_adversas_potenciais: input.teses_adversas_potenciais,
        precedentes,
        precedentes_nao_verificados: naoVerificados,
        verificacao_normativa: verificarDispositivos(input.dispositivos_citados),
        proxima_etapa_sugerida: proxima,
      };
      await deps.estado.estadoRegistrar(chamada.id, chamada.dono, 'mapear_teses', {
        teses_sustentadas: input.teses_sustentadas
          .slice(0, 10)
          .map((t) => ({ tese: truncar(t.tese, 160), viabilidade: t.viabilidade })),
        teses_adversas: input.teses_adversas_potenciais
          .slice(0, 10)
          .map((t) => ({ tese: truncar(t.tese, 160), viabilidade: t.viabilidade })),
        precedentes: resumirPrecedentes(precedentes),
        precedentes_nao_verificados: naoVerificados,
      });
      return { success: true, data: saida };
    },
  };
}
