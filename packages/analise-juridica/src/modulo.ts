import { ToolRegistry } from '@forgelex/agent-core';
import { DomainError, getErrorCode } from '@forgelex/domain';
import type { LedgerService } from '@forgelex/billing-ledger';
import { assertMigrationsApplied, type Client } from '@forgelex/persistence';
import { CobrancaAnalise, type InfoCobranca } from './cobranca.js';
import { NOMES_TOOLS, NOMES_TOOLS_EXPOSTAS, PREFIXO_TOOLS } from './contratos.js';
import { EstadoAnalitico } from './estado.js';
import {
  JurisprudenciaVerificador,
  criarBuscadorHttp,
  criarLeitorHttp,
  type BuscadorWeb,
} from './jurisprudencia-verificar.js';
import { analiseMigrations, executarMigrationsAnalise } from './migrations.js';
import { ehToolAnalitica } from './precos.js';
import { INSTRUCAO_DISCRICAO, ORIENTACAO_ERRO, montarApresentacao } from './apresentacao.js';
import { criarToolAvaliarProva } from './tools/avaliar-prova.js';
import { ComboAtivarInputSchema, criarToolComboAtivar } from './tools/combo-ativar.js';
import type { DepsAnalise } from './tools/comum.js';
import { criarToolEstrategiaDefinir } from './tools/estrategia-definir.js';
import { criarToolJurisprudenciaVerificar } from './tools/jurisprudencia-verificar-tool.js';
import { criarToolMapearTeses } from './tools/mapear-teses.js';
import { criarToolPecaAnalisar } from './tools/peca-analisar.js';
import { criarToolPecaRedigir } from './tools/peca-redigir.js';

interface RequisicaoMcp {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, any>;
}
interface RespostaMcp {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
interface ContextoChamada {
  tenantId?: string;
  userId?: string;
  idempotencyKey?: string;
  abortSignal?: AbortSignal;
}

export interface OpcoesModuloAnalise {
  client: Client;
  ledger: LedgerService;
  /** Registro compartilhado do servidor: as tools do módulo são registradas nele para listagem. */
  registry: ToolRegistry;
  buscador?: BuscadorWeb;
  migrationMode?: 'apply' | 'verify';
}

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
    if (opcoes.migrationMode === 'verify') {
      await assertMigrationsApplied(opcoes.client, analiseMigrations);
    } else {
      await executarMigrationsAnalise(opcoes.client);
    }
    const estado = new EstadoAnalitico(opcoes.client);
    const verificador = new JurisprudenciaVerificador({ buscador: opcoes.buscador ?? criarLeitorHttp() });
    const deps: DepsAnalise = { estado, verificador };
    for (const tool of [
      criarToolPecaAnalisar(deps),
      criarToolMapearTeses(deps),
      criarToolAvaliarProva(deps),
      criarToolEstrategiaDefinir(deps),
      criarToolPecaRedigir(deps),
      criarToolComboAtivar(),
      criarToolJurisprudenciaVerificar(verificador),
    ])
      opcoes.registry.register(
        tool.name === NOMES_TOOLS.jurisprudenciaVerificar
          ? tool
          : { ...tool, description: `${tool.description} ${INSTRUCAO_DISCRICAO}` },
      );
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
    const falha = (code: number, message: string, data?: unknown): RespostaMcp => ({
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data ? { data } : {}) },
    });

    if (!NOMES_TOOLS_EXPOSTAS.includes(nome)) return falha(-32601, 'Esta função não está disponível.');
    if (!contexto.tenantId || !contexto.userId)
      return falha(-32001, ORIENTACAO_ERRO.UNAUTHORIZED_CAPABILITY!, dadosErro('UNAUTHORIZED_CAPABILITY', false));

    const chaveArg = typeof argumentos.idempotencyKey === 'string' ? argumentos.idempotencyKey.trim() : '';
    const idempotencyKey = contexto.idempotencyKey?.trim() || chaveArg;
    if (!idempotencyKey) return falha(-32602, 'A solicitação precisa de uma chave de idempotência.');
    const { idempotencyKey: _descartada, ...entrada } = argumentos;

    const tenantId = contexto.tenantId;
    const userId = contexto.userId;
    const abortSignal = contexto.abortSignal ?? new AbortController().signal;
    const sessionId = `analise_${idempotencyKey}`;
    const executarTool = async (nomeTool: string, dados: unknown) =>
      (await this.registry.executeTool(nomeTool, dados, { sessionId, tenantId, userId, abortSignal, source: 'MCP' }))
        .data as object;

    try {
      let execucao;
      if (nome === NOMES_TOOLS.comboAtivar) {
        const parsed = ComboAtivarInputSchema.safeParse(entrada);
        if (!parsed.success)
          return falha(-32602, ORIENTACAO_ERRO.INVALID_INPUT!, dadosErro('INVALID_INPUT', false, parsed.error.issues));
        await this.estado.exigirDono(parsed.data.sessao_analitica_id, { tenantId, usuarioId: userId });
        const ativado = await this.cobranca.ativarCombo({
          tenantId,
          userId,
          idempotencyKey,
          sessaoId: parsed.data.sessao_analitica_id,
          argumentos: entrada,
          combo: parsed.data.combo,
        });
        execucao = {
          data: { sessao_analitica_id: parsed.data.sessao_analitica_id, ...ativado.data },
          billing: ativado.billing,
        };
      } else if (ehToolAnalitica(nome)) {
        const sessaoId = typeof entrada.sessao_analitica_id === 'string' ? entrada.sessao_analitica_id : '';
        execucao = await this.cobranca.executar({
          tenantId,
          userId,
          idempotencyKey,
          tool: nome,
          sessaoId,
          argumentos: entrada,
          operation: () => executarTool(nome, entrada),
        });
      } else {
        return falha(-32601, 'Esta função não está disponível.');
      }
      return { jsonrpc: '2.0', id, result: respostaSucesso(nome, execucao.data, execucao.billing) };
    } catch (erro) {
      return this.erro(id, erro);
    }
  }

  private erro(id: RequisicaoMcp['id'], erro: unknown): RespostaMcp {
    const codigo = getErrorCode(erro, 'TOOL_EXECUTION_FAILED');
    const detalhes = (erro as { details?: Record<string, unknown> })?.details;
    if (codigo === 'INVALID_CANONICAL_STATE' && Array.isArray(detalhes?.issues)) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: ORIENTACAO_ERRO.INVALID_INPUT!,
          data: dadosErro('INVALID_INPUT', false, detalhes.issues),
        },
      };
    }
    const interno = typeof detalhes?.code === 'string' && ORIENTACAO_ERRO[detalhes.code] ? detalhes.code : codigo;
    const conhecido = erro instanceof DomainError && ORIENTACAO_ERRO[interno] !== undefined;
    const mensagem = conhecido ? ORIENTACAO_ERRO[interno]! : ORIENTACAO_ERRO.GENERICO!;
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: mensagem,
        data: {
          orientacao: mensagem,
          retryable:
            interno === 'ANALISE_EM_ANDAMENTO' ||
            (!conhecido && ['TOOL_EXECUTION_FAILED', 'TOOL_TIMEOUT'].includes(codigo)),
        },
      },
    };
  }
}

/** Erro ao cliente: orientação em texto e se vale repetir; o motivo interno não sai do servidor. */
function dadosErro(motivo: string, retryable: boolean, problemas?: readonly unknown[]) {
  const orientacao = ORIENTACAO_ERRO[motivo] ?? ORIENTACAO_ERRO.GENERICO!;
  const campos = (problemas ?? []).flatMap((item) => {
    const par = item as { path?: Array<string | number>; message?: string };
    return par.message ? [`${(par.path ?? []).join('.') || 'solicitação'}: ${par.message}`] : [];
  });
  return { orientacao, retryable, ...(campos.length ? { problemas: campos.slice(0, 10) } : {}) };
}

function respostaSucesso(tool: string, dadosBase: object, billing: InfoCobranca) {
  const dados = { ...dadosBase, apresentacao: montarApresentacao(tool, dadosBase as Record<string, unknown>) };
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
