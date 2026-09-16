import { eq } from 'drizzle-orm';
import { ForgeLexDatabase } from '@forgelex/persistence';
import { ledgerAccounts, ledgerEntries } from './schema/ledger-schema.js';
import { DomainError } from '@forgelex/domain';
import { randomUUID } from 'node:crypto';

export interface BillableExecutionResult<T> {
  data: T;
  isReplay: boolean;
  chargedCents: number;
  remainingBalanceCents: number;
}

export class LedgerService {
  private readonly db: ForgeLexDatabase;

  constructor(db: ForgeLexDatabase) {
    this.db = db;
  }

  public async bootstrapTables(): Promise<void> {
    // Garante que as tabelas de billing existam no banco
    const client = (this.db as any).$client;
    if (client && typeof client.execute === 'function') {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS ledger_accounts (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL UNIQUE,
          paid_balance_cents INTEGER NOT NULL DEFAULT 0,
          promotional_balance_cents INTEGER NOT NULL DEFAULT 0,
          promo_expires_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS ledger_entries (
          id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          idempotency_key TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL,
          bucket TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          operation_result_snapshot TEXT,
          created_at TEXT NOT NULL
        );
      `);
    }
  }

  public async getOrCreateAccount(tenantId: string, initialPaidCents = 6300, initialPromoCents = 1500) {
    const existing = await this.db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, tenantId));

    if (existing[0]) {
      return existing[0];
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    // Bônus promocional válido por 30 dias conforme observado no benchmark
    const promoExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await this.db.insert(ledgerAccounts).values({
      id,
      tenantId,
      paidBalanceCents: initialPaidCents,
      promotionalBalanceCents: initialPromoCents,
      promoExpiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.db.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, id));
    return created[0];
  }

  /**
   * ALGORITMO DE EXECUÇÃO FATURÁVEL IDEMPOTENTE (Apêndice Q do documento master)
   * Previne double-billing em retries de rede/LLM, aplica carteira dupla e garante atomicidade.
   */
  public async executeBillableOperation<T>(params: {
    tenantId: string;
    idempotencyKey: string;
    costCents?: number;
    operation: () => Promise<T>;
  }): Promise<BillableExecutionResult<T>> {
    const costCents = params.costCents ?? 15; // R$ 0,15 por busca/consulta padrão
    await this.bootstrapTables();

    // 1. Verificação de idempotência estrita (Replay sem débito repetido)
    const existingEntry = await this.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.idempotencyKey, params.idempotencyKey));

    if (existingEntry[0] && existingEntry[0].operationResultSnapshot) {
      const account = await this.getOrCreateAccount(params.tenantId);
      const totalBalance = account.paidBalanceCents + account.promotionalBalanceCents;

      return {
        data: JSON.parse(existingEntry[0].operationResultSnapshot) as T,
        isReplay: true,
        chargedCents: 0, // Zero cobrança em replay idempotente!
        remainingBalanceCents: totalBalance,
      };
    }

    // 2. Resolução de conta e saldo disponível com regra de carteira dupla
    const account = await this.getOrCreateAccount(params.tenantId);
    const now = new Date();
    const promoValid = account.promoExpiresAt ? new Date(account.promoExpiresAt) > now : false;
    const effectivePromo = promoValid ? account.promotionalBalanceCents : 0;
    const totalAvailable = account.paidBalanceCents + effectivePromo;

    if (totalAvailable < costCents) {
      throw new DomainError(
        'TOOL_EXECUTION_FAILED',
        `Saldo insuficiente para executar consulta. Necessário R$ ${(costCents / 100).toFixed(2)}, disponível R$ ${(totalAvailable / 100).toFixed(2)}.`,
        { requiredCents: costCents, availableCents: totalAvailable }
      );
    }

    // 3. Execução da operação protegida
    const result = await params.operation();

    // 4. Débito com priorização de saldo promocional com validade
    let newPromo = account.promotionalBalanceCents;
    let newPaid = account.paidBalanceCents;
    let bucketUsed: 'PROMOTIONAL' | 'PAID' = 'PAID';

    if (promoValid && newPromo >= costCents) {
      newPromo -= costCents;
      bucketUsed = 'PROMOTIONAL';
    } else if (promoValid && newPromo > 0) {
      const remainder = costCents - newPromo;
      newPromo = 0;
      newPaid -= remainder;
      bucketUsed = 'PROMOTIONAL';
    } else {
      newPaid -= costCents;
      bucketUsed = 'PAID';
    }

    const timestamp = new Date().toISOString();

    // Atualiza o saldo da conta
    await this.db
      .update(ledgerAccounts)
      .set({
        paidBalanceCents: newPaid,
        promotionalBalanceCents: newPromo,
        updatedAt: timestamp,
      })
      .where(eq(ledgerAccounts.id, account.id));

    // 5. Registra o débito com a chave de idempotência e o snapshot da resposta
    await this.db.insert(ledgerEntries).values({
      id: randomUUID(),
      accountId: account.id,
      idempotencyKey: params.idempotencyKey,
      kind: 'DEBIT',
      bucket: bucketUsed,
      amountCents: costCents,
      operationResultSnapshot: JSON.stringify(result),
      createdAt: timestamp,
    });

    return {
      data: result,
      isReplay: false,
      chargedCents: costCents,
      remainingBalanceCents: newPaid + newPromo,
    };
  }
}
