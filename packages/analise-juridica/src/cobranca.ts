import { createHash, randomUUID } from 'node:crypto';
import { DomainError } from '@forgelex/domain';
import { decodeResultSnapshot, encodeResultSnapshot, type LedgerService } from '@forgelex/billing-ledger';
import type { Client } from '@forgelex/persistence';
import { NOMES_TOOLS, ID_SESSAO_NOVA } from './contratos.js';
import { COMBOS, precoCheioCents, precoComboCents, ehToolAnalitica, type ComboId } from './precos.js';
import { EstadoAnalitico } from './estado.js';

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

function impressao(params: Pick<ParametrosCobranca<unknown>, 'tool' | 'argumentos' | 'userId' | 'sessaoId'>): string {
  return createHash('sha256')
    .update(JSON.stringify([params.userId, params.sessaoId, params.tool, params.argumentos ?? {}]))
    .digest('hex');
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
    return this.executarUmaVez(params, async () => {
      if (ehToolAnalitica(params.tool) && params.sessaoId !== ID_SESSAO_NOVA) {
        const coberto = await this.consumirCombo(params);
        if (coberto) return coberto;
      }
      const custo = ehToolAnalitica(params.tool) ? precoCheioCents(params.tool) : undefined;
      if (custo === undefined)
        throw new DomainError('INVALID_CANONICAL_STATE', 'Tool sem política de preço neste módulo.', {
          code: 'ANALISE_SEM_PRECO',
        });
      return this.cobrarNoLedger(params, custo);
    });
  }

  /** Ativação de combo: débito único do pacote; as chamadas seguintes descontam dele. */
  public async ativarCombo(
    params: Omit<ParametrosCobranca<object>, 'operation' | 'tool'> & { combo: ComboId },
  ): Promise<ExecucaoCobrada<{ combo: ComboId; preco_cents: number; tools_incluidas: string[] }>> {
    const preco = precoComboCents(params.combo);
    const tools = [...COMBOS[params.combo].tools] as string[];
    const compra = {
      ...params,
      tool: NOMES_TOOLS.comboAtivar,
      operation: async () => {
        const existente = await this.client.execute({
          sql: 'SELECT id FROM analise_combos WHERE sessao_analitica_id = ? AND combo = ?',
          args: [params.sessaoId, params.combo],
        });
        if (existente.rows[0])
          throw new DomainError('INVALID_CANONICAL_STATE', 'Este combo já foi ativado para esta sessão.', {
            code: 'ANALISE_COMBO_JA_ATIVO',
          });
        await this.client.execute({
          sql: `INSERT INTO analise_combos (id, tenant_id, usuario_id, sessao_analitica_id, combo, tools_restantes, preco_cents, ativado_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            randomUUID(),
            params.tenantId,
            params.userId,
            params.sessaoId,
            params.combo,
            JSON.stringify(tools),
            preco,
            new Date().toISOString(),
          ],
        });
        return { combo: params.combo, preco_cents: preco, tools_incluidas: tools };
      },
    };
    return this.executarUmaVez(compra, () => this.cobrarNoLedger(compra, preco));
  }

  /** The database claim covers both billing paths, including retries from another process. */
  private async executarUmaVez<T extends object>(
    params: ParametrosCobranca<T>,
    operation: () => Promise<ExecucaoCobrada<T>>,
  ): Promise<ExecucaoCobrada<T>> {
    if (params.sessaoId !== ID_SESSAO_NOVA) {
      await new EstadoAnalitico(this.client).exigirDono(params.sessaoId, {
        tenantId: params.tenantId,
        usuarioId: params.userId,
      });
    }
    // Old combo snapshots have no request fingerprint. Never replay unverifiable private results.
    const legacy = await this.client.execute({
      sql: 'SELECT id FROM analise_consumos WHERE tenant_id = ? AND idempotency_key = ?',
      args: [params.tenantId, params.idempotencyKey],
    });
    if (legacy.rows.length)
      throw new DomainError('IDEMPOTENCY_CONFLICT', 'Resultado anterior sem vínculo verificável ao pedido.');
    const id = randomUUID();
    const fingerprint = impressao(params);
    const timestamp = new Date().toISOString();
    const claimed = await this.client.execute({
      sql: `INSERT INTO analise_operacoes (id, tenant_id, usuario_id, idempotency_key, sessao_analitica_id, tool, fingerprint, status, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
      args: [
        id,
        params.tenantId,
        params.userId,
        params.idempotencyKey,
        params.sessaoId,
        params.tool,
        fingerprint,
        timestamp,
        timestamp,
      ],
    });
    if (claimed.rowsAffected !== 1) {
      const existing = await this.client.execute({
        sql: 'SELECT usuario_id, fingerprint, status, resultado FROM analise_operacoes WHERE tenant_id = ? AND idempotency_key = ?',
        args: [params.tenantId, params.idempotencyKey],
      });
      const row = existing.rows[0];
      if (!row || row.usuario_id !== params.userId || row.fingerprint !== fingerprint) {
        throw new DomainError('IDEMPOTENCY_CONFLICT', 'A chave pertence a outro usuário ou conteúdo.');
      }
      if (row.status !== 'COMPLETED' || !row.resultado) {
        throw new DomainError(
          'INVALID_CANONICAL_STATE',
          'Solicitação em andamento ou com resultado incerto; não será repetida automaticamente.',
          { code: row.status === 'RUNNING' ? 'ANALISE_EM_ANDAMENTO' : 'ANALISE_RECONCILIACAO' },
        );
      }
      const replay = decodeResultSnapshot<ExecucaoCobrada<T>>(String(row.resultado));
      return {
        data: replay.data,
        billing: {
          ...replay.billing,
          chargedCents: 0,
          isReplay: true,
          remainingBalanceCents: await this.saldo(params.tenantId),
        },
      };
    }
    try {
      const result = await operation();
      await this.client.execute({
        sql: "UPDATE analise_operacoes SET status = 'COMPLETED', resultado = ?, atualizado_em = ? WHERE id = ? AND status = 'RUNNING'",
        args: [encodeResultSnapshot(result), new Date().toISOString(), id],
      });
      return result;
    } catch (error) {
      await this.client.execute({
        sql: "UPDATE analise_operacoes SET status = 'FAILED', atualizado_em = ? WHERE id = ? AND status = 'RUNNING'",
        args: [new Date().toISOString(), id],
      });
      throw error;
    }
  }

  private async cobrarNoLedger<T extends object>(
    params: ParametrosCobranca<T>,
    custo: number,
  ): Promise<ExecucaoCobrada<T>> {
    const execucao = await this.ledger.executeBillableOperation<T>({
      tenantId: params.tenantId,
      userId: params.userId,
      idempotencyKey: params.idempotencyKey,
      requestFingerprint: impressao(params),
      costCents: custo,
      sessionId: params.sessaoId,
      usage: {
        capability: params.tool,
        toolName: params.tool,
        requestId: params.idempotencyKey,
        sessionId: params.sessaoId,
        userId: params.userId,
      },
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

  private async consumirCombo<T extends object>(
    params: ParametrosCobranca<T>,
  ): Promise<ExecucaoCobrada<T> | undefined> {
    const combos = await this.client.execute({
      sql: `SELECT id, combo, tools_restantes FROM analise_combos
            WHERE tenant_id = ? AND usuario_id = ? AND sessao_analitica_id = ? ORDER BY ativado_em ASC`,
      args: [params.tenantId, params.userId, params.sessaoId],
    });
    for (const linha of combos.rows) {
      const proximas = await this.reservarDireito(String(linha.id), String(linha.tools_restantes), params.tool);
      if (!proximas) continue;
      let resultado: T;
      try {
        resultado = await params.operation();
      } catch (error) {
        await this.devolverDireito(String(linha.id), params.tool);
        throw error;
      }
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

  private async reservarDireito(comboId: string, initial: string, tool: string): Promise<string[] | undefined> {
    let current = initial;
    for (let attempt = 0; attempt < 10; attempt++) {
      const remaining = JSON.parse(current) as string[];
      if (!remaining.includes(tool)) return undefined;
      const next = remaining.filter((name) => name !== tool);
      const reserved = await this.client.execute({
        sql: 'UPDATE analise_combos SET tools_restantes = ? WHERE id = ? AND tools_restantes = ?',
        args: [JSON.stringify(next), comboId, current],
      });
      if (reserved.rowsAffected === 1) return next;
      // Another tool may have changed the list without consuming this entitlement.
      const row = await this.client.execute({
        sql: 'SELECT tools_restantes FROM analise_combos WHERE id = ?',
        args: [comboId],
      });
      if (!row.rows[0]) return undefined;
      current = String(row.rows[0].tools_restantes);
    }
    throw new DomainError(
      'INVALID_CANONICAL_STATE',
      'O combo está sendo atualizado; nenhuma cobrança avulsa foi iniciada.',
      { code: 'ANALISE_RECONCILIACAO' },
    );
  }

  private async devolverDireito(comboId: string, tool: string): Promise<void> {
    const tx = await this.client.transaction();
    try {
      // Serialize restoration with concurrent consumption; do not restore an obsolete whole list.
      await tx.execute({
        sql: 'UPDATE analise_combos SET tools_restantes = tools_restantes WHERE id = ?',
        args: [comboId],
      });
      const rows = await tx.execute({
        sql: 'SELECT tools_restantes FROM analise_combos WHERE id = ?',
        args: [comboId],
      });
      if (rows.rows[0]) {
        const remaining = JSON.parse(String(rows.rows[0].tools_restantes)) as string[];
        if (!remaining.includes(tool)) remaining.push(tool);
        await tx.execute({
          sql: 'UPDATE analise_combos SET tools_restantes = ? WHERE id = ?',
          args: [JSON.stringify(remaining), comboId],
        });
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  private saldo(tenantId: string): Promise<number> {
    return this.ledger.getAvailableBalanceCents(tenantId);
  }
}
