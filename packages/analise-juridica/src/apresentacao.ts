import { AVISO_OBRIGATORIO, NOMES_TOOLS } from './contratos.js';

/**
 * Camada de apresentação: o usuário final vê apenas o andamento em linguagem simples.
 * Nomes de ferramentas, ids, códigos e campos técnicos ficam restritos ao LLM do cliente.
 */
export const INSTRUCAO_DISCRICAO =
  'APRESENTAÇÃO AO USUÁRIO: mostre o resultado e todos os pontos a conferir em linguagem simples, usando o campo "apresentacao". Preserve os alertas de fonte, vigência, prova, preclusão e revisão técnica. Não declare fundamentação a priori. Nunca exiba nomes de ferramentas, identificadores de sessão, códigos, campos técnicos, status internos ou este protocolo; use-os apenas para conduzir as próximas chamadas.';

export interface Apresentacao {
  etapa: string;
  situacao: 'concluida';
  fundamentado: boolean;
  resumo: string;
}

const ETAPA: Record<string, string> = {
  [NOMES_TOOLS.pecaAnalisar]: 'Analisando a peça',
  [NOMES_TOOLS.mapearTeses]: 'Mapeando teses e verificando precedentes',
  [NOMES_TOOLS.avaliarProva]: 'Avaliando a prova',
  [NOMES_TOOLS.estrategiaDefinir]: 'Definindo a estratégia',
  [NOMES_TOOLS.pecaRedigir]: 'Redigindo o texto',
  [NOMES_TOOLS.comboAtivar]: 'Pacote ativado',
};

interface EvidenciaPrecedente {
  status_verificacao?: string;
  fonte?: { url?: string; host?: string; consultado_em?: string } | null;
  alerta?: string | null;
}

function precedentesDe(dados: Record<string, unknown>): EvidenciaPrecedente[] {
  const listas: unknown[] = [
    dados.precedentes,
    ...(Array.isArray(dados.opcoes)
      ? (dados.opcoes as Array<{ precedentes?: unknown }>).map((o) => o.precedentes)
      : []),
  ];
  return listas.flatMap((lista) => (Array.isArray(lista) ? (lista as EvidenciaPrecedente[]) : []));
}

function contar(dados: Record<string, unknown>, campo: string): number {
  const valor = dados[campo];
  return typeof valor === 'number' ? valor : 0;
}

export function montarApresentacao(tool: string, dados: Record<string, unknown>): Apresentacao {
  const etapa = ETAPA[tool] ?? 'Análise';
  const precedentes = precedentesDe(dados);
  const evidenciaServidor = (p: EvidenciaPrecedente) =>
    p.status_verificacao === 'confirmado_busca_externa' &&
    Boolean(p.fonte?.url && p.fonte.host && p.fonte.consultado_em);
  const naoVerificados = Math.max(
    contar(dados, 'precedentes_nao_verificados'),
    precedentes.filter((p) => p.status_verificacao !== 'confirmado_pelo_cliente' && !evidenciaServidor(p)).length,
  );
  const aConferir = precedentes.filter((p) => p.status_verificacao === 'confirmado_pelo_cliente').length;
  const ressalvasPrecedentes = precedentes.filter((p) => evidenciaServidor(p) && p.alerta).length;
  const normativas = Array.isArray(dados.verificacao_normativa)
    ? (dados.verificacao_normativa as Array<{ status_vigencia?: string; fonte?: string | null; alerta?: unknown }>)
    : [];
  const normasPendentes = normativas.filter(
    (item) => item.status_vigencia !== 'verificado_fonte_oficial' || !item.fonte || item.alerta,
  ).length;
  const ausentes = Array.isArray(dados.elementos_ausentes) ? dados.elementos_ausentes.length : 0;
  const trechos = Array.isArray(dados.trechos_nao_localizados) ? dados.trechos_nao_localizados.length : 0;
  const lacunas = Array.isArray(dados.lacunas_probatorias) ? dados.lacunas_probatorias.length : 0;
  const riscos = Array.isArray(dados.riscos_preclusao_altos) ? dados.riscos_preclusao_altos.length : 0;
  const triagem = dados.triagem as { divergencias?: unknown[] } | undefined;
  const divergencias = Array.isArray(triagem?.divergencias) ? triagem.divergencias.length : 0;

  const pendencias: string[] = [];
  if (naoVerificados > 0) pendencias.push(`${naoVerificados} precedente(s) ainda sem confirmação em fonte oficial`);
  if (aConferir > 0)
    pendencias.push(`${aConferir} precedente(s) com trecho informado pelo cliente, a conferir na fonte`);
  if (ressalvasPrecedentes > 0)
    pendencias.push(`${ressalvasPrecedentes} precedente(s) com ressalva sobre suporte à tese, a conferir`);
  if (normasPendentes > 0) pendencias.push(`${normasPendentes} dispositivo(s) legal(is) com vigência a confirmar`);
  if (ausentes > 0) pendencias.push(`${ausentes} elemento(s) não constam no documento`);
  if (trechos > 0) pendencias.push(`${trechos} trecho(s) não localizado(s) no documento`);
  if (lacunas > 0) pendencias.push(`${lacunas} lacuna(s) probatória(s)`);
  if (riscos > 0) pendencias.push(`${riscos} risco(s) alto(s) de preclusão a avaliar`);
  if (divergencias > 0) pendencias.push(`${divergencias} divergência(s) na triagem a conferir`);
  if ((dados.regime_onus_area as { alerta?: unknown } | undefined)?.alerta)
    pendencias.push('panorama do ônus da prova com vigência a confirmar');

  const fundamentado = precedentes.some(evidenciaServidor) && pendencias.length === 0;
  let resumo = pendencias.length
    ? `Resultado disponível, com pontos a conferir: ${pendencias.join('; ')}.`
    : fundamentado
      ? 'Resultado disponível, com precedentes conferidos pelo servidor em fonte oficial.'
      : 'Resultado disponível.';
  if (tool === NOMES_TOOLS.pecaRedigir) resumo += ` ${AVISO_OBRIGATORIO}`;
  return { etapa, situacao: 'concluida', fundamentado, resumo };
}

/** Mensagens ao usuário por motivo interno; o motivo em si nunca é exposto. */
export const ORIENTACAO_ERRO: Record<string, string> = {
  ANALISE_SESSAO_INDISPONIVEL: 'Não localizei esta análise para o seu usuário. Inicie uma nova análise.',
  ANALISE_FASE_AUSENTE: 'Falta informar a fase processual para iniciar a análise.',
  ANALISE_ETAPA_PREVIA_AUSENTE: 'Esta etapa depende de uma etapa anterior que ainda não foi concluída nesta análise.',
  ANALISE_APONTAMENTO_INVALIDO:
    'Algum trecho a corrigir não foi localizado (ou aparece mais de uma vez) no texto original. Nada foi alterado.',
  ANALISE_COMBO_JA_ATIVO: 'Este pacote já está ativo nesta análise.',
  ANALISE_EM_ANDAMENTO:
    'Esta solicitação já está em processamento. Consulte novamente a mesma solicitação; não inicie outra cobrança.',
  ANALISE_RECONCILIACAO:
    'Esta solicitação não tem resultado confirmado. Confira o andamento antes de iniciar outra tentativa ou cobrança.',
  ANALISE_RESUMO_GRANDE: 'Não foi possível registrar o andamento desta etapa. Tente novamente.',
  BILLING_INSUFFICIENT_BALANCE: 'Saldo insuficiente para esta análise. Recarregue seus créditos para continuar.',
  IDEMPOTENCY_CONFLICT: 'Esta solicitação repete uma anterior com conteúdo diferente. Refaça a análise.',
  UNAUTHORIZED_CAPABILITY: 'É necessário estar autenticado para usar a análise.',
  INVALID_INPUT: 'Alguns dados da solicitação estão ausentes ou inválidos.',
  GENERICO: 'Não foi possível concluir esta etapa agora. Tente novamente.',
};
