import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { and, eq } from 'drizzle-orm';
import type { UsageEvent } from '@forgelex/domain';
import { DomainError } from '@forgelex/domain';
import type { ForgeLexDatabase } from '@forgelex/persistence';
import { ledgerAccounts, ledgerEntries, usageEvents } from './schema/ledger-schema.js';
import { runLedgerMigrations } from './migrations/ledger-migrations.js';

export interface BillableExecutionResult<T> {
  data: T;
  isReplay: boolean;
  chargedCents: number;
  remainingBalanceCents: number;
}

export interface BillingAccountProvisioning {
  paidBalanceCents: number;
  promotionalBalanceCents: number;
  promoExpiresAt?: string | null;
}

export interface BillingAccountProvisioningPolicy {
  getInitialProvision(tenantId: string): BillingAccountProvisioning;
}

export const zeroBalanceProvisioningPolicy: BillingAccountProvisioningPolicy = {
  getInitialProvision: () => ({
    paidBalanceCents: 0,
    promotionalBalanceCents: 0,
    promoExpiresAt: null,
  }),
};

export interface BillableUsageInput {
  capability?: string;
  toolName?: string;
  provider?: string;
  model?: string;
  units?: number;
  legalCredits?: number;
  monetaryCostCents?: number;
  requestId?: string;
  sessionId?: string;
  userId?: string;
}

export interface LedgerServiceOptions {
  provisioningPolicy?: BillingAccountProvisioningPolicy;
}

export class LedgerService {
  private readonly db: ForgeLexDatabase;
  private readonly client?: Client;
  private readonly provisioningPolicy: BillingAccountProvisioningPolicy;
  private readonly tenantLocks = new Map<string, Promise<void>>();

  public constructor(db: ForgeLexDatabase, client?: Client, options: LedgerServiceOptions = {}) {
    this.db = db;
    this.client = client;
    this.provisioningPolicy = options.provisioningPolicy ?? zeroBalanceProvisioningPolicy;
  }

  public async runMigrations(): Promise<void> {
    await runLedgerMigrations(this.getClient());
  }

  /**
   * Mantém o método histórico como alias compatível durante a migração para
   * migrations formais.
   */
  public async bootstrapTables(): Promise<void> {
    await this.runMigrations();
  }

  public async provisionAccount(
    tenantId: string,
    requestedProvision?: BillingAccountProvisioning
  ): Promise<typeof ledgerAccounts.$inferSelect> {
    const provision = requestedProvision ?? this.provisioningPolicy.getInitialProvision(tenantId);
    this.validateProvisioning(provision);
    await this.runMigrations();

    const existing = await this.db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, tenantId));

    if (existing[0]) {
      return existing[0];
    }

    const now = new Date().toISOString();
    await this.db
      .insert(ledgerAccounts)
      .values({
        id: randomUUID(),
        tenantId,
        paidBalanceCents: provision.paidBalanceCents,
        promotionalBalanceCents: provision.promotionalBalanceCents,
        promoExpiresAt: provision.promoExpiresAt ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: ledgerAccounts.tenantId });

    const created = await this.db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, tenantId));

    if (!created[0]) {
      throw new DomainError(
        'TOOL_EXECUTION_FAILED',
        `Não foi possível provisionar a carteira do tenant '${tenantId}'.`
      );
    }

    return created[0];
  }

  /**
   * Compatibilidade com a API inicial. A ausência de valores agora significa
   * provisionamento pela política explícita, cujo padrão tem saldo zero.
   */
  public async getOrCreateAccount(
    tenantId: string,
    initialPaidCents?: number,
    initialPromoCents?: number
  ): Promise<typeof ledgerAccounts.$inferSelect> {
    if (initialPaidCents === undefined && initialPromoCents === undefined) {
      return this.provisionAccount(tenantId);
    }

    const promotionalBalanceCents = initialPromoCents ?? 0;
    return this.provisionAccount(tenantId, {
      paidBalanceCents: initialPaidCents ?? 0,
      promotionalBalanceCents,
      promoExpiresAt:
        promotionalBalanceCents > 0
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null,
    });
  }

  /**
   * Executa e liquida uma operação dentro da mesma transação.
   *
   * O lock lógico local reduz contenção entre chamadas no mesmo processo. A
   * atualização de lock do account dentro da transação força a aquisição de
   * lock de escrita no SQLite e de row lock no PostgreSQL, quando o driver
   * correspondente estiver conectado à mesma camada de persistência.
   */
  public async executeBillableOperation<T>(params: {
    tenantId: string;
    idempotencyKey: string;
    costCents?: number;
    userId?: string;
    sessionId?: string;
    usage?: BillableUsageInput;
    operation: () => Promise<T>;
  }): Promise<BillableExecutionResult<T>> {
    const costCents = params.costCents ?? 15;
    this.validateBillableInput(params.idempotencyKey, costCents);
    await this.runMigrations();

    return this.withTenantLock(params.tenantId, async () =>
      this.db.transaction(async (transaction) => {
        const accountRows = await transaction
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.tenantId, params.tenantId));
        const account = accountRows[0];

        if (!account) {
          throw new DomainError(
            'BILLING_ACCOUNT_NOT_PROVISIONED',
            `A carteira do tenant '${params.tenantId}' não foi provisionada.`,
            { tenantId: params.tenantId }
          );
        }

        const existingEntry = await transaction
          .select()
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.accountId, account.id),
              eq(ledgerEntries.idempotencyKey, params.idempotencyKey)
            )
          );

        if (existingEntry[0]?.operationResultSnapshot) {
          return this.createReplayResult<T>(existingEntry[0].operationResultSnapshot, account);
        }

        // O update é intencionalmente executado antes da operação externa:
        // ele serializa o acesso à carteira dentro da transação aberta.
        await transaction
          .update(ledgerAccounts)
          .set({ updatedAt: account.updatedAt })
          .where(eq(ledgerAccounts.id, account.id));

        const lockedAccountRows = await transaction
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.id, account.id));
        const lockedAccount = lockedAccountRows[0];

        if (!lockedAccount) {
          throw new DomainError('TOOL_EXECUTION_FAILED', 'A carteira desapareceu durante a liquidação.');
        }

        const entryAfterLock = await transaction
          .select()
          .from(ledgerEntries)
          .where(
            and(
              eq(ledgerEntries.accountId, lockedAccount.id),
              eq(ledgerEntries.idempotencyKey, params.idempotencyKey)
            )
          );

        if (entryAfterLock[0]?.operationResultSnapshot) {
          return this.createReplayResult<T>(entryAfterLock[0].operationResultSnapshot, lockedAccount);
        }

        const promoValid = this.isPromotionValid(lockedAccount.promoExpiresAt);
        const effectivePromo = promoValid ? lockedAccount.promotionalBalanceCents : 0;
        const totalAvailable = lockedAccount.paidBalanceCents + effectivePromo;

        if (totalAvailable < costCents) {
          throw new DomainError(
            'TOOL_EXECUTION_FAILED',
            `Saldo insuficiente para executar consulta. Necessário R$ ${(costCents / 100).toFixed(2)}, disponível R$ ${(totalAvailable / 100).toFixed(2)}.`,
            { requiredCents: costCents, availableCents: totalAvailable }
          );
        }

        // A operação permanece dentro da fronteira transacional. Qualquer
        // erro antes do commit desfaz reserva, débito, usage e snapshot.
        const result = await params.operation();
        const settlement = this.calculateSettlement(lockedAccount, effectivePromo, costCents, promoValid);
        const timestamp = new Date().toISOString();

        await transaction
          .update(ledgerAccounts)
          .set({
            paidBalanceCents: settlement.paidBalanceCents,
            promotionalBalanceCents: settlement.promotionalBalanceCents,
            updatedAt: timestamp,
          })
          .where(eq(ledgerAccounts.id, lockedAccount.id));

        const usageEvent = this.createUsageEvent(params, costCents, timestamp);
        await transaction.insert(usageEvents).values({
          id: usageEvent.id,
          tenantId: usageEvent.tenantId,
          userId: usageEvent.userId,
          capability: usageEvent.capability,
          toolName: usageEvent.toolName,
          provider: usageEvent.provider,
          model: usageEvent.model,
          units: usageEvent.units,
          legalCredits: usageEvent.legalCredits,
          monetaryCostCents: usageEvent.monetaryCostCents,
          requestId: usageEvent.requestId,
          sessionId: usageEvent.sessionId,
          occurredAt: usageEvent.timestamp,
        });

        await transaction.insert(ledgerEntries).values({
          id: randomUUID(),
          accountId: lockedAccount.id,
          usageEventId: usageEvent.id,
          idempotencyKey: params.idempotencyKey,
          kind: 'DEBIT',
          bucket: settlement.bucket,
          amountCents: costCents,
          operationResultSnapshot: JSON.stringify(result),
          createdAt: timestamp,
        });

        return {
          data: result,
          isReplay: false,
          chargedCents: costCents,
          remainingBalanceCents: settlement.paidBalanceCents + settlement.promotionalBalanceCents,
        };
      })
    );
  }

  public async getUsageEvents(tenantId: string): Promise<typeof usageEvents.$inferSelect[]> {
    await this.runMigrations();
    return this.db.select().from(usageEvents).where(eq(usageEvents.tenantId, tenantId));
  }

  private getClient(): Client {
    const databaseWithClient = this.db as unknown as { $client?: Client };
    const client = this.client ?? databaseWithClient.$client;
    if (!client) {
      throw new DomainError('TOOL_EXECUTION_FAILED', 'Cliente de persistência não disponível para migrations.');
    }

    return client;
  }

  private validateProvisioning(provision: BillingAccountProvisioning): void {
    if (
      !Number.isInteger(provision.paidBalanceCents) ||
      provision.paidBalanceCents < 0 ||
      !Number.isInteger(provision.promotionalBalanceCents) ||
      provision.promotionalBalanceCents < 0
    ) {
      throw new DomainError('INVALID_CANONICAL_STATE', 'Saldo inicial deve ser inteiro não negativo.');
    }
  }

  private validateBillableInput(idempotencyKey: string, costCents: number): void {
    if (!idempotencyKey.trim()) {
      throw new DomainError('INVALID_CANONICAL_STATE', 'A chave de idempotência é obrigatória.');
    }

    if (!Number.isInteger(costCents) || costCents <= 0) {
      throw new DomainError('INVALID_CANONICAL_STATE', 'O custo da operação deve ser inteiro positivo.');
    }
  }

  private isPromotionValid(promoExpiresAt: string | null): boolean {
    return promoExpiresAt !== null && new Date(promoExpiresAt).getTime() > Date.now();
  }

  private calculateSettlement(
    account: typeof ledgerAccounts.$inferSelect,
    effectivePromo: number,
    costCents: number,
    promoValid: boolean
  ): {
    paidBalanceCents: number;
    promotionalBalanceCents: number;
    bucket: 'PAID' | 'PROMOTIONAL';
  } {
    let promotionalBalanceCents = promoValid ? effectivePromo : 0;
    let paidBalanceCents = account.paidBalanceCents;
    let bucket: 'PAID' | 'PROMOTIONAL' = 'PAID';

    if (promotionalBalanceCents >= costCents) {
      promotionalBalanceCents -= costCents;
      bucket = 'PROMOTIONAL';
    } else if (promotionalBalanceCents > 0) {
      paidBalanceCents -= costCents - promotionalBalanceCents;
      promotionalBalanceCents = 0;
      bucket = 'PROMOTIONAL';
    } else {
      paidBalanceCents -= costCents;
    }

    return { paidBalanceCents, promotionalBalanceCents, bucket };
  }

  private createReplayResult<T>(
    operationResultSnapshot: string,
    account: typeof ledgerAccounts.$inferSelect
  ): BillableExecutionResult<T> {
    const effectivePromo = this.isPromotionValid(account.promoExpiresAt)
      ? account.promotionalBalanceCents
      : 0;

    return {
      data: JSON.parse(operationResultSnapshot) as T,
      isReplay: true,
      chargedCents: 0,
      remainingBalanceCents: account.paidBalanceCents + effectivePromo,
    };
  }

  private createUsageEvent(
    params: {
      tenantId: string;
      idempotencyKey: string;
      userId?: string;
      sessionId?: string;
      usage?: BillableUsageInput;
    },
    costCents: number,
    timestamp: string
  ): UsageEvent {
    const usage = params.usage ?? {};
    const units = usage.units ?? 1;
    if (!Number.isInteger(units) || units <= 0) {
      throw new DomainError('INVALID_CANONICAL_STATE', 'As unidades de uso devem ser inteiras e positivas.');
    }

    return {
      id: randomUUID(),
      tenantId: params.tenantId,
      userId: usage.userId ?? params.userId,
      capability: usage.capability ?? 'billing.billable_operation',
      toolName: usage.toolName,
      provider: usage.provider,
      model: usage.model,
      units,
      legalCredits: usage.legalCredits ?? units,
      monetaryCostCents: usage.monetaryCostCents ?? costCents,
      requestId: usage.requestId ?? params.idempotencyKey,
      sessionId: usage.sessionId ?? params.sessionId,
      timestamp,
    };
  }

  private async withTenantLock<T>(tenantId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tenantLocks.get(tenantId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(() => current);
    this.tenantLocks.set(tenantId, chain);

    await previous;
    try {
      return await task();
    } finally {
      release();
      if (this.tenantLocks.get(tenantId) === chain) {
        this.tenantLocks.delete(tenantId);
      }
    }
  }
}
