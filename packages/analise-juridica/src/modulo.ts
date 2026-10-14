import { ToolRegistry } from '@forgelex/agent-core';
import { DomainError, getErrorCode } from '@forgelex/domain';
import type { LedgerService } from '@forgelex/billing-ledger';
import type { Client } from '@forgelex/persistence';
import { CobrancaAnalise, type InfoCobranca } from './cobranca.js';
import { NOMES_TOOLS, NOMES_TOOLS_EXPOSTAS, PREFIXO_TOOLS } from './contratos.js';
import { EstadoAnalitico } from './estado.js';
import { JurisprudenciaVerificador, criarBuscadorHttp, type BuscadorWeb } from './jurisprudencia-verificar.js';
import { executarMigrationsAnalise } from './migrations.js';
import { ehToolAnalitica } from './precos.js';
import { criarToolAvaliarProva } from './tools/avaliar-prova.js';
import { ComboAtivarInputSchema, criarToolComboAtivar } from './tools/combo-ativar.js';
import type { DepsAnalise } from './tools/comum.js';
import { criarToolEstrategiaDefinir } from './tools/estrategia-definir.js';
import { criarToolJurisprudenciaVerificar } from './tools/jurisprudencia-verificar-tool.js';
import { criarToolMapearTeses } from './tools/mapear-teses.js';
import { criarToolPecaAnalisar } from './tools/peca-analisar.js';
import { criarToolPecaRedigir } from './tools/peca-redigir.js';

interface RequisicaoMcp { jsonrpc: '2.0'; id?: string | number; method: string; params?: Record<string, any> }
interface RespostaMcp { jsonrpc: '2.0'; id?: string | number; result?: unknown; error?: { code: number; message: string; data?: unknown } }
interface ContextoChamada { tenantId?: string; userId?: string; idempotencyKey?: string; abortSignal?: AbortSignal }

export interface OpcoesModuloAnalise {
  client: Client;
  ledger: LedgerService;
  /** Registro compartilhado do servidor: as tools do módulo são registradas nele para listagem. */
  registry: ToolRegistry;
  buscador?: BuscadorWeb;
}

const CODIGOS_PUBLICOS = new Set([
  'ANALISE_SESSAO_INDISPONIVEL', 'ANALISE_FASE_AUSENTE', 'ANALISE_ETAPA_PREVIA_AUSENTE', 'ANALISE_APONTAMENTO_INVALIDO',
  'ANALISE_COMBO_JA_ATIVO', 'ANALISE_RESUMO_GRANDE',
]);

/**
 * Módulo de agentes jurídicos analíticos. Autônomo: não usa tools, tabelas nem
 * lógica do produto atual; só compartilha identidade do usuário, saldo/débito e
 * o transporte MCP.
 */
export class ModuloAnalise {
  private constructor(
    private readonly registry: ToolRegistry,
    private readonly cobranca: CobrancaAnalise,
    private readonly estado: EstadoAnalitico,
  ) {}

  public static async criar(opcoes: OpcoesModuloAnalise): Promise<ModuloAnalise> {
    await executarMigrationsAnalise(opcoes.client);
    const estado = new EstadoAnalitico(opcoes.client);
    const verificador = new JurisprudenciaVerificador({ buscador: opcoes.buscador });
    const deps: DepsAnalise = { estado, verificador };
    for (const tool of [
      criarToolPecaAnalisar(deps),
      criarToolMapearTeses(deps),
      criarToolAvaliarProva(deps),
      criarToolEstrategiaDefinir(deps),
      criarToolPecaRedigir(deps),
      criarToolComboAtivar(),
      criarToolJurisprudenciaVerificar(verificador),
    ]) opcoes.registry.register(tool);
    return new ModuloAnalise(opcoes.registry, new CobrancaAnalise(opcoes.client, opcoes.ledger), estado);
  }

  /** Nomes que o servidor deve expor ao cliente MCP. */
  public static readonly toolsExpostas = NOMES_TOOLS_EXPOSTAS;

  public owns(toolName: string): boolean {
    return toolName.startsWith(PREFIXO_TOOLS);
  }

  public async call(request: RequisicaoMcp, contexto: ContextoChamada): Promise<RespostaMcp> {
    const id = request.id;
    const nome = String(request.params?.name ?? '');
    const argumentos = (request.params?.arguments ?? {}) as Record<string, unknown>;
    const falha = (code: number, message: string, data?: unknown): RespostaMcp => ({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

    if (!NOMES_TOOLS_EXPOSTAS.includes(nome)) return falha(-32601, `Method not found: ferramenta '${nome}' não está disponível.`);
    if (!contexto.tenantId || !contexto.userId) return falha(-32001, 'Autenticação do usuário é obrigatória para as ferramentas de análise.', { code: 'UNAUTHORIZED_CAPABILITY', retryable: false });

    const chaveArg = typeof argumentos.idempotencyKey === 'string' ? argumentos.idempotencyKey.trim() : '';
    const idempotencyKey = contexto.idempotencyKey?.trim() || chaveArg;
    if (!idempotencyKey) return falha(-32602, 'Invalid params: a chave de idempotência é obrigatória.');
    const { idempotencyKey: _descartada, ...entrada } = argumentos;

    const tenantId = contexto.tenantId;
    const userId = contexto.userId;
    const abortSignal = contexto.abortSignal ?? new AbortController().signal;
    const sessionId = `analise_${idempotencyKey}`;
    const executarTool = async (nomeTool: string, dados: unknown) =>
      (await this.registry.executeTool(nomeTool, dados, { sessionId, tenantId, userId, abortSignal, source: 'MCP' })).data as object;

    try {
      let execucao;
      if (nome === NOMES_TOOLS.comboAtivar) {
        const parsed = ComboAtivarInputSchema.safeParse(entrada);
        if (!parsed.success) return falha(-32602, 'Parâmetros inválidos.', { code: 'INVALID_INPUT', retryable: false, issues: parsed.error.issues });
        await this.estado.exigirDono(parsed.data.sessao_analitica_id, { tenantId, usuarioId: userId });
        const ativado = await this.cobranca.ativarCombo({
          tenantId, userId, idempotencyKey, sessaoId: parsed.data.sessao_analitica_id, argumentos: entrada, combo: parsed.data.combo,
        });
        execucao = { data: { sessao_analitica_id: parsed.data.sessao_analitica_id, ...ativado.data }, billing: ativado.billing };
      } else if (ehToolAnalitica(nome)) {
        const sessaoId = typeof entrada.sessao_analitica_id === 'string' ? entrada.sessao_analitica_id : '';
        execucao = await this.cobranca.executar({
          tenantId, userId, idempotencyKey, tool: nome, sessaoId, argumentos: entrada,
          operation: () => executarTool(nome, entrada),
        });
      } else {
        return falha(-32601, `Method not found: ferramenta '${nome}' não está disponível.`);
      }
      return { jsonrpc: '2.0', id, result: respostaSucesso(execucao.data, execucao.billing) };
    } catch (erro) {
      return this.erro(id, erro);
    }
  }

  private erro(id: RequisicaoMcp['id'], erro: unknown): RespostaMcp {
    const codigo = getErrorCode(erro, 'TOOL_EXECUTION_FAILED');
    const detalhes = (erro as { details?: Record<string, unknown> })?.details;
    const codigoAnalise = typeof detalhes?.code === 'string' && CODIGOS_PUBLICOS.has(detalhes.code) ? detalhes.code : undefined;
    if (codigo === 'INVALID_CANONICAL_STATE' && Array.isArray(detalhes?.issues)) {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Parâmetros inválidos.', data: { code: 'INVALID_INPUT', retryable: false, issues: detalhes.issues } } };
    }
    const mensagemPublica = erro instanceof DomainError && (codigoAnalise || codigo === 'BILLING_INSUFFICIENT_BALANCE' || codigo === 'IDEMPOTENCY_CONFLICT')
      ? erro.message
      : 'Falha na execução da ferramenta. Tente novamente.';
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: mensagemPublica,
        data: {
          code: codigoAnalise ?? codigo,
          message: mensagemPublica,
          retryable: !codigoAnalise && ['TOOL_EXECUTION_FAILED', 'TOOL_TIMEOUT'].includes(codigo),
          ...(codigoAnalise && detalhes ? { details: detalhes } : {}),
        },
      },
    };
  }
}

function respostaSucesso(dados: object, billing: InfoCobranca) {
  return {
    content: [{ type: 'text', text: JSON.stringify(dados) }],
    structuredContent: dados,
    isError: false,
    billing: {
      mode: billing.mode,
      isReplay: billing.isReplay,
      chargedCents: billing.chargedCents,
      remainingBalanceCents: billing.remainingBalanceCents,
      ...(billing.combo ? { combo: billing.combo } : {}),
    },
  };
}

export { criarBuscadorHttp };
