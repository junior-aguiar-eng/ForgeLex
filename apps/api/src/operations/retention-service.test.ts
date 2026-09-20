import { describe, expect, it } from 'vitest';
import { createDatabase, ResearchHistoryRepository, runPersistenceMigrations } from '@forgelex/persistence';
import { billingOperations, ledgerAccounts, ledgerEntries, LedgerService } from '@forgelex/billing-ledger';
import { OperationalRetentionService, resolveRetentionPolicy } from './retention-service.js';

describe('OperationalRetentionService', () => {
  it('expurga somente dados operacionais anteriores ao cutoff exato', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const ledger = new LedgerService(connection.db, connection.client);
    await ledger.runMigrations();
    const history = new ResearchHistoryRepository(connection.db);
    const now = new Date('2026-09-20T12:00:00.000Z');
    const old = '2026-06-21T11:59:59.999Z';
    const cutoff = '2026-06-22T12:00:00.000Z';
    await history.record({ tenantId: 'tenant', userId: 'user', operationId: 'old', query: 'antiga', court: 'STJ', resultCount: 1, billingMode: 'METERED', chargedCents: 20, createdAt: old });
    await history.record({ tenantId: 'tenant', userId: 'user', operationId: 'cutoff', query: 'limite', court: 'STJ', resultCount: 0, billingMode: 'FREE', chargedCents: 0, createdAt: cutoff });
    await connection.db.insert(ledgerAccounts).values({ id: 'account', tenantId: 'tenant', paidBalanceCents: 100, promotionalBalanceCents: 0, promoExpiresAt: null, createdAt: old, updatedAt: old });
    await connection.db.insert(billingOperations).values({ id: 'operation', tenantId: 'tenant', accountId: 'account', idempotencyKey: 'expired', status: 'COMPLETED', reservedAmountCents: 20, leaseOwner: null, leaseExpiresAt: null, resultSnapshot: '{"ok":true}', errorCode: null, createdAt: old, updatedAt: old });
    await connection.db.insert(ledgerEntries).values({ id: 'entry', accountId: 'account', usageEventId: null, idempotencyKey: 'expired', kind: 'DEBIT', bucket: 'PAID', amountCents: 20, operationResultSnapshot: '{"ok":true}', createdAt: old });

    const result = await new OperationalRetentionService(connection.client, 90).purge(now);

    expect(result).toMatchObject({ history: 1, snapshots: 2 });
    expect(await history.list('tenant', 'user')).toHaveLength(1);
    expect((await connection.db.select().from(ledgerEntries))[0]).toMatchObject({ amountCents: 20, operationResultSnapshot: null });
    await expect(ledger.executeBillableOperation({ tenantId: 'tenant', idempotencyKey: 'expired', costCents: 20, operation: async () => ({ reexecuted: true }) })).rejects.toMatchObject({ code: 'IDEMPOTENCY_RESULT_EXPIRED' });
    expect((await connection.db.select().from(ledgerAccounts))[0].paidBalanceCents).toBe(100);
    connection.client.close();
  });

  it('só habilita o worker explicitamente e valida dias entre 1 e 3650', () => {
    expect(resolveRetentionPolicy({ FORGELEX_RETENTION_WORKER_ENABLED: 'false', FORGELEX_OPERATION_RETENTION_DAYS: '0' })).toEqual({ enabled: false, retentionDays: 90 });
    expect(resolveRetentionPolicy({ FORGELEX_RETENTION_WORKER_ENABLED: 'true', FORGELEX_OPERATION_RETENTION_DAYS: '3650' })).toEqual({ enabled: true, retentionDays: 3650 });
    expect(() => resolveRetentionPolicy({ FORGELEX_RETENTION_WORKER_ENABLED: 'true', FORGELEX_OPERATION_RETENTION_DAYS: '0' })).toThrow('FORGELEX_OPERATION_RETENTION_DAYS_INVALID');
  });
});
