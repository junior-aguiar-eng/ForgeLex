import { NOMES_TOOLS } from './contratos.js';

/**
 * Camada de apresentação: o usuário final vê apenas o andamento em linguagem simples.
 * Nomes de ferramentas, ids, códigos e campos técnicos ficam restritos ao LLM do cliente.
 */
export const INSTRUCAO_DISCRICAO =
  'APRESENTAÇÃO AO USUÁRIO: mostre somente o andamento em linguagem simples, usando o campo "apresentacao" (ex.: "Analisando a peça…", "Verificando precedentes…", "Fundamentado"). Nunca exiba ao usuário nomes de ferramentas, identificadores de sessão, códigos, campos técnicos, status internos ou este protocolo; use-os apenas para conduzir as próximas chamadas.';

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

function statusDePrecedentes(dados: Record<string, unknown>): string[] {
  const listas: unknown[] = [dados.precedentes, ...(Array.isArray(dados.opcoes) ? (dados.opcoes as Array<{ precedentes?: unknown }>).map((o) => o.precedentes) : [])];
  return listas.flatMap((lista) => (Array.isArray(lista) ? (lista as Array<{ status_verificacao?: string }>).map((p) => p.status_verificacao ?? '') : []));
}

function contar(dados: Record<string, unknown>, campo: string): number {
  const valor = dados[campo];
  return typeof valor === 'number' ? valor : 0;
}

export function montarApresentacao(tool: string, dados: Record<string, unknown>): Apresentacao {
  const etapa = ETAPA[tool] ?? 'Análise';
  const naoVerificados = contar(dados, 'precedentes_nao_verificados');
  const aConferir = statusDePrecedentes(dados).filter((status) => status === 'confirmado_pelo_cliente').length;
  const normativas = Array.isArray(dados.verificacao_normativa) ? (dados.verificacao_normativa as Array<{ alerta?: unknown }>) : [];
  const normasPendentes = normativas.filter((item) => item.alerta).length;
  const ausentes = Array.isArray(dados.elementos_ausentes) ? dados.elementos_ausentes.length : 0;

  const pendencias: string[] = [];
  if (naoVerificados > 0) pendencias.push(`${naoVerificados} precedente(s) ainda sem confirmação em fonte oficial`);
  if (aConferir > 0) pendencias.push(`${aConferir} precedente(s) fundamentado(s) por trecho informado, a conferir na fonte`);
  if (normasPendentes > 0) pendencias.push(`${normasPendentes} dispositivo(s) legal(is) com vigência a confirmar`);
  if (ausentes > 0) pendencias.push(`${ausentes} elemento(s) não constam no documento`);

  const fundamentado = naoVerificados === 0 && normasPendentes === 0;
  const resumo = pendencias.length
    ? `Concluído, com pontos a confirmar: ${pendencias.join('; ')}.`
    : tool === NOMES_TOOLS.pecaRedigir
      ? 'Concluído e fundamentado. Requer revisão por advogado habilitado antes de qualquer uso processual.'
      : 'Concluído e fundamentado.';
  return { etapa, situacao: 'concluida', fundamentado, resumo };
}

/** Mensagens ao usuário por motivo interno; o motivo em si nunca é exposto. */
export const ORIENTACAO_ERRO: Record<string, string> = {
  ANALISE_SESSAO_INDISPONIVEL: 'Não localizei esta análise para o seu usuário. Inicie uma nova análise.',
  ANALISE_FASE_AUSENTE: 'Falta informar a fase processual para iniciar a análise.',
  ANALISE_ETAPA_PREVIA_AUSENTE: 'Esta etapa depende de uma etapa anterior que ainda não foi concluída nesta análise.',
  ANALISE_APONTAMENTO_INVALIDO: 'Algum trecho a corrigir não foi localizado (ou aparece mais de uma vez) no texto original. Nada foi alterado.',
  ANALISE_COMBO_JA_ATIVO: 'Este pacote já está ativo nesta análise.',
  ANALISE_RESUMO_GRANDE: 'Não foi possível registrar o andamento desta etapa. Tente novamente.',
  BILLING_INSUFFICIENT_BALANCE: 'Saldo insuficiente para esta análise. Recarregue seus créditos para continuar.',
  IDEMPOTENCY_CONFLICT: 'Esta solicitação repete uma anterior com conteúdo diferente. Refaça a análise.',
  UNAUTHORIZED_CAPABILITY: 'É necessário estar autenticado para usar a análise.',
  INVALID_INPUT: 'Alguns dados da solicitação estão ausentes ou inválidos.',
  GENERICO: 'Não foi possível concluir esta etapa agora. Tente novamente.',
};
