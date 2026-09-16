import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, ForgeLexDatabase } from '@forgelex/persistence';
import { LedgerService } from './ledger-service.js';
import { Client } from '@libsql/client';

describe('LedgerService (Execução Faturável Idempotente e Carteira Dupla)', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let ledger: LedgerService;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
    ledger = new LedgerService(db);
    await ledger.bootstrapTables();
  });

  afterEach(() => {
    client.close();
  });

  it('deve debitar saldo promocional com validade antes de tocar no saldo pago', async () => {
    // Conta criada com R$ 63,00 de saldo pago (6300 centavos) e R$ 15,00 de saldo promocional (1500 centavos)
    const account = await ledger.getOrCreateAccount('tenant_albuquerque', 6300, 1500);
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
    await ledger.getOrCreateAccount('tenant_sem_saldo', 0, 0);

    await expect(
      ledger.executeBillableOperation({
        tenantId: 'tenant_sem_saldo',
        idempotencyKey: 'req_sem_saldo',
        costCents: 15,
        operation: async () => 'ok',
      })
    ).rejects.toThrow('Saldo insuficiente');
  });
});
