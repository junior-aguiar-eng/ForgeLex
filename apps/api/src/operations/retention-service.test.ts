import { describe, expect, it } from 'vitest';
import {
  AccountClosureRepository,
  createDatabase,
  ResearchHistoryRepository,
  runPersistenceMigrations,
} from '@forgelex/persistence';
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
    await connection.client.batch([
      {
        sql: `INSERT INTO billing_webhook_events
          (id, provider, event_type, payload, status, received_at, error_message)
          VALUES ('legacy_old', 'provider', 'payment', '{"query":"sigilosa"}', 'PROCESSED', ?, 'erro sensível')`,
        args: [old],
      },
      {
        sql: `INSERT INTO billing_webhook_events
          (id, provider, event_type, payload, status, received_at)
          VALUES ('legacy_recent', 'provider', 'payment', '{"status":"paid"}', 'PROCESSED', ?)`,
        args: [cutoff],
      },
    ], 'write');

    const result = await new OperationalRetentionService(connection.client, 90).purge(now);

    expect(result).toMatchObject({ history: 1, snapshots: 2, financialWebhookBodies: 1 });
    const webhookRows = await connection.client.execute(
      'SELECT id, payload, error_message FROM billing_webhook_events ORDER BY id',
    );
    expect(webhookRows.rows[0]).toMatchObject({ id: 'legacy_old', payload: '{}', error_message: null });
    expect(webhookRows.rows[1]).toMatchObject({ id: 'legacy_recent', payload: '{"status":"paid"}' });
    expect(await history.list('tenant', 'user')).toHaveLength(1);
    expect((await connection.db.select().from(ledgerEntries))[0]).toMatchObject({ amountCents: 20, operationResultSnapshot: null });
    await expect(ledger.executeBillableOperation({ tenantId: 'tenant', idempotencyKey: 'expired', costCents: 20, operation: async () => ({ reexecuted: true }) })).rejects.toMatchObject({ code: 'IDEMPOTENCY_RESULT_EXPIRED' });
    expect((await connection.db.select().from(ledgerAccounts))[0].paidBalanceCents).toBe(100);
    connection.client.close();
  });

  it('só habilita o worker explicitamente e valida dias entre 1 e 3650', () => {
    expect(resolveRetentionPolicy({ FORGELEX_RETENTION_WORKER_ENABLED: 'false', FORGELEX_OPERATION_RETENTION_DAYS: '0' })).toEqual({ enabled: false, operationalDays: 90, accessLogDays: 180, closureReceiptDays: 1827 });
    expect(resolveRetentionPolicy({ FORGELEX_RETENTION_WORKER_ENABLED: 'true', FORGELEX_OPERATION_RETENTION_DAYS: '3650' })).toEqual({ enabled: true, operationalDays: 3650, accessLogDays: 180, closureReceiptDays: 1827 });
    expect(() => resolveRetentionPolicy({ FORGELEX_RETENTION_WORKER_ENABLED: 'true', FORGELEX_OPERATION_RETENTION_DAYS: '0' })).toThrow('FORGELEX_OPERATION_RETENTION_DAYS_INVALID');
  });

  it('limita payload de webhook a 90 dias mesmo com janela operacional maior', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    await new LedgerService(connection.db, connection.client).runMigrations();
    await connection.client.execute({
      sql: `INSERT INTO billing_webhook_events
        (id, provider, event_type, payload, status, received_at)
        VALUES ('legacy_overdue', 'provider', 'payment', '{"query":"sigilosa"}',
          'PROCESSED', '2026-06-21T11:59:59.999Z')`,
      args: [],
    });

    await new OperationalRetentionService(connection.client, 3650)
      .purge(new Date('2026-09-20T12:00:00.000Z'));

    expect((await connection.client.execute(
      "SELECT payload FROM billing_webhook_events WHERE id = 'legacy_overdue'",
    )).rows[0]?.payload).toBe('{}');
    connection.client.close();
  });

  it('expurga auditoria em 180 dias e recibos em 1827 dias, salvo exceção ativa', async () => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    await new LedgerService(connection.db, connection.client).runMigrations();
    const repository = new AccountClosureRepository(connection.client);
    const now = new Date('2026-09-22T12:00:00.000Z');
    const oldAudit = '2026-03-26T11:59:59.999Z';
    const oldClosure = '2021-09-21T11:59:59.999Z';
    for (const suffix of ['purge', 'held'] as const) {
      await repository.create({
        id: `acl_${suffix}`,
        subjectId: `subject_${suffix}`,
        userId: `user_${suffix}`,
        tenantId: `tenant_${suffix}`,
        subjectHash: suffix.repeat(64).slice(0, 64),
        userHash: `u${suffix}`.repeat(64).slice(0, 64),
        tenantHash: `t${suffix}`.repeat(64).slice(0, 64),
        statusTokenHash: `k${suffix}`.repeat(64).slice(0, 64),
        idempotencyKeyHash: `i${suffix}`.repeat(64).slice(0, 64),
        requestFingerprint: `f${suffix}`.repeat(64).slice(0, 64),
        policyVersion: '2026-09-22.v1',
        requestedAt: oldClosure,
      });
      await connection.client.execute({
        sql: `UPDATE account_closures
          SET status = 'COMPLETED', completed_at = ?, updated_at = ? WHERE id = ?`,
        args: [oldClosure, oldClosure, `acl_${suffix}`],
      });
    }
    await connection.client.batch([
      {
        sql: `INSERT INTO audit_logs
          (id, session_id, tenant_id, user_id, duration_ms, status, payload_hash, created_at)
          VALUES ('audit_old', 'closure_acl_purge', 'tenant_closed', 'user_closed', 1, 'SUCCESS', 'hash', ?)`,
        args: [oldAudit],
      },
      {
        sql: `INSERT INTO audit_logs
          (id, session_id, tenant_id, user_id, duration_ms, status, payload_hash, created_at)
          VALUES ('audit_held', 'closure_acl_held', 'tenant_closed_held', 'user_closed_held', 1, 'SUCCESS', 'hash', ?)`,
        args: [oldAudit],
      },
      {
        sql: `INSERT INTO retention_exceptions
          (id, closure_id, category, legal_basis_reference, authority_reference,
           responsible, starts_at, review_at, ends_at, status)
          VALUES ('hold_receipt', 'acl_held', 'CLOSURE_RECEIPT', 'LEGAL_HOLD',
            'case_1', 'legal_team', ?, ?, NULL, 'ACTIVE')`,
        args: [oldClosure, '2026-10-01T00:00:00.000Z'],
      },
    ], 'write');

    const result = await new OperationalRetentionService(connection.client).purge(now);

    expect(result).toMatchObject({ accessLogs: 1, closureReceipts: 1 });
    expect(await repository.findById('acl_purge')).toBeUndefined();
    expect(await repository.findById('acl_held')).toBeDefined();
    expect((await connection.client.execute({
      sql: 'SELECT id FROM audit_logs WHERE id = ?',
      args: ['audit_held'],
    })).rows).toHaveLength(1);
    connection.client.close();
  });
});
