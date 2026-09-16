import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, ForgeLexDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from './ledger-service.js';
import { Client } from '@libsql/client';
import { ledgerEntries } from './schema/ledger-schema.js';

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

    // Executa uma consulta jurídica de R$ 0,15 (15 centavos)
    const result = await ledger.executeBillableOperation({
      tenantId: 'tenant_albuquerque',
      idempotencyKey: 'query_req_001',
      costCents: 15,
      operation: async () => ({ resultado: 'acordao_encontrado' }),
    });

    expect(result.data.resultado).toBe('acordao_encontrado');
    expect(result.chargedCents).toBe(15);
    expect(result.isReplay).toBe(false);

    // O saldo promocional deve ter diminuído de 1500 para 1485 centavos, mantendo o saldo pago intacto (6300)
    const updated = await ledger.getOrCreateAccount('tenant_albuquerque');
    expect(updated.promotionalBalanceCents).toBe(1485);
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
      costCents: 15,
      operation: op,
    });

    expect(firstCall.isReplay).toBe(false);
    expect(firstCall.chargedCents).toBe(15);
    expect(executionCounter).toBe(1);

    // 2ª execução (Retry simulado de cliente MCP com a mesma idempotencyKey)
    const secondCall = await ledger.executeBillableOperation({
      tenantId: 'tenant_1',
      idempotencyKey,
      costCents: 15,
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
        costCents: 15,
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

  it('deve registrar um UsageEvent e vinculá-lo ao débito', async () => {
    await ledger.provisionAccount('tenant_usage', {
      paidBalanceCents: 100,
      promotionalBalanceCents: 0,
    });

    const result = await ledger.executeBillableOperation({
      tenantId: 'tenant_usage',
      userId: 'user_usage',
      idempotencyKey: 'usage_event_001',
      costCents: 15,
      usage: {
        capability: 'research.search_case_law',
        toolName: 'research.search_case_law',
        units: 1,
      },
      operation: async () => ({ ok: true }),
    });

    expect(result.chargedCents).toBe(15);
    const usage = await ledger.getUsageEvents('tenant_usage');
    expect(usage).toHaveLength(1);
    expect(usage[0].capability).toBe('research.search_case_law');
    expect(usage[0].legalCredits).toBe(1);
    expect(usage[0].requestId).toBe('usage_event_001');

    const entries = await db.select().from(ledgerEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0].usageEventId).toBe(usage[0].id);
  });

  it('deve serializar débitos concorrentes e impedir saldo negativo', async () => {
    await ledger.provisionAccount('tenant_concurrent', {
      paidBalanceCents: 15,
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
        costCents: 15,
        operation,
      }),
      ledger.executeBillableOperation({
        tenantId: 'tenant_concurrent',
        idempotencyKey: 'concurrent_002',
        costCents: 15,
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

  it('deve fazer rollback do débito e do UsageEvent quando a operação falhar', async () => {
    await ledger.provisionAccount('tenant_rollback', {
      paidBalanceCents: 100,
      promotionalBalanceCents: 0,
    });

    await expect(
      ledger.executeBillableOperation({
        tenantId: 'tenant_rollback',
        idempotencyKey: 'rollback_001',
        costCents: 15,
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
});
