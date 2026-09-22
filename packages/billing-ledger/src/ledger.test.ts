import { randomBytes } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, ForgeLexDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from './ledger-service.js';
import { Client } from '@libsql/client';
import { billingOperations, ledgerEntries } from './schema/ledger-schema.js';
import { eq } from 'drizzle-orm';

describe('LedgerService (Execução Faturável Idempotente e Carteira Dupla)', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let ledger: LedgerService;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
    ledger = new LedgerService(db);
    await runPersistenceMigrations(client);
    await ledger.bootstrapTables();
    await client.execute('DELETE FROM billing_operations');
    await client.execute('DELETE FROM ledger_entries');
    await client.execute('DELETE FROM usage_events');
    await client.execute('DELETE FROM ledger_accounts');
  });

  afterEach(() => {
    client.close();
  });

  it('deve debitar saldo promocional com validade antes de tocar no saldo pago', async () => {
    // Conta criada com R$ 63,00 de saldo pago (6300 centavos) e R$ 15,00 de saldo promocional (1500 centavos)
    const account = await ledger.provisionAccount('tenant_albuquerque', {
      paidBalanceCents: 6300,
      promotionalBalanceCents: 1500,
      promoExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(account.paidBalanceCents).toBe(6300);
    expect(account.promotionalBalanceCents).toBe(1500);

    // Executa uma busca jurisprudencial de R$ 0,20 (20 centavos)
    const result = await ledger.executeBillableOperation({
      tenantId: 'tenant_albuquerque',
      idempotencyKey: 'query_req_001',
      costCents: 20,
      operation: async () => ({ resultado: 'acordao_encontrado' }),
    });

    expect(result.data.resultado).toBe('acordao_encontrado');
    expect(result.chargedCents).toBe(20);
    expect(result.isReplay).toBe(false);

    // O saldo promocional deve ter diminuído de 1500 para 1480 centavos, mantendo o saldo pago intacto (6300)
    const updated = await ledger.getOrCreateAccount('tenant_albuquerque');
    expect(updated.promotionalBalanceCents).toBe(1480);
    expect(updated.paidBalanceCents).toBe(6300);
  });

  it('deve garantir idempotência absoluta e prevenir double-billing em retries', async () => {
    let executionCounter = 0;

    await ledger.provisionAccount('tenant_1', {
      paidBalanceCents: 100,
      promotionalBalanceCents: 0,
    });

    const op = async () => {
      executionCounter++;
      return { jurisprudenciaId: 'stj_123', count: executionCounter };
    };

    const idempotencyKey = 'idempotent_key_stj_search_unique';

    // 1ª execução
    const firstCall = await ledger.executeBillableOperation({
      tenantId: 'tenant_1',
      idempotencyKey,
      costCents: 20,
      operation: op,
    });

    expect(firstCall.isReplay).toBe(false);
    expect(firstCall.chargedCents).toBe(20);
    expect(executionCounter).toBe(1);

    // 2ª execução (Retry simulado de cliente MCP com a mesma idempotencyKey)
    const secondCall = await ledger.executeBillableOperation({
      tenantId: 'tenant_1',
      idempotencyKey,
      costCents: 20,
      operation: op,
    });

    // Invariante de ouro do Apêndice Q:
    // A função NÃO pode ter sido executada novamente (executionCounter continua 1),
    // o resultado devolvido é o mesmo em cache e o valor cobrado foi R$ 0,00!
    expect(secondCall.isReplay).toBe(true);
    expect(secondCall.chargedCents).toBe(0);
    expect(secondCall.data.jurisprudenciaId).toBe('stj_123');
    expect(executionCounter).toBe(1);
  });

  it('preserva o replay idempotente após reiniciar o serviço', async () => {
    await ledger.provisionAccount('tenant_restart', { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    await ledger.executeBillableOperation({
      tenantId: 'tenant_restart', idempotencyKey: 'restart-key', costCents: 20,
      operation: async () => ({ authorityId: 'stj-1' }),
    });

    const restartedLedger = new LedgerService(db, client);
    const replay = await restartedLedger.executeBillableOperation({
      tenantId: 'tenant_restart', idempotencyKey: 'restart-key', costCents: 20,
      operation: async () => { throw new Error('não deveria executar'); },
    });

    expect(replay).toMatchObject({ isReplay: true, chargedCents: 0, data: { authorityId: 'stj-1' } });
    expect(await db.select().from(ledgerEntries)).toHaveLength(1);
  });

  it('rejeita snapshot idempotente corrompido sem reexecutar a operação', async () => {
    await ledger.provisionAccount('tenant_bad_snapshot', { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    await ledger.executeBillableOperation({
      tenantId: 'tenant_bad_snapshot', idempotencyKey: 'bad-snapshot-key', costCents: 20,
      operation: async () => ({ ok: true }),
    });
    const operation = (await db.select().from(billingOperations))[0];
    await db.update(billingOperations).set({ resultSnapshot: '{invalid' }).where(eq(billingOperations.id, operation.id));

    await expect(ledger.executeBillableOperation({
      tenantId: 'tenant_bad_snapshot', idempotencyKey: 'bad-snapshot-key', costCents: 20,
      operation: async () => { throw new Error('não deveria executar'); },
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_RESULT_INVALID' });
    expect(await db.select().from(ledgerEntries)).toHaveLength(1);
  });

  it('deve rejeitar execução quando o saldo disponível for insuficiente', async () => {
    // Conta zerada
    await ledger.provisionAccount('tenant_sem_saldo', {
      paidBalanceCents: 0,
      promotionalBalanceCents: 0,
    });

    await expect(
      ledger.executeBillableOperation({
        tenantId: 'tenant_sem_saldo',
        idempotencyKey: 'req_sem_saldo',
        costCents: 20,
        operation: async () => 'ok',
      })
    ).rejects.toThrow('Saldo insuficiente');
  });

  it('deve provisionar saldo zero por padrão, sem crédito implícito', async () => {
    const account = await ledger.getOrCreateAccount('tenant_zero_default');

    expect(account.paidBalanceCents).toBe(0);
    expect(account.promotionalBalanceCents).toBe(0);
    expect(account.promoExpiresAt).toBeNull();
  });

  it('exige custo explícito para impedir preço comercial por fallback', async () => {
    await ledger.provisionAccount('tenant_explicit_cost', {
      paidBalanceCents: 100,
      promotionalBalanceCents: 0,
    });

    await expect(
      ledger.executeBillableOperation({
        tenantId: 'tenant_explicit_cost',
        idempotencyKey: 'explicit_cost_001',
        operation: async () => ({ ok: true }),
      } as never),
    ).rejects.toThrow('O custo da operação deve ser inteiro positivo.');
  });

  it('deve registrar um UsageEvent e vinculá-lo ao débito', async () => {
    await ledger.provisionAccount('tenant_usage', {
      paidBalanceCents: 100,
      promotionalBalanceCents: 0,
    });

    const result = await ledger.executeBillableOperation({
      tenantId: 'tenant_usage',
      userId: 'user_usage',
      idempotencyKey: 'usage_event_001',
      costCents: 20,
      usage: {
        capability: 'research.search_case_law',
        toolName: 'research.search_case_law',
        units: 1,
      },
      operation: async () => ({ ok: true }),
    });

    expect(result.chargedCents).toBe(20);
    const usage = await ledger.getUsageEvents('tenant_usage');
    expect(usage).toHaveLength(1);
    expect(usage[0].capability).toBe('research.search_case_law');
    expect(usage[0].legalCredits).toBe(1);
    expect(usage[0].requestId).toBe('usage_event_001');

    const entries = await db.select().from(ledgerEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].usageEventId).toBe(usage[0].id);
  });

  it('deve executar operação gratuita sem débito, UsageEvent ou replay financeiro', async () => {
    await ledger.provisionAccount('tenant_free_operation', {
      paidBalanceCents: 100,
      promotionalBalanceCents: 50,
    });

    let executionCounter = 0;
    const first = await ledger.executeOperation({
      tenantId: 'tenant_free_operation',
      userId: 'user_free_operation',
      idempotencyKey: 'free_operation_001',
      billing: { mode: 'FREE' },
      usage: {
        capability: 'research.verify_authority',
        toolName: 'research.verify_authority',
      },
      operation: async () => ({ executionCounter: ++executionCounter }),
    });
    const second = await ledger.executeOperation({
      tenantId: 'tenant_free_operation',
      userId: 'user_free_operation',
      idempotencyKey: 'free_operation_001',
      billing: { mode: 'FREE' },
      operation: async () => ({ executionCounter: ++executionCounter }),
    });

    expect(first).toMatchObject({ billingMode: 'FREE', chargedCents: 0, isReplay: false, data: { executionCounter: 1 } });
    expect(second).toMatchObject({ billingMode: 'FREE', chargedCents: 0, isReplay: false, data: { executionCounter: 2 } });
    expect(executionCounter).toBe(2);
    expect((await ledger.getOrCreateAccount('tenant_free_operation')).paidBalanceCents).toBe(100);
    expect((await ledger.getOrCreateAccount('tenant_free_operation')).promotionalBalanceCents).toBe(50);
    expect(await ledger.getUsageEvents('tenant_free_operation')).toHaveLength(0);
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it('deve serializar débitos concorrentes e impedir saldo negativo', async () => {
    await ledger.provisionAccount('tenant_concurrent', {
      paidBalanceCents: 20,
      promotionalBalanceCents: 0,
    });

    let executionCounter = 0;
    const operation = async () => {
      executionCounter++;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { executionCounter };
    };

    const results = await Promise.allSettled([
      ledger.executeBillableOperation({
        tenantId: 'tenant_concurrent',
        idempotencyKey: 'concurrent_001',
        costCents: 20,
        operation,
      }),
      ledger.executeBillableOperation({
        tenantId: 'tenant_concurrent',
        idempotencyKey: 'concurrent_002',
        costCents: 20,
        operation,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(executionCounter).toBe(1);

    const account = await ledger.getOrCreateAccount('tenant_concurrent');
    expect(account.paidBalanceCents).toBe(0);
    expect(account.promotionalBalanceCents).toBe(0);
  });

  it('executa uma única vez quando duas chamadas concorrentes usam a mesma chave', async () => {
    await ledger.provisionAccount('tenant_same_key', { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    const calls: string[] = [];
    const input = { tenantId: 'tenant_same_key', idempotencyKey: 'same', costCents: 20 };

    const first = ledger.executeBillableOperation({ ...input, operation: async () => {
      calls.push('executed');
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { ids: ['a'] };
    } });
    const second = ledger.executeBillableOperation({ ...input, operation: async () => {
      calls.push('duplicate');
      return { ids: ['b'] };
    } });

    const [a, b] = await Promise.all([first, second]);
    expect(calls).toEqual(['executed']);
    expect(a.data).toEqual(b.data);
    expect([a.chargedCents, b.chargedCents].sort((x, y) => x - y)).toEqual([0, 20]);
  });

  it('retoma reserva expirada sem criar dois débitos', async () => {
    const account = await ledger.provisionAccount('tenant_expired_reservation', { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    const old = new Date(Date.now() - 60_000).toISOString();
    await db.insert(billingOperations).values({
      id: 'expired-operation', tenantId: 'tenant_expired_reservation', accountId: account.id,
      idempotencyKey: 'expired-key', status: 'PENDING', reservedAmountCents: 20,
      leaseOwner: 'dead-worker', leaseExpiresAt: old, resultSnapshot: null, errorCode: null,
      createdAt: old, updatedAt: old,
    });

    const result = await ledger.executeBillableOperation({
      tenantId: 'tenant_expired_reservation', idempotencyKey: 'expired-key', costCents: 20,
      operation: async () => ({ ok: true }),
    });
    expect(result).toMatchObject({ chargedCents: 20, isReplay: false, data: { ok: true } });
    expect(await db.select().from(ledgerEntries)).toHaveLength(1);
    expect((await db.select().from(billingOperations))[0]).toMatchObject({ status: 'COMPLETED', leaseOwner: null });
  });

  it('rejeita snapshot incompressível acima do limite persistido', async () => {
    await ledger.provisionAccount('tenant_snapshot_limit', { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    const exact = await ledger.executeBillableOperation({
      tenantId: 'tenant_snapshot_limit', idempotencyKey: 'snapshot-exact', costCents: 20,
      operation: async () => 'x'.repeat(8_388_606),
    });
    expect(Buffer.byteLength(JSON.stringify(exact.data), 'utf8')).toBe(8_388_608);

    await expect(ledger.executeBillableOperation({
      tenantId: 'tenant_snapshot_limit', idempotencyKey: 'snapshot-over', costCents: 20,
      operation: async () => randomBytes(8 * 1024 * 1024).toString('base64'),
    })).rejects.toMatchObject({ code: 'OPERATION_RESULT_TOO_LARGE' });
    expect((await ledger.getOrCreateAccount('tenant_snapshot_limit')).paidBalanceCents).toBe(80);
  });

  it('comprime resposta repetível acima do limite bruto sem perder o replay', async () => {
    await ledger.provisionAccount('tenant_compressed_snapshot', { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    const first = await ledger.executeBillableOperation({
      tenantId: 'tenant_compressed_snapshot', idempotencyKey: 'compressed-snapshot', costCents: 20,
      operation: async () => ({ payload: 'x'.repeat(12 * 1024 * 1024) }),
    });
    const stored = (await db.select().from(billingOperations))[0]?.resultSnapshot;
    expect(first.data.payload).toHaveLength(12 * 1024 * 1024);
    expect(stored).toMatch(/^gzip:/);

    const replay = await ledger.executeBillableOperation({
      tenantId: 'tenant_compressed_snapshot', idempotencyKey: 'compressed-snapshot', costCents: 20,
      operation: async () => { throw new Error('não deve reexecutar'); },
    });
    expect(replay).toMatchObject({ isReplay: true, chargedCents: 0 });
    expect(replay.data.payload).toHaveLength(12 * 1024 * 1024);
  });

  it('deve fazer rollback do débito e do UsageEvent quando a operação falhar', async () => {
    await ledger.provisionAccount('tenant_rollback', {
      paidBalanceCents: 100,
      promotionalBalanceCents: 0,
    });

    await expect(
      ledger.executeBillableOperation({
        tenantId: 'tenant_rollback',
        idempotencyKey: 'rollback_001',
        costCents: 20,
        operation: async () => {
          throw new Error('upstream unavailable');
        },
      })
    ).rejects.toThrow('upstream unavailable');

    const account = await ledger.getOrCreateAccount('tenant_rollback');
    expect(account.paidBalanceCents).toBe(100);
    expect(await ledger.getUsageEvents('tenant_rollback')).toHaveLength(0);
    expect(await db.select().from(ledgerEntries)).toHaveLength(0);
  });

  it('aplica ownership de retenção ao webhook financeiro uma única vez', async () => {
    await ledger.runMigrations();

    const columns = await client.execute("PRAGMA table_info('billing_webhook_events')");
    const migrations = await client.execute({
      sql: 'SELECT COUNT(*) AS count FROM forgelex_migrations WHERE id = ?',
      args: ['billing-ledger-0007-webhook-retention-owner'],
    });

    expect(columns.rows.map((row) => row.name)).toContain('tenant_id');
    expect(Number(migrations.rows[0]?.count)).toBe(1);
  });
});
