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
import { ultimoAchado } from '../estado.js';

export const MOVIMENTOS = ['recorrer', 'contestar', 'acordar', 'aguardar', 'produzir_prova_especifica'] as const;
const MovimentoSchema = z.enum(MOVIMENTOS);
const NivelSchema = z.enum(['baixo', 'medio', 'alto']);

const OpcaoSchema = z.object({
  movimento: MovimentoSchema,
  justificativa_juridica: z.string().trim().min(5).max(2000),
  custo: NivelSchema,
  tempo: NivelSchema,
  risco: NivelSchema,
  ponderacao: z.string().trim().min(5).max(1500).describe('Como custo, tempo e risco pesam além do direito aplicável.'),
  precedentes: z.array(PrecedenteRefSchema).max(15).default([]),
});

export const EstrategiaDefinirInputSchema = SessaoRefSchema.extend({
  resultado_mapear_teses: z.record(z.unknown()).optional(),
  resultado_avaliar_prova: z.record(z.unknown()).optional(),
  opcoes: z.array(OpcaoSchema).min(2).max(5),
  recomendacao: MovimentoSchema,
  dispositivos_citados: z.array(DispositivoCitadoSchema).max(60).default([]),
}).superRefine((valor, ctx) => {
  if (!valor.opcoes.some((opcao) => opcao.movimento === valor.recomendacao)) {
    ctx.addIssue({ code: 'custom', path: ['recomendacao'], message: 'A recomendação deve ser um dos movimentos avaliados em opcoes.' });
  }
  const movimentos = valor.opcoes.map((opcao) => opcao.movimento);
  if (new Set(movimentos).size !== movimentos.length) {
    ctx.addIssue({ code: 'custom', path: ['opcoes'], message: 'Cada movimento deve aparecer uma única vez em opcoes.' });
  }
});
export type EstrategiaDefinirInput = z.infer<typeof EstrategiaDefinirInputSchema>;

export const EstrategiaDefinirOutputSchema = z.object({
  sessao_analitica_id: z.string(),
  triagem: TriagemSaidaSchema,
  recomendacao: MovimentoSchema,
  opcoes: z.array(OpcaoSchema.omit({ precedentes: true }).extend({ precedentes: z.array(PrecedenteSaidaSchema) })),
  avaliacao_prova_considerada: z.boolean(),
  precedentes_nao_verificados: z.number(),
  verificacao_normativa: VerificacaoNormativaSchema,
  proxima_etapa_sugerida: z.string().nullable(),
});
export type EstrategiaDefinirOutput = z.infer<typeof EstrategiaDefinirOutputSchema>;

export function criarToolEstrategiaDefinir(deps: DepsAnalise): AgentTool<EstrategiaDefinirInput, EstrategiaDefinirOutput> {
  return {
    name: NOMES_TOOLS.estrategiaDefinir,
    description:
      'Recomenda o movimento processual indicado — recorrer, contestar, acordar, aguardar ou produzir prova específica — ponderando custo, tempo e risco além do direito aplicável. ' +
      'MÉTODO: avalie ao menos duas opções com justificativa jurídica, custo, tempo, risco e ponderação; indique a recomendada, que deve estar entre as avaliadas; os precedentes citados são conferidos pelo servidor em fonte oficial. ' +
      'NÃO FAZ: não decompõe documento, não mapeia teses nem avalia prova (etapas anteriores) e não redige a peça (peca_redigir). ' +
      NAO_INFERIR + ' ' + PROTOCOLO_VERIFICACAO +
      ' SESSÃO: exige sessao_analitica_id existente com mapear_teses executada (ou resultado_mapear_teses direto); a avaliação de prova é considerada quando registrada (ou enviada em resultado_avaliar_prova).',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: EstrategiaDefinirInputSchema,
    outputSchema: EstrategiaDefinirOutputSchema,
    timeoutMs: 60_000,
    execute: async (input, context) => {
      const chamada = await iniciarChamada(deps, context, input);
      exigirEtapaPrevia(chamada.sessao, 'mapear_teses', NOMES_TOOLS.mapearTeses, input.resultado_mapear_teses);

      const opcoes: EstrategiaDefinirOutput['opcoes'] = [];
      let totalNaoVerificados = 0;
      for (const opcao of input.opcoes) {
        const precedentes = await verificarPrecedentes(deps, opcao.precedentes, context.abortSignal);
        totalNaoVerificados += contarNaoVerificados(precedentes);
        opcoes.push({ ...opcao, precedentes });
      }
      const proxima = ['recorrer', 'contestar', 'produzir_prova_especifica'].includes(input.recomendacao) ? NOMES_TOOLS.pecaRedigir : null;
      const saida: EstrategiaDefinirOutput = {
        sessao_analitica_id: chamada.id,
        triagem: chamada.triagem,
        recomendacao: input.recomendacao,
        opcoes,
        avaliacao_prova_considerada: Boolean(ultimoAchado(chamada.sessao, 'avaliar_prova') || input.resultado_avaliar_prova),
        precedentes_nao_verificados: totalNaoVerificados,
        verificacao_normativa: verificarDispositivos(input.dispositivos_citados),
        proxima_etapa_sugerida: proxima,
      };
      await deps.estado.estadoRegistrar(chamada.id, chamada.dono, 'estrategia', {
        recomendacao: input.recomendacao,
        opcoes: input.opcoes.map((o) => ({ movimento: o.movimento, custo: o.custo, tempo: o.tempo, risco: o.risco })),
        justificativa: truncar(input.opcoes.find((o) => o.movimento === input.recomendacao)!.justificativa_juridica, 300),
        precedentes: resumirPrecedentes(opcoes.flatMap((o) => o.precedentes)),
        precedentes_nao_verificados: totalNaoVerificados,
      });
      return { success: true, data: saida };
    },
  };
}
