import { z } from 'zod';
import type { AgentTool } from '@forgelex/agent-core';
import { DomainError } from '@forgelex/domain';
import {
  AVISO_OBRIGATORIO,
  DispositivoCitadoSchema,
  NOMES_TOOLS,
  PrecedenteRefSchema,
  SessaoRefSchema,
} from '../contratos.js';
import {
  NAO_INFERIR,
  PROTOCOLO_VERIFICACAO,
  PrecedenteSaidaSchema,
  TriagemSaidaSchema,
  VerificacaoNormativaSchema,
  contarNaoVerificados,
  extrairCitacoes,
  iniciarChamada,
  resumirPrecedentes,
  semAcentoMinusculo,
  truncar,
  verificarDispositivos,
  verificarPrecedentes,
  type DepsAnalise,
} from './comum.js';

const ApontamentoSchema = z
  .object({
    trecho_original: z.string().min(1).max(5000).describe('Trecho exato do texto original a substituir.'),
    substituicao: z.string().max(8000),
    motivo: z.string().trim().min(3).max(600).describe('Apontamento da análise prévia que justifica a mudança.'),
    ocorrencia: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe('Qual ocorrência (1ª, 2ª…) quando o trecho se repete.'),
  })
  .strict();

const comum = {
  dispositivos_citados: z.array(DispositivoCitadoSchema).max(60).default([]),
  citacoes_precedentes: z.array(PrecedenteRefSchema).max(40).default([]),
};

// Modos nunca combinados: cada variante é estrita e rejeita campos da outra.
const CorrecaoDirigidaSchema = SessaoRefSchema.extend({
  modo: z.literal('correcao_dirigida'),
  texto_original: z.string().min(30).max(400_000),
  apontamentos: z.array(ApontamentoSchema).min(1, 'correcao_dirigida exige ao menos um apontamento.').max(100),
  ...comum,
}).strict();

const RedacaoIntegralSchema = SessaoRefSchema.extend({
  modo: z.literal('redacao_integral'),
  instrucoes: z.string().trim().min(10).max(20_000),
  texto_peca: z.string().min(100).max(400_000).describe('Peça redigida por você a partir das instruções.'),
  ...comum,
}).strict();

export const PecaRedigirInputSchema = z.discriminatedUnion('modo', [CorrecaoDirigidaSchema, RedacaoIntegralSchema]);
export type PecaRedigirInput = z.infer<typeof PecaRedigirInputSchema>;

export const PecaRedigirOutputSchema = z.object({
  sessao_analitica_id: z.string(),
  triagem: TriagemSaidaSchema,
  modo: z.enum(['correcao_dirigida', 'redacao_integral']),
  texto_final: z.string(),
  /** Campo estruturado obrigatório: o literal impede qualquer saída sem o aviso. */
  aviso_obrigatorio: z.literal(AVISO_OBRIGATORIO),
  alteracoes_aplicadas: z.array(
    z.object({ trecho_original: z.string(), substituicao: z.string(), motivo: z.string() }),
  ),
  precedentes: z.array(PrecedenteSaidaSchema),
  precedentes_nao_verificados: z.number(),
  verificacao_normativa: VerificacaoNormativaSchema,
  proxima_etapa_sugerida: z.null(),
});
export type PecaRedigirOutput = z.infer<typeof PecaRedigirOutputSchema>;

/** Aplica os apontamentos em sequência; falha com a lista completa de problemas, sem alterar o resto do texto. */
export function aplicarApontamentos(
  textoOriginal: string,
  apontamentos: readonly z.infer<typeof ApontamentoSchema>[],
): string {
  let texto = textoOriginal;
  const problemas: Array<{ indice: number; problema: string }> = [];
  apontamentos.forEach((apontamento, indice) => {
    const posicoes: number[] = [];
    let busca = texto.indexOf(apontamento.trecho_original);
    while (busca !== -1) {
      posicoes.push(busca);
      busca = texto.indexOf(apontamento.trecho_original, busca + apontamento.trecho_original.length);
    }
    if (posicoes.length === 0)
      return void problemas.push({ indice, problema: 'trecho_original não localizado no texto' });
    if (posicoes.length > 1 && apontamento.ocorrencia === undefined) {
      return void problemas.push({
        indice,
        problema: `trecho_original ambíguo (${posicoes.length} ocorrências); informe "ocorrencia"`,
      });
    }
    const posicao = posicoes[(apontamento.ocorrencia ?? 1) - 1];
    if (posicao === undefined) return void problemas.push({ indice, problema: 'ocorrencia inexistente' });
    texto =
      texto.slice(0, posicao) + apontamento.substituicao + texto.slice(posicao + apontamento.trecho_original.length);
  });
  if (problemas.length) {
    throw new DomainError(
      'INVALID_CANONICAL_STATE',
      'Apontamentos não aplicáveis ao texto original; nada foi alterado.',
      {
        code: 'ANALISE_APONTAMENTO_INVALIDO',
        problemas,
      },
    );
  }
  return texto;
}

export function criarToolPecaRedigir(deps: DepsAnalise): AgentTool<PecaRedigirInput, PecaRedigirOutput> {
  return {
    name: NOMES_TOOLS.pecaRedigir,
    description:
      'Produz o texto final de uma peça em um de dois modos, nunca combinados na mesma chamada. ' +
      'modo="correcao_dirigida": aplica SOMENTE os apontamentos recebidos (trecho_original → substituicao, com motivo), preservando integralmente o resto do texto_original; os apontamentos são aplicados pelo servidor e exigem trecho localizável. ' +
      'modo="redacao_integral": registra e audita peça nova redigida por você a partir das instruções (texto_peca). ' +
      'Em ambos, toda citação de precedente — informada ou detectada no texto final — é conferida pelo servidor, e o resultado sempre traz o aviso obrigatório de revisão por advogado habilitado em campo estruturado. ' +
      'NÃO FAZ: não analisa a peça, não mapeia teses nem recomenda estratégia; não inventa fatos, partes, datas ou precedentes. ' +
      NAO_INFERIR +
      ' ' +
      PROTOCOLO_VERIFICACAO +
      ' SESSÃO: use o sessao_analitica_id da análise anterior (é a etapa final; proxima_etapa_sugerida é sempre nula).',
    impactLevel: 'L2_DRAFT',
    inputSchema: PecaRedigirInputSchema,
    outputSchema: PecaRedigirOutputSchema,
    timeoutMs: 90_000,
    execute: async (input, context) => {
      const chamada = await iniciarChamada(deps, context, input);
      let textoFinal: string;
      let alteracoes: PecaRedigirOutput['alteracoes_aplicadas'] = [];
      if (input.modo === 'correcao_dirigida') {
        textoFinal = aplicarApontamentos(input.texto_original, input.apontamentos);
        alteracoes = input.apontamentos.map(({ trecho_original, substituicao, motivo }) => ({
          trecho_original,
          substituicao,
          motivo,
        }));
      } else {
        textoFinal = input.texto_peca;
      }

      // Citações informadas + detectadas no texto final que não foram declaradas.
      const informadas = input.citacoes_precedentes;
      const chaves = new Set(informadas.map((ref) => semAcentoMinusculo(ref.numero ?? ref.descricao_tese ?? '')));
      const detectadas = extrairCitacoes(textoFinal).filter((ref) => !chaves.has(semAcentoMinusculo(ref.numero ?? '')));
      const precedentes = [
        ...(await verificarPrecedentes(deps, informadas, context.abortSignal, 'informado')),
        ...(await verificarPrecedentes(deps, detectadas, context.abortSignal, 'detectado_no_texto')),
      ];
      const naoVerificados = contarNaoVerificados(precedentes);

      const saida: PecaRedigirOutput = {
        sessao_analitica_id: chamada.id,
        triagem: chamada.triagem,
        modo: input.modo,
        texto_final: textoFinal,
        aviso_obrigatorio: AVISO_OBRIGATORIO,
        alteracoes_aplicadas: alteracoes,
        precedentes,
        precedentes_nao_verificados: naoVerificados,
        verificacao_normativa: verificarDispositivos(input.dispositivos_citados),
        proxima_etapa_sugerida: null,
      };
      await deps.estado.estadoRegistrar(chamada.id, chamada.dono, 'redigir', {
        modo: input.modo,
        tamanho_texto: textoFinal.length,
        alteracoes: alteracoes.length,
        instrucoes: input.modo === 'redacao_integral' ? truncar(input.instrucoes, 300) : undefined,
        precedentes: resumirPrecedentes(precedentes),
        precedentes_nao_verificados: naoVerificados,
      });
      return { success: true, data: saida };
    },
  };
}
