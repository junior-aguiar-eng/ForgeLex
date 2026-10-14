import { z } from 'zod';

export const AREAS_DIREITO = ['civil', 'penal', 'trabalhista', 'administrativo'] as const;
export const AreaDireitoSchema = z.enum(AREAS_DIREITO);
export type AreaDireito = z.infer<typeof AreaDireitoSchema>;

export const FASES_PROCESSUAIS = [
  'postulatoria',
  'saneamento_instrucao',
  'decisoria',
  'recursal',
  'cumprimento_execucao',
] as const;
export const FaseProcessualSchema = z.enum(FASES_PROCESSUAIS);
export type FaseProcessual = z.infer<typeof FaseProcessualSchema>;

export const TIPOS_ANALISE = ['triagem', 'analisar', 'mapear_teses', 'avaliar_prova', 'estrategia', 'redigir'] as const;
export const TipoAnaliseSchema = z.enum(TIPOS_ANALISE);
export type TipoAnalise = z.infer<typeof TipoAnaliseSchema>;

export const NOMES_TOOLS = {
  pecaAnalisar: 'analise.peca_analisar',
  mapearTeses: 'analise.mapear_teses',
  avaliarProva: 'analise.avaliar_prova',
  estrategiaDefinir: 'analise.estrategia_definir',
  pecaRedigir: 'analise.peca_redigir',
  comboAtivar: 'analise.combo_ativar',
  /** Interna: nunca exposta ao cliente MCP. */
  jurisprudenciaVerificar: 'analise.jurisprudencia_verificar',
} as const;

/** Tools que o cliente MCP enxerga e pode chamar. */
export const NOMES_TOOLS_EXPOSTAS: readonly string[] = [
  NOMES_TOOLS.pecaAnalisar,
  NOMES_TOOLS.mapearTeses,
  NOMES_TOOLS.avaliarProva,
  NOMES_TOOLS.estrategiaDefinir,
  NOMES_TOOLS.pecaRedigir,
  NOMES_TOOLS.comboAtivar,
];

export const PREFIXO_TOOLS = 'analise.';

export const AVISO_OBRIGATORIO =
  'Texto gerado por ferramenta de apoio. Requer revisão técnica por advogado habilitado antes de qualquer uso processual.' as const;

export const AVISO_VIGENCIA_NAO_VERIFICADA =
  'dispositivo citado conforme conhecimento do modelo, sem verificação de vigência atual — recomenda-se confirmação manual' as const;

export const ID_SESSAO_NOVA = 'nova';

export const ResumoAchadoSchema = z.record(z.unknown());
export type ResumoAchado = z.infer<typeof ResumoAchadoSchema>;

/** Referência de precedente informada pelo cliente; sempre sujeita a verificação. */
export const PrecedenteRefSchema = z.object({
  tribunal: z.string().trim().min(2).max(20).optional(),
  numero: z.string().trim().min(1).max(120).optional(),
  descricao_tese: z.string().trim().min(3).max(600).optional(),
  trecho_fonte: z.string().trim().min(20).max(1500).optional().describe(
    'Cópia literal do trecho da página oficial que contém o número do precedente (ou a ementa). Usado quando o servidor não consegue abrir a página sozinho.',
  ),
  url_fonte: z.string().trim().url().max(600).optional().describe(
    'Página oficial do tribunal onde você encontrou o precedente. O servidor abre essa página e só confirma se o precedente constar nela.',
  ),
}).refine((value) => Boolean(value.numero || value.descricao_tese), {
  message: 'Informe o número do precedente ou a descrição da tese.',
});
export type PrecedenteRef = z.infer<typeof PrecedenteRefSchema>;

export const StatusVerificacaoSchema = z.enum(['confirmado_busca_externa', 'confirmado_pelo_cliente', 'nao_verificado']);
export type StatusVerificacao = z.infer<typeof StatusVerificacaoSchema>;

export const MOTIVOS_NAO_VERIFICADO = ['busca_indisponivel', 'precedente_nao_encontrado', 'tribunal_nao_identificavel'] as const;

export const PrecedenteVerificadoSchema = z.object({
  referencia: PrecedenteRefSchema,
  tribunal: z.string().nullable(),
  status_verificacao: StatusVerificacaoSchema,
  fonte: z.object({ url: z.string(), host: z.string(), consultado_em: z.string() }).nullable(),
  motivo: z.enum(MOTIVOS_NAO_VERIFICADO).nullable(),
  alerta: z.string().nullable(),
});
export type PrecedenteVerificado = z.infer<typeof PrecedenteVerificadoSchema>;

/** Dispositivo legal citado, com o resultado da checagem de vigência feita pelo cliente. */
export const DispositivoCitadoSchema = z.object({
  dispositivo: z.string().trim().min(2).max(300),
  verificado_em_fonte_oficial: z.boolean().default(false),
  fonte: z.string().trim().max(500).optional(),
});
export type DispositivoCitado = z.infer<typeof DispositivoCitadoSchema>;

export const DispositivoVerificadoSchema = z.object({
  dispositivo: z.string(),
  status_vigencia: z.enum(['verificado_fonte_oficial', 'nao_verificado']),
  fonte: z.string().nullable(),
  alerta: z.string().nullable(),
});
export type DispositivoVerificado = z.infer<typeof DispositivoVerificadoSchema>;

export const SessaoRefSchema = z.object({
  sessao_analitica_id: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(`Id de uma sessão analítica existente, ou "${ID_SESSAO_NOVA}" para abrir uma nova na primeira chamada.`),
  area_direito: AreaDireitoSchema,
  numero_processo: z.string().trim().min(3).max(60).optional(),
  fase_processual: FaseProcessualSchema.optional().describe(
    'Fase processual classificada pelo cliente na triagem. Dispensável se a sessão já a registra.',
  ),
});
