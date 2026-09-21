import { randomUUID } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { Client } from '@libsql/client';
import { and, eq } from 'drizzle-orm';
import type { UsageEvent } from '@forgelex/domain';
import { DomainError } from '@forgelex/domain';
import type { ForgeLexDatabase } from '@forgelex/persistence';
import { billingOperations, ledgerAccounts, ledgerEntries, usageEvents } from './schema/ledger-schema.js';
import { runLedgerMigrations } from './migrations/ledger-migrations.js';
import type { ForgeLexBillingPolicy } from './billing-rules.js';

export interface BillableExecutionResult<T> {
  data: T;
  billingMode: 'METERED';
  isReplay: boolean;
  chargedCents: number;
  remainingBalanceCents: number;
}

export interface OperationExecutionResult<T> {
  data: T;
  billingMode: ForgeLexBillingPolicy['mode'];
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
  private static readonly RESERVATION_LEASE_MS = 30_000;
  private static readonly MAX_SNAPSHOT_BYTES = 8_388_608;
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

  public async executeOperation<T>(params: {
    tenantId: string;
    idempotencyKey: string;
    billing: ForgeLexBillingPolicy;
    userId?: string;
    sessionId?: string;
    usage?: BillableUsageInput;
    operation: () => Promise<T>;
  }): Promise<OperationExecutionResult<T>> {
    if (params.billing.mode === 'METERED') {
      const execution = await this.executeBillableOperation({
        tenantId: params.tenantId,
        idempotencyKey: params.idempotencyKey,
        costCents: params.billing.costCents,
        userId: params.userId,
        sessionId: params.sessionId,
        usage: params.usage,
        operation: params.operation,
      });
      return execution;
    }

    if (!params.idempotencyKey.trim()) {
      throw new DomainError('INVALID_CANONICAL_STATE', 'A chave de idempotência é obrigatória.');
    }
    await this.runMigrations();
    const accountRows = await this.db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, params.tenantId));
    const account = accountRows[0];
    if (!account) {
      throw new DomainError(
        'BILLING_ACCOUNT_NOT_PROVISIONED',
        `A carteira do tenant '${params.tenantId}' não foi provisionada.`,
        { tenantId: params.tenantId },
      );
    }

    return {
      data: await params.operation(),
      billingMode: 'FREE',
      isReplay: false,
      chargedCents: 0,
      remainingBalanceCents: this.availableBalance(account),
    };
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

  public async getAvailableBalanceCents(tenantId: string): Promise<number> {
    await this.runMigrations();
    const accountRows = await this.db
      .select()
      .from(ledgerAccounts)
      .where(eq(ledgerAccounts.tenantId, tenantId));
    const account = accountRows[0];
    if (!account) {
      throw new DomainError(
        'BILLING_ACCOUNT_NOT_PROVISIONED',
        `A carteira do tenant '${tenantId}' não foi provisionada.`,
        { tenantId },
      );
    }
    return this.availableBalance(account);
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

  public async executeBillableOperation<T>(params: {
    tenantId: string;
    idempotencyKey: string;
    costCents: number;
    userId?: string;
    sessionId?: string;
    usage?: BillableUsageInput;
    operation: () => Promise<T>;
  }): Promise<BillableExecutionResult<T>> {
    const costCents = params.costCents;
    this.validateBillableInput(params.idempotencyKey, costCents);
    await this.runMigrations();

    const reservation = await this.withTenantLock(params.tenantId, async () => {
      const leaseOwner = randomUUID();
      return this.db.transaction(async (transaction) => {
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

        await transaction.update(ledgerAccounts).set({ updatedAt: account.updatedAt }).where(eq(ledgerAccounts.id, account.id));
        const lockedRows = await transaction.select().from(ledgerAccounts).where(eq(ledgerAccounts.id, account.id));
        const lockedAccount = lockedRows[0];
        if (!lockedAccount) throw new DomainError('TOOL_EXECUTION_FAILED', 'A carteira desapareceu durante a reserva.');

        const existingOperations = await transaction
          .select()
          .from(billingOperations)
          .where(
            and(
              eq(billingOperations.tenantId, params.tenantId),
              eq(billingOperations.idempotencyKey, params.idempotencyKey),
            )
          );
        const existing = existingOperations[0];
        if (existing && existing.reservedAmountCents !== costCents) {
          throw new DomainError('IDEMPOTENCY_CONFLICT', 'A chave de idempotência já foi usada com outro custo.');
        }
        if (existing?.status === 'COMPLETED') {
          if (!existing.resultSnapshot) throw new DomainError('IDEMPOTENCY_RESULT_EXPIRED', 'O resultado idempotente expirou.');
          return { kind: 'replay' as const, account: lockedAccount, snapshot: existing.resultSnapshot };
        }

        const now = new Date();
        const nowIso = now.toISOString();
        if (existing?.status === 'PENDING' && existing.leaseExpiresAt && existing.leaseExpiresAt > nowIso) {
          return { kind: 'wait' as const, id: existing.id, account: lockedAccount };
        }

        const pending = await transaction
          .select()
          .from(billingOperations)
          .where(and(eq(billingOperations.accountId, lockedAccount.id), eq(billingOperations.status, 'PENDING')));
        const reservedCents = pending
          .filter((item) => item.id !== existing?.id && Boolean(item.leaseExpiresAt && item.leaseExpiresAt > nowIso))
          .reduce((total, item) => total + item.reservedAmountCents, 0);

        const promoValid = this.isPromotionValid(lockedAccount.promoExpiresAt);
        const effectivePromo = promoValid ? lockedAccount.promotionalBalanceCents : 0;
        const totalAvailable = lockedAccount.paidBalanceCents + effectivePromo - reservedCents;

        if (totalAvailable < costCents) {
          throw new DomainError(
            'TOOL_EXECUTION_FAILED',
            `Saldo insuficiente para executar consulta. Necessário R$ ${(costCents / 100).toFixed(2)}, disponível R$ ${(totalAvailable / 100).toFixed(2)}.`,
            { requiredCents: costCents, availableCents: totalAvailable }
          );
        }

        const leaseExpiresAt = new Date(now.getTime() + LedgerService.RESERVATION_LEASE_MS).toISOString();
        if (existing) {
          await transaction.update(billingOperations).set({
            status: 'PENDING', leaseOwner, leaseExpiresAt, errorCode: null, updatedAt: nowIso,
          }).where(eq(billingOperations.id, existing.id));
          return { kind: 'execute' as const, id: existing.id, leaseOwner };
        }
        const id = randomUUID();
        await transaction.insert(billingOperations).values({
          id, tenantId: params.tenantId, accountId: lockedAccount.id,
          idempotencyKey: params.idempotencyKey, status: 'PENDING', reservedAmountCents: costCents,
          leaseOwner, leaseExpiresAt, resultSnapshot: null, errorCode: null,
          createdAt: nowIso, updatedAt: nowIso,
        });
        return { kind: 'execute' as const, id, leaseOwner };
      });
    });

    if (reservation.kind === 'replay') return this.createReplayResult<T>(reservation.snapshot, reservation.account);
    if (reservation.kind === 'wait') return this.waitForReservation<T>(reservation.id);

    try {
      const result = await params.operation();
      const snapshot = this.serializeSnapshot(result);
      return await this.withTenantLock(params.tenantId, () =>
        this.completeReservation(reservation.id, reservation.leaseOwner, params, result, snapshot, costCents));
    } catch (error) {
      await this.withTenantLock(params.tenantId, () => this.failReservation(reservation.id, reservation.leaseOwner, error));
      throw error;
    }
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

    let data: T;
    try {
      const serialized = operationResultSnapshot.startsWith('gzip:')
        ? gunzipSync(Buffer.from(operationResultSnapshot.slice(5), 'base64')).toString('utf8')
        : operationResultSnapshot;
      data = JSON.parse(serialized) as T;
    } catch {
      throw new DomainError('IDEMPOTENCY_RESULT_INVALID', 'O resultado idempotente persistido está corrompido.');
    }

    return {
      data,
      billingMode: 'METERED',
      isReplay: true,
      chargedCents: 0,
      remainingBalanceCents: account.paidBalanceCents + effectivePromo,
    };
  }

  private serializeSnapshot<T>(result: T): string {
    const raw = JSON.stringify(result);
    const compressed = `gzip:${gzipSync(raw).toString('base64')}`;
    const snapshot = Buffer.byteLength(compressed, 'utf8') < Buffer.byteLength(raw, 'utf8') ? compressed : raw;
    if (Buffer.byteLength(snapshot, 'utf8') > LedgerService.MAX_SNAPSHOT_BYTES) {
      throw new DomainError('OPERATION_RESULT_TOO_LARGE', 'Resultado excede o limite de replay.');
    }
    return snapshot;
  }

  private async waitForReservation<T>(operationId: string): Promise<BillableExecutionResult<T>> {
    for (;;) {
      const operations = await this.db
        .select()
        .from(billingOperations)
        .where(eq(billingOperations.id, operationId));
      const operation = operations[0];
      if (!operation) {
        throw new DomainError('TOOL_EXECUTION_FAILED', 'A reserva faturável deixou de existir.');
      }

      if (operation.status === 'COMPLETED') {
        if (!operation.resultSnapshot) {
          throw new DomainError('IDEMPOTENCY_RESULT_EXPIRED', 'O resultado idempotente expirou.');
        }
        const accounts = await this.db
          .select()
          .from(ledgerAccounts)
          .where(eq(ledgerAccounts.id, operation.accountId));
        if (!accounts[0]) {
          throw new DomainError('BILLING_ACCOUNT_NOT_PROVISIONED', 'A carteira da reserva não existe.');
        }
        return this.createReplayResult<T>(operation.resultSnapshot, accounts[0]);
      }

      if (operation.status === 'FAILED') {
        throw new DomainError(
          'TOOL_EXECUTION_FAILED',
          'A execução faturável concorrente falhou.',
          { operationId, upstreamCode: operation.errorCode },
        );
      }

      if (!operation.leaseExpiresAt || operation.leaseExpiresAt <= new Date().toISOString()) {
        throw new DomainError('OPERATION_LEASE_EXPIRED', 'A reserva faturável expirou e pode ser retomada.');
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  private async completeReservation<T>(
    operationId: string,
    leaseOwner: string,
    params: {
      tenantId: string;
      idempotencyKey: string;
      userId?: string;
      sessionId?: string;
      usage?: BillableUsageInput;
    },
    result: T,
    snapshot: string,
    costCents: number,
  ): Promise<BillableExecutionResult<T>> {
    return this.db.transaction(async (transaction) => {
      const operationRows = await transaction
        .select()
        .from(billingOperations)
        .where(eq(billingOperations.id, operationId));
      const operation = operationRows[0];
      if (!operation) throw new DomainError('TOOL_EXECUTION_FAILED', 'A reserva faturável deixou de existir.');

      const accountRows = await transaction
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, operation.accountId));
      const account = accountRows[0];
      if (!account) throw new DomainError('BILLING_ACCOUNT_NOT_PROVISIONED', 'A carteira da reserva não existe.');

      await transaction
        .update(ledgerAccounts)
        .set({ updatedAt: account.updatedAt })
        .where(eq(ledgerAccounts.id, account.id));
      const lockedRows = await transaction
        .select()
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, account.id));
      const lockedAccount = lockedRows[0];
      if (!lockedAccount) throw new DomainError('TOOL_EXECUTION_FAILED', 'A carteira desapareceu durante a liquidação.');

      const currentRows = await transaction
        .select()
        .from(billingOperations)
        .where(eq(billingOperations.id, operationId));
      const current = currentRows[0];
      if (current?.status === 'COMPLETED') {
        if (!current.resultSnapshot) throw new DomainError('IDEMPOTENCY_RESULT_EXPIRED', 'O resultado idempotente expirou.');
        return this.createReplayResult<T>(current.resultSnapshot, lockedAccount);
      }
      if (!current || current.status !== 'PENDING' || current.leaseOwner !== leaseOwner) {
        throw new DomainError('OPERATION_LEASE_EXPIRED', 'A reserva faturável foi assumida por outra execução.');
      }

      const promoValid = this.isPromotionValid(lockedAccount.promoExpiresAt);
      const effectivePromo = promoValid ? lockedAccount.promotionalBalanceCents : 0;
      if (lockedAccount.paidBalanceCents + effectivePromo < costCents) {
        throw new DomainError('TOOL_EXECUTION_FAILED', 'Saldo insuficiente durante a liquidação da reserva.');
      }
      const settlement = this.calculateSettlement(lockedAccount, effectivePromo, costCents, promoValid);
      const timestamp = new Date().toISOString();
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
        operationResultSnapshot: snapshot,
        createdAt: timestamp,
      });
      await transaction.update(ledgerAccounts).set({
        paidBalanceCents: settlement.paidBalanceCents,
        promotionalBalanceCents: settlement.promotionalBalanceCents,
        updatedAt: timestamp,
      }).where(eq(ledgerAccounts.id, lockedAccount.id));
      await transaction.update(billingOperations).set({
        status: 'COMPLETED',
        leaseOwner: null,
        leaseExpiresAt: null,
        resultSnapshot: snapshot,
        errorCode: null,
        updatedAt: timestamp,
      }).where(and(eq(billingOperations.id, operationId), eq(billingOperations.leaseOwner, leaseOwner)));

      return {
        data: result,
        billingMode: 'METERED',
        isReplay: false,
        chargedCents: costCents,
        remainingBalanceCents: settlement.paidBalanceCents + settlement.promotionalBalanceCents,
      };
    });
  }

  private async failReservation(operationId: string, leaseOwner: string, error: unknown): Promise<void> {
    const errorCode = error instanceof DomainError ? error.code : 'TOOL_EXECUTION_FAILED';
    await this.db.update(billingOperations).set({
      status: 'FAILED',
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode,
      updatedAt: new Date().toISOString(),
    }).where(and(
      eq(billingOperations.id, operationId),
      eq(billingOperations.status, 'PENDING'),
      eq(billingOperations.leaseOwner, leaseOwner),
    ));
  }

  private availableBalance(account: typeof ledgerAccounts.$inferSelect): number {
    const effectivePromo = this.isPromotionValid(account.promoExpiresAt)
      ? account.promotionalBalanceCents
      : 0;
    return account.paidBalanceCents + effectivePromo;
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
