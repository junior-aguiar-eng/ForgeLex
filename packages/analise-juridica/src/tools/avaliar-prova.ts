import { z } from 'zod';
import type { AgentTool } from '@forgelex/agent-core';
import { DispositivoCitadoSchema, NOMES_TOOLS, SessaoRefSchema, type AreaDireito } from '../contratos.js';
import {
  NAO_INFERIR,
  PROTOCOLO_VERIFICACAO,
  TriagemSaidaSchema,
  VerificacaoNormativaSchema,
  exigirEtapaPrevia,
  iniciarChamada,
  truncar,
  verificarDispositivos,
  type DepsAnalise,
} from './comum.js';

const MEIOS_PROVA = [
  'documental', 'testemunhal', 'pericial', 'depoimento_pessoal', 'inspecao_judicial', 'ata_notarial', 'prova_emprestada', 'outro',
] as const;
const OnusSchema = z.enum(['autor', 'reu', 'ambos', 'inversao', 'distribuicao_dinamica', 'indefinido']);

const FatoControvertidoSchema = z.object({
  fato: z.string().trim().min(5).max(1500),
  tese_relacionada: z.string().trim().max(600).optional(),
  prova_existente: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  meios_de_prova_cabiveis: z.array(z.enum(MEIOS_PROVA)).max(8).default([]),
  onus: OnusSchema,
  fundamento_onus: z.string().trim().max(1500).optional(),
  risco_preclusao: z.enum(['baixo', 'medio', 'alto']),
  marco_preclusivo: z.string().trim().max(300).optional(),
}).refine((fato) => fato.onus === 'indefinido' || Boolean(fato.fundamento_onus), {
  message: 'Todo ônus definido exige fundamento_onus; use "indefinido" se não houver base.',
  path: ['fundamento_onus'],
});

export const AvaliarProvaInputSchema = SessaoRefSchema.extend({
  resultado_mapear_teses: z.record(z.string(), z.unknown()).optional(),
  fatos_controvertidos: z.array(FatoControvertidoSchema).min(1).max(40),
  dispositivos_citados: z.array(DispositivoCitadoSchema).max(60).default([]),
});
export type AvaliarProvaInput = z.infer<typeof AvaliarProvaInputSchema>;

/** Panorama do regime probatório por área, a conferir quanto à vigência (não é citação verificada). */
export const REGIME_ONUS_POR_AREA: Record<AreaDireito, { regime: string; pontos_de_atencao: string[] }> = {
  civil: {
    regime: 'Ônus estático do CPC (art. 373, I e II), com distribuição dinâmica (art. 373, §1º) e inversão por lei; nas relações de consumo, inversão judicial do CDC (art. 6º, VIII).',
    pontos_de_atencao: ['Decisão que redistribui o ônus deve ser fundamentada e dar oportunidade de desincumbência.', 'Convenção processual sobre ônus (art. 373, §3º).'],
  },
  penal: {
    regime: 'Ônus da prova da acusação quanto à autoria e materialidade (presunção de inocência); à defesa cabe a prova de excludentes que alegar, sem inverter o in dubio pro reo.',
    pontos_de_atencao: ['Cadeia de custódia da prova material.', 'Elementos do inquérito não bastam isoladamente para a condenação (contraditório judicial).'],
  },
  trabalhista: {
    regime: 'Regra do art. 818 da CLT, com distribuição dinâmica (§1º) e dever de documentação do empregador (ex.: controle de jornada, registros).',
    pontos_de_atencao: ['Decisão que atribui o ônus de modo diverso deve ser proferida antes da instrução e permitir a produção da prova.', 'Presunções decorrentes de não apresentação de documentos exigidos.'],
  },
  administrativo: {
    regime: 'Presunção de legitimidade e veracidade dos atos administrativos, com ônus do administrado de demonstrar o vício; no processo sancionador, ônus de comprovação da infração é da Administração.',
    pontos_de_atencao: ['Controle judicial dos motivos determinantes.', 'Prova pré-constituída em mandado de segurança.'],
  },
};

export const AvaliarProvaOutputSchema = z.object({
  sessao_analitica_id: z.string(),
  triagem: TriagemSaidaSchema,
  regime_onus_area: z.object({
    area_direito: z.string(),
    regime: z.string(),
    pontos_de_atencao: z.array(z.string()),
    alerta: z.string(),
  }),
  fatos_controvertidos: z.array(z.object(FatoControvertidoSchema.shape)),
  lacunas_probatorias: z.array(z.object({ fato: z.string(), motivo: z.string() })),
  riscos_preclusao_altos: z.array(z.string()),
  verificacao_normativa: VerificacaoNormativaSchema,
  proxima_etapa_sugerida: z.string().nullable(),
});
export type AvaliarProvaOutput = z.infer<typeof AvaliarProvaOutputSchema>;

export function criarToolAvaliarProva(deps: DepsAnalise): AgentTool<AvaliarProvaInput, AvaliarProvaOutput> {
  return {
    name: NOMES_TOOLS.avaliarProva,
    description:
      'Identifica fatos controvertidos ainda carentes de prova, os meios de prova cabíveis, a quem cabe o ônus (conforme o regime da area_direito: p.ex., inversão do CDC no civil/consumo, distribuição dinâmica na trabalhista, ônus da acusação no penal) e o risco de preclusão. ' +
      'MÉTODO: parta das teses mapeadas; para cada fato controvertido indique prova existente, meios cabíveis, ônus com o fundamento e o risco/marco preclusivo; o servidor calcula as lacunas probatórias e anexa o panorama do regime da área. ' +
      'NÃO FAZ: não mapeia teses (mapear_teses), não valora a prova produzida nem decide o mérito, não recomenda o movimento processual (estrategia_definir). ' +
      NAO_INFERIR + ' ' + PROTOCOLO_VERIFICACAO +
      ' SESSÃO: exige sessao_analitica_id existente com mapear_teses executada (ou resultado_mapear_teses enviado diretamente).',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: AvaliarProvaInputSchema,
    outputSchema: AvaliarProvaOutputSchema,
    execute: async (input, context) => {
      const chamada = await iniciarChamada(deps, context, input);
      exigirEtapaPrevia(chamada.sessao, 'mapear_teses', NOMES_TOOLS.mapearTeses, input.resultado_mapear_teses);

      const lacunas = input.fatos_controvertidos.flatMap((item) => {
        const motivos: string[] = [];
        if (item.prova_existente.length === 0) motivos.push('sem prova existente indicada');
        if (item.meios_de_prova_cabiveis.length === 0) motivos.push('sem meio de prova cabível indicado');
        if (item.onus === 'indefinido') motivos.push('ônus indefinido');
        return motivos.length ? [{ fato: truncar(item.fato, 200), motivo: motivos.join('; ') }] : [];
      });
      const riscosAltos = input.fatos_controvertidos.filter((item) => item.risco_preclusao === 'alto').map((item) => truncar(item.fato, 200));
      const regime = REGIME_ONUS_POR_AREA[chamada.triagem.area_direito];

      const saida: AvaliarProvaOutput = {
        sessao_analitica_id: chamada.id,
        triagem: chamada.triagem,
        regime_onus_area: {
          area_direito: chamada.triagem.area_direito,
          ...regime,
          alerta: 'Panorama de referência, sem verificação de vigência: confirme os dispositivos em fonte oficial antes de invocá-los.',
        },
        fatos_controvertidos: input.fatos_controvertidos.map((item) => ({ ...item })),
        lacunas_probatorias: lacunas,
        riscos_preclusao_altos: riscosAltos,
        verificacao_normativa: verificarDispositivos(input.dispositivos_citados),
        proxima_etapa_sugerida: NOMES_TOOLS.estrategiaDefinir,
      };
      await deps.estado.estadoRegistrar(chamada.id, chamada.dono, 'avaliar_prova', {
        fatos: input.fatos_controvertidos.slice(0, 12).map((item) => ({ fato: truncar(item.fato, 140), onus: item.onus, risco_preclusao: item.risco_preclusao })),
        lacunas: lacunas.length,
        riscos_preclusao_altos: riscosAltos.length,
      });
      return { success: true, data: saida };
    },
  };
}
