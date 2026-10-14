import { createHash, randomUUID } from 'node:crypto';
import { DomainError } from '@forgelex/domain';
import { decodeResultSnapshot, encodeResultSnapshot, type LedgerService } from '@forgelex/billing-ledger';
import type { Client } from '@forgelex/persistence';
import { NOMES_TOOLS, ID_SESSAO_NOVA } from './contratos.js';
import { COMBOS, precoCheioCents, precoComboCents, ehToolAnalitica, type ComboId } from './precos.js';

export interface InfoCobranca {
  mode: 'METERED' | 'COMBO';
  chargedCents: number;
  isReplay: boolean;
  remainingBalanceCents: number;
  combo?: { id: ComboId; tools_restantes: string[] };
}

export interface ExecucaoCobrada<T> {
  data: T;
  billing: InfoCobranca;
}

interface ParametrosCobranca<T> {
  tenantId: string;
  userId: string;
  idempotencyKey: string;
  tool: string;
  sessaoId: string;
  argumentos: unknown;
  operation: () => Promise<T>;
}

function impressao(tool: string, argumentos: unknown): string {
  return createHash('sha256').update(`${tool}\n${JSON.stringify(argumentos ?? {})}`).digest('hex');
}

/**
 * Cobrança do módulo. Reaproveita apenas o mecanismo de débito por saldo do
 * ForgeLex (LedgerService); a precificação e os combos são deste módulo.
 */
export class CobrancaAnalise {
  public constructor(
    private readonly client: Client,
    private readonly ledger: LedgerService,
  ) {}

  public async executar<T extends object>(params: ParametrosCobranca<T>): Promise<ExecucaoCobrada<T>> {
    const { tenantId, idempotencyKey, tool } = params;

    // 1) Repetição de chamada já coberta por combo: devolve o resultado original, sem consumir de novo.
    const repetida = await this.client.execute({
      sql: 'SELECT resultado, combo_id, tool FROM analise_consumos WHERE tenant_id = ? AND idempotency_key = ?',
      args: [tenantId, idempotencyKey],
    });
    if (repetida.rows[0]) {
      if (String(repetida.rows[0].tool) !== tool) {
        throw new DomainError('IDEMPOTENCY_CONFLICT', 'A chave de idempotência pertence a outra operação. Nenhuma nova cobrança foi realizada.');
      }
      return {
        data: decodeResultSnapshot<T>(String(repetida.rows[0].resultado)),
        billing: { mode: 'COMBO', chargedCents: 0, isReplay: true, remainingBalanceCents: await this.saldo(tenantId) },
      };
    }

    // 2) Chamada coberta por combo ativo na sessão.
    if (ehToolAnalitica(tool) && params.sessaoId !== ID_SESSAO_NOVA) {
      const coberto = await this.consumirCombo(params);
      if (coberto) return coberto;
    }

    // 3) Preço cheio individual (ferramenta + triagem embutida), via ledger.
    const custo = tool === NOMES_TOOLS.comboAtivar ? undefined : ehToolAnalitica(tool) ? precoCheioCents(tool) : undefined;
    if (custo === undefined) throw new DomainError('INVALID_CANONICAL_STATE', 'Tool sem política de preço neste módulo.', { code: 'ANALISE_SEM_PRECO' });
    return this.cobrarNoLedger(params, custo);
  }

  /** Ativação de combo: débito único do pacote; as chamadas seguintes descontam dele. */
  public async ativarCombo(params: Omit<ParametrosCobranca<object>, 'operation' | 'tool'> & { combo: ComboId }): Promise<ExecucaoCobrada<{ combo: ComboId; preco_cents: number; tools_incluidas: string[] }>> {
    const existente = await this.client.execute({
      sql: 'SELECT id FROM analise_combos WHERE sessao_analitica_id = ? AND combo = ?',
      args: [params.sessaoId, params.combo],
    });
    if (existente.rows[0]) {
      throw new DomainError('INVALID_CANONICAL_STATE', 'Este combo já foi ativado para esta sessão.', { code: 'ANALISE_COMBO_JA_ATIVO' });
    }
    const preco = precoComboCents(params.combo);
    const tools = [...COMBOS[params.combo].tools] as string[];
    return this.cobrarNoLedger(
      {
        ...params,
        tool: NOMES_TOOLS.comboAtivar,
        operation: async () => {
          await this.client.execute({
            sql: `INSERT INTO analise_combos (id, tenant_id, usuario_id, sessao_analitica_id, combo, tools_restantes, preco_cents, ativado_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [randomUUID(), params.tenantId, params.userId, params.sessaoId, params.combo, JSON.stringify(tools), preco, new Date().toISOString()],
          });
          return { combo: params.combo, preco_cents: preco, tools_incluidas: tools };
        },
      },
      preco,
    );
  }

  private async cobrarNoLedger<T extends object>(params: ParametrosCobranca<T>, custo: number): Promise<ExecucaoCobrada<T>> {
    const execucao = await this.ledger.executeBillableOperation<T>({
      tenantId: params.tenantId,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      requestFingerprint: impressao(params.tool, params.argumentos),
      costCents: custo,
      sessionId: params.sessaoId,
      usage: { capability: params.tool, toolName: params.tool, requestId: params.idempotencyKey, sessionId: params.sessaoId, userId: params.userId },
      operation: params.operation,
    });
    return {
      data: execucao.data,
      billing: {
        mode: 'METERED',
        chargedCents: execucao.chargedCents,
        isReplay: execucao.isReplay,
        remainingBalanceCents: execucao.remainingBalanceCents,
      },
    };
  }

  private async consumirCombo<T extends object>(params: ParametrosCobranca<T>): Promise<ExecucaoCobrada<T> | undefined> {
    const combos = await this.client.execute({
      sql: `SELECT id, combo, tools_restantes FROM analise_combos
            WHERE tenant_id = ? AND usuario_id = ? AND sessao_analitica_id = ? ORDER BY ativado_em ASC`,
      args: [params.tenantId, params.userId, params.sessaoId],
    });
    for (const linha of combos.rows) {
      const restantes = JSON.parse(String(linha.tools_restantes)) as string[];
      if (!restantes.includes(params.tool)) continue;
      const proximas = restantes.filter((_nome, indice) => indice !== restantes.indexOf(params.tool));
      // Compare-and-set: duas chamadas concorrentes não consomem o mesmo direito do combo.
      const reservado = await this.client.execute({
        sql: 'UPDATE analise_combos SET tools_restantes = ? WHERE id = ? AND tools_restantes = ?',
        args: [JSON.stringify(proximas), String(linha.id), String(linha.tools_restantes)],
      });
      if (reservado.rowsAffected !== 1) continue;
      let resultado: T;
      try {
        resultado = await params.operation();
      } catch (error) {
        await this.client.execute({
          sql: 'UPDATE analise_combos SET tools_restantes = ? WHERE id = ? AND tools_restantes = ?',
          args: [String(linha.tools_restantes), String(linha.id), JSON.stringify(proximas)],
        });
        throw error;
      }
      await this.client.execute({
        sql: `INSERT INTO analise_consumos (id, tenant_id, idempotency_key, sessao_analitica_id, tool, combo_id, resultado, criado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [randomUUID(), params.tenantId, params.idempotencyKey, params.sessaoId, params.tool, String(linha.id), encodeResultSnapshot(resultado), new Date().toISOString()],
      });
      return {
        data: resultado,
        billing: {
          mode: 'COMBO',
          chargedCents: 0,
          isReplay: false,
          remainingBalanceCents: await this.saldo(params.tenantId),
          combo: { id: String(linha.combo) as ComboId, tools_restantes: proximas },
        },
      };
    }
    return undefined;
  }

  private saldo(tenantId: string): Promise<number> {
    return this.ledger.getAvailableBalanceCents(tenantId);
  }
}
