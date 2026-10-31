import { z } from 'zod';
import type { AgentTool } from '@forgelex/agent-core';
import { NOMES_TOOLS, SessaoRefSchema } from '../contratos.js';
import {
  NAO_INFERIR,
  TriagemSaidaSchema,
  iniciarChamada,
  semAcentoMinusculo,
  truncar,
  type DepsAnalise,
} from './comum.js';

export const TIPOS_DOCUMENTO = [
  'peticao_inicial',
  'contestacao',
  'replica',
  'recurso',
  'sentenca',
  'decisao_interlocutoria',
  'acordao',
  'outro',
] as const;
const TipoDocumentoSchema = z.enum(TIPOS_DOCUMENTO);
type TipoDocumento = z.infer<typeof TipoDocumentoSchema>;

const ItemComTrechoSchema = z.object({
  descricao: z.string().trim().min(1).max(1500),
  trecho: z.string().trim().min(1).max(800).describe('Trecho literal do documento que sustenta o item.'),
});
const FundamentoSchema = ItemComTrechoSchema.extend({
  dispositivos: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

const EstruturaSchema = z.object({
  qualificacao: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .describe('Juízo/órgão, número, partes e qualificação, como constam.'),
  fatos: z
    .array(ItemComTrechoSchema)
    .max(60)
    .default([])
    .describe('Petições: fatos narrados. Decisões/acórdãos: relatório.'),
  fundamentos: z
    .array(FundamentoSchema)
    .max(60)
    .default([])
    .describe('Petições: fundamentos jurídicos. Decisões/acórdãos: fundamentação.'),
  pedidos_dispositivo: z
    .array(ItemComTrechoSchema)
    .max(60)
    .default([])
    .describe('Petições: pedidos. Decisões/acórdãos: dispositivo.'),
});

export const PecaAnalisarInputSchema = SessaoRefSchema.extend({
  texto_documento: z.string().min(30).max(400_000),
  tipo_documento: TipoDocumentoSchema.optional(),
  estrutura: EstruturaSchema,
});
export type PecaAnalisarInput = z.infer<typeof PecaAnalisarInputSchema>;

const ElementoAusenteSchema = z.object({ elemento: z.string(), descricao: z.string() });

export const PecaAnalisarOutputSchema = z.object({
  sessao_analitica_id: z.string(),
  triagem: TriagemSaidaSchema,
  tipo_documento: z.union([TipoDocumentoSchema, z.literal('nao_identificado')]),
  tipo_documento_inferido: z.boolean(),
  estrutura: z.object({
    qualificacao: z.string().nullable(),
    fatos: z.array(ItemComTrechoSchema),
    fundamentos: z.array(FundamentoSchema),
    pedidos_dispositivo: z.array(ItemComTrechoSchema),
  }),
  rotulos: z.object({ fatos: z.string(), fundamentos: z.string(), pedidos_dispositivo: z.string() }),
  elementos_ausentes: z.array(ElementoAusenteSchema),
  trechos_nao_localizados: z.array(z.object({ campo: z.string(), trecho: z.string() })),
  proxima_etapa_sugerida: z.string().nullable(),
});
export type PecaAnalisarOutput = z.infer<typeof PecaAnalisarOutputSchema>;

const DECISORIOS: readonly TipoDocumento[] = ['sentenca', 'decisao_interlocutoria', 'acordao'];

/** Inferência determinística e conservadora a partir do cabeçalho; sem sinal claro, "nao_identificado". */
export function inferirTipoDocumento(texto: string): TipoDocumento | 'nao_identificado' {
  const inicio = semAcentoMinusculo(texto.slice(0, 1500));
  const regras: Array<[RegExp, TipoDocumento]> = [
    [/\bacordao\b|\bacordam os\b/, 'acordao'],
    [/\bsentenca\b|\bjulgo (procedente|improcedente|parcialmente)/, 'sentenca'],
    [/\bdecisao interlocutoria\b|\bdefiro\b.*\btutela\b|\bdecido\b/, 'decisao_interlocutoria'],
    [/\bcontestacao\b|\bcontesta\b/, 'contestacao'],
    [/\breplica\b|\bimpugnacao a contestacao\b/, 'replica'],
    [
      /\b(apelacao|agravo|embargos|recurso (especial|extraordinario|ordinario|de revista))\b|\brazoes recursais\b/,
      'recurso',
    ],
    [
      /\bpeticao inicial\b|\bexcelentissimo\b.*\bajuizar\b|\bvem, respeitosamente, propor\b|\bacao (de|trabalhista|penal)\b/,
      'peticao_inicial',
    ],
  ];
  return regras.find(([regex]) => regex.test(inicio))?.[1] ?? 'nao_identificado';
}

function rotulos(tipo: TipoDocumento | 'nao_identificado') {
  return tipo !== 'nao_identificado' && DECISORIOS.includes(tipo)
    ? { fatos: 'relatorio', fundamentos: 'fundamentacao', pedidos_dispositivo: 'dispositivo' }
    : { fatos: 'fatos', fundamentos: 'fundamentos', pedidos_dispositivo: 'pedidos' };
}

export function criarToolPecaAnalisar(deps: DepsAnalise): AgentTool<PecaAnalisarInput, PecaAnalisarOutput> {
  return {
    name: NOMES_TOOLS.pecaAnalisar,
    description:
      'Decompõe uma peça processual, decisão ou acórdão em estrutura jurídica formal: qualificação, fatos (ou relatório), fundamentos (ou fundamentação) e pedidos (ou dispositivo), ajustando os campos ao tipo de documento. ' +
      'MÉTODO: leia o documento inteiro e preencha `estrutura` com itens fiéis ao texto, cada um com `trecho` literal que o sustenta; o servidor confere cada trecho no documento, calcula os elementos ausentes e registra o achado na sessão. ' +
      'NÃO FAZ: não avalia mérito, não identifica teses nem precedentes, não propõe estratégia e não redige (isso é de mapear_teses, estrategia_definir e peca_redigir). ' +
      NAO_INFERIR +
      ' SESSÃO: é a primeira etapa; use sessao_analitica_id="nova" para abrir sessão (o id gerado vem no resultado, e as próximas tools devem reutilizá-lo) ou o id de uma sessão sua já existente. ' +
      'A triagem (fase processual e área) roda automaticamente: informe area_direito e, se a sessão ainda não a registra, fase_processual.',
    impactLevel: 'L1_ANALYSIS',
    inputSchema: PecaAnalisarInputSchema,
    outputSchema: PecaAnalisarOutputSchema,
    execute: async (input, context) => {
      const chamada = await iniciarChamada(deps, context, input);
      const inferido = input.tipo_documento === undefined;
      const tipo = input.tipo_documento ?? inferirTipoDocumento(input.texto_documento);
      const base = semAcentoMinusculo(input.texto_documento);
      const campos = ['fatos', 'fundamentos', 'pedidos_dispositivo'] as const;

      const naoLocalizados: Array<{ campo: string; trecho: string }> = [];
      for (const campo of campos) {
        for (const item of input.estrutura[campo]) {
          if (!base.includes(semAcentoMinusculo(item.trecho)))
            naoLocalizados.push({ campo, trecho: truncar(item.trecho, 200) });
        }
      }

      const rot = rotulos(tipo);
      const ausentes: Array<{ elemento: string; descricao: string }> = [];
      if (!input.estrutura.qualificacao?.trim())
        ausentes.push({
          elemento: 'qualificacao',
          descricao: 'Qualificação (juízo, número, partes) não informada ou não consta no documento.',
        });
      for (const campo of campos) {
        if (input.estrutura[campo].length === 0)
          ausentes.push({
            elemento: rot[campo],
            descricao: `Nenhum item de ${rot[campo]} informado ou localizado no documento.`,
          });
      }

      const saida: PecaAnalisarOutput = {
        sessao_analitica_id: chamada.id,
        triagem: chamada.triagem,
        tipo_documento: tipo,
        tipo_documento_inferido: inferido,
        estrutura: {
          qualificacao: input.estrutura.qualificacao?.trim() || null,
          fatos: input.estrutura.fatos,
          fundamentos: input.estrutura.fundamentos,
          pedidos_dispositivo: input.estrutura.pedidos_dispositivo,
        },
        rotulos: rot,
        elementos_ausentes: ausentes,
        trechos_nao_localizados: naoLocalizados,
        proxima_etapa_sugerida: NOMES_TOOLS.mapearTeses,
      };

      await deps.estado.estadoRegistrar(chamada.id, chamada.dono, 'analisar', {
        tipo_documento: tipo,
        area_direito: chamada.triagem.area_direito,
        contagem: {
          fatos: input.estrutura.fatos.length,
          fundamentos: input.estrutura.fundamentos.length,
          pedidos_dispositivo: input.estrutura.pedidos_dispositivo.length,
        },
        elementos_ausentes: ausentes.map((item) => item.elemento),
        fundamentos: input.estrutura.fundamentos.slice(0, 10).map((item) => truncar(item.descricao, 160)),
        pedidos_dispositivo: input.estrutura.pedidos_dispositivo
          .slice(0, 10)
          .map((item) => truncar(item.descricao, 160)),
        trechos_nao_localizados: naoLocalizados.length,
      });
      return { success: true, data: saida };
    },
  };
}
