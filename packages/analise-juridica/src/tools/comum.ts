import { z } from 'zod';
import type { ToolExecutionContext } from '@forgelex/agent-core';
import { DomainError } from '@forgelex/domain';
import {
  AVISO_VIGENCIA_NAO_VERIFICADA,
  AreaDireitoSchema,
  DispositivoVerificadoSchema,
  FaseProcessualSchema,
  PrecedenteVerificadoSchema,
  type DispositivoCitado,
  type DispositivoVerificado,
  type PrecedenteRef,
  type PrecedenteVerificado,
  type TipoAnalise,
} from '../contratos.js';
import { EstadoAnalitico, ultimoAchado, type DonoSessao, type ResumoSessao } from '../estado.js';
import type { JurisprudenciaVerificador } from '../jurisprudencia-verificar.js';
import { executarTriagem, type ResultadoTriagem } from '../triagem.js';

export interface DepsAnalise {
  estado: EstadoAnalitico;
  verificador: JurisprudenciaVerificador;
}

export const TriagemSaidaSchema = z.object({
  fase_processual: FaseProcessualSchema,
  area_direito: AreaDireitoSchema,
  confirmada_do_estado: z.boolean(),
  divergencias: z.array(z.string()),
});

export const PrecedenteSaidaSchema = PrecedenteVerificadoSchema.extend({
  origem: z.enum(['informado', 'detectado_no_texto']),
});
export type PrecedenteSaida = z.infer<typeof PrecedenteSaidaSchema>;

export const VerificacaoNormativaSchema = z.array(DispositivoVerificadoSchema);

/** Texto de método comum às tools que citam norma ou precedente. */
export const PROTOCOLO_VERIFICACAO =
  'VERIFICAÇÃO OBRIGATÓRIA ANTES DE CITAR: (1) Legislação — use busca web (se o seu cliente tiver) priorizando fontes oficiais (planalto.gov.br, sites dos tribunais, diários oficiais) para confirmar a vigência e o teor atual do dispositivo antes de afirmá-lo vigente; informe cada dispositivo em dispositivos_citados com verificado_em_fonte_oficial=true/false. Quando não conseguir verificar, o resultado traz o alerta "' +
  AVISO_VIGENCIA_NAO_VERIFICADA +
  '". Nunca trate ausência de verificação como "provavelmente certo". (2) Jurisprudência — todo precedente é conferido pelo servidor em fonte oficial; o resultado traz status_verificacao em cada citação. Precedente com status nao_verificado não pode ser apresentado como confirmado. A identificação de qual norma ou instituto se aplica é sua; o servidor só audita a checagem de vigência.';

export const NAO_INFERIR =
  'Não complete nem infira dado ausente do documento: se um elemento não consta, deixe-o vazio/nulo e ele será sinalizado como ausente.';

export function dononDoContexto(context: ToolExecutionContext): DonoSessao {
  return { tenantId: context.tenantId, usuarioId: context.userId };
}

export interface ChamadaIniciada {
  id: string;
  dono: DonoSessao;
  sessao: ResumoSessao;
  triagem: ResultadoTriagem;
}

/** Abre/valida a sessão e roda a triagem de forma transparente (primeiro passo de toda tool analítica). */
export async function iniciarChamada(
  deps: DepsAnalise,
  context: ToolExecutionContext,
  entrada: { sessao_analitica_id: string; numero_processo?: string; area_direito: z.infer<typeof AreaDireitoSchema>; fase_processual?: z.infer<typeof FaseProcessualSchema> },
): Promise<ChamadaIniciada> {
  const dono = dononDoContexto(context);
  const id = await deps.estado.abrirSessao(entrada.sessao_analitica_id, dono, entrada.numero_processo);
  const sessao = await deps.estado.estadoRecuperar(id, dono);
  const triagem = await executarTriagem(deps.estado, id, dono, entrada, sessao);
  return { id, dono, sessao, triagem };
}

export function exigirEtapaPrevia(
  sessao: ResumoSessao,
  tipo: TipoAnalise,
  toolPrevia: string,
  fornecidoDiretamente: unknown,
): void {
  if (ultimoAchado(sessao, tipo) || fornecidoDiretamente) return;
  throw new DomainError(
    'INVALID_CANONICAL_STATE',
    `Esta tool precisa do resultado de ${toolPrevia}. Execute-a antes na mesma sessao_analitica_id (ou envie o resultado diretamente).`,
    { code: 'ANALISE_ETAPA_PREVIA_AUSENTE', etapa_previa: toolPrevia },
  );
}

export function verificarDispositivos(dispositivos: readonly DispositivoCitado[]): DispositivoVerificado[] {
  return dispositivos.map((item) =>
    item.verificado_em_fonte_oficial
      ? { dispositivo: item.dispositivo, status_vigencia: 'verificado_fonte_oficial', fonte: item.fonte ?? null, alerta: null }
      : { dispositivo: item.dispositivo, status_vigencia: 'nao_verificado', fonte: null, alerta: AVISO_VIGENCIA_NAO_VERIFICADA },
  );
}

export async function verificarPrecedentes(
  deps: DepsAnalise,
  refs: readonly PrecedenteRef[],
  sinal: AbortSignal,
  origem: PrecedenteSaida['origem'] = 'informado',
): Promise<PrecedenteSaida[]> {
  const verificados: PrecedenteVerificado[] = await deps.verificador.verificarTodos(refs, sinal);
  return verificados.map((item) => ({ ...item, origem }));
}

export function contarNaoVerificados(precedentes: readonly PrecedenteSaida[]): number {
  return precedentes.filter((item) => item.status_verificacao !== 'confirmado_busca_externa').length;
}

export function truncar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

export function semAcentoMinusculo(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Resumo curto de precedentes para o estado: só campos-chave. */
export function resumirPrecedentes(precedentes: readonly PrecedenteSaida[]) {
  return precedentes.slice(0, 20).map((item) => ({
    ref: truncar(item.referencia.numero ?? item.referencia.descricao_tese ?? '', 120),
    tribunal: item.tribunal,
    status: item.status_verificacao,
  }));
}

/** Detecta citações de precedente no texto final de uma peça. Tribunal só é atribuído quando inequívoco. */
export function extrairCitacoes(texto: string): PrecedenteRef[] {
  const encontrados = new Map<string, PrecedenteRef>();
  const adicionar = (ref: PrecedenteRef) => {
    const chave = `${ref.tribunal ?? ''}|${semAcentoMinusculo(ref.numero ?? ref.descricao_tese ?? '')}`;
    if (!encontrados.has(chave) && encontrados.size < 20) encontrados.set(chave, ref);
  };
  const porSigla: Record<string, string> = {
    resp: 'STJ', aresp: 'STJ', eresp: 'STJ', re: 'STF', are: 'STF', adi: 'STF', adpf: 'STF', adc: 'STF', rr: 'TST', airr: 'TST', arr: 'TST',
  };
  for (const m of texto.matchAll(/\b(AgRg no |AgInt no |EDcl no )?(REsp|AREsp|EREsp|RE|ARE|ADI|ADPF|ADC|RR|AIRR|ARR)\s*(?:n[ºo°.]*\s*)?(\d[\d.\-/]{2,})/g)) {
    const classe = m[2]!;
    adicionar({ tribunal: porSigla[classe.toLowerCase()], numero: `${classe} ${m[3]!.replace(/[.\-/]+$/, '')}` });
  }
  for (const m of texto.matchAll(/\bS[úu]mula(?:\s+Vinculante)?\s*(?:n[ºo°.]*\s*)?(\d{1,4})(?:\s+(?:do|da)\s+(STF|STJ|TST|TSE|STM))?/gi)) {
    const vinculante = /vinculante/i.test(m[0]);
    adicionar({ tribunal: m[2]?.toUpperCase() ?? (vinculante ? 'STF' : undefined), numero: `Súmula${vinculante ? ' Vinculante' : ''} ${m[1]}` });
  }
  for (const m of texto.matchAll(/\bTema\s*(?:n[ºo°.]*\s*)?(\d{1,5})(?:\s+(?:do|da)\s+(STF|STJ|TST))?/g)) {
    adicionar({ tribunal: m[2]?.toUpperCase(), numero: `Tema ${m[1]}` });
  }
  for (const m of texto.matchAll(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g)) adicionar({ numero: m[0] });
  return [...encontrados.values()];
}
