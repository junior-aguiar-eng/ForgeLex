import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, AgenticWorkspaceRepository } from '@forgelex/persistence';
import { LedgerService } from './ledger-service.js';
import { InferenceBudgetService } from './inference-budget-service.js';

const owner = { tenantId: 'budget-test', userId: 'author' };
// Synthetic policy only; no commercial model or price is configured by these tests.
const policy = {
  id: 'synthetic',
  version: '1',
  approvalReference: 'fixture-only',
  provider: 'fake',
  model: 'fake',
  maxCalls: 4,
  maxInputTokens: 1000,
  maxOutputTokens: 1000,
  inputCentsPerMillion: 10000,
  outputCentsPerMillion: 10000,
};
const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
async function fixture(balance = 100) {
  const c = await createDatabase({ url: 'file::memory:' });
  connections.push(c);
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: balance, promotionalBalanceCents: 0 });
  const repo = new AgenticWorkspaceRepository(c.db);
  const conversation = await repo.createConversation(owner, {
    objective: 'Pesquisa sintética',
    context: { text: 'Teste', origin: 'USER', documents: [] },
  });
  const execution = await repo.createExecution(owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: 'run',
    authorizationId: 'synthetic-consent',
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  const service = new InferenceBudgetService(c.db, c.client);
  const reserve = { ...owner, executionId: execution.id, maxCostCents: 60, idempotencyKey: 'budget', policy };
  return { ...c, ledger, repo, execution, service, reserve };
}
const quote = { callId: 'call-1', upperBoundCents: 20, inputTokens: 1000, maxOutputTokens: 1000 };
const usage = { provider: 'fake', model: 'fake', inputTokens: 500, outputTokens: 500 };
afterEach(() => {
  for (const c of connections.splice(0)) c.client.close();
});

describe('orçamento durável de inferência', () => {
  it('snapshot de pesquisa expirado preserva estado liquidado e o erro de replay', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    const input = {
      callId: 'stj-snapshot',
      idempotencyKey: 'snapshot-key',
      costCents: 15,
      requestFingerprint: 'query',
      operation: async () => 'source',
    };
    await f.service.executeResearchCall(owner, f.execution.id, input);
    await f.client.execute({
      sql: 'UPDATE billing_operations SET result_snapshot = NULL WHERE idempotency_key = ?',
      args: [input.idempotencyKey],
    });
    await expect(f.service.executeResearchCall(owner, f.execution.id, input)).rejects.toThrow('expirou');
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(85);
  });
  it('retry de pesquisa não reassume operação externa após lease expirar', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    let open!: () => void,
      started!: () => void,
      invoked = 0;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const input = {
      callId: 'stj-long',
      idempotencyKey: 'stj-long-key',
      costCents: 15,
      requestFingerprint: 'long-query',
      operation: async () => {
        invoked++;
        started();
        await gate;
        return 'done';
      },
    };
    const original = f.service.executeResearchCall(owner, f.execution.id, input);
    await ready;
    await f.client.execute({
      sql: "UPDATE billing_operations SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE idempotency_key = ?",
      args: [input.idempotencyKey],
    });
    try {
      const retryInput = {
        ...input,
        operation: async () => {
          invoked++;
          return 'duplicated';
        },
      };
      await expect(
        new InferenceBudgetService(f.db, f.client).executeResearchCall(owner, f.execution.id, retryInput),
      ).rejects.toThrow('CALL_ALREADY_AUTHORIZED');
      expect(invoked).toBe(1);
    } finally {
      open();
      await original;
    }
    expect(await f.ledger.getSettledChargeCents(owner.tenantId, input.idempotencyKey)).toBe(15);
  });
  it('limite monetário cobre o maior preço configurado entre entrada normal e cache', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget({ ...f.reserve, policy: { ...policy, cachedInputCentsPerMillion: 20000 } });
    await expect(f.service.authorizeProviderCall(owner, f.execution.id, quote)).rejects.toThrow('PROVIDER_LIMIT');
    expect(
      (await f.service.authorizeProviderCall(owner, f.execution.id, { ...quote, upperBoundCents: 30 })).shouldExecute,
    ).toBe(true);
  });
  it('respeita reserva avulsa em trânsito antes de reservar inferência', async () => {
    const f = await fixture();
    let open!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const running = f.ledger.executeBillableOperation({
      tenantId: owner.tenantId,
      idempotencyKey: 'pending',
      costCents: 70,
      operation: async () => {
        started();
        await gate;
        return 'done';
      },
    });
    await ready;
    try {
      await expect(f.service.reserveExecutionBudget(f.reserve)).rejects.toThrow('BILLING_INSUFFICIENT_BALANCE');
    } finally {
      open();
      await running;
    }
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(30);
  });
  it('não considera uma reserva avulsa expirada como consumo confirmado zero', async () => {
    const f = await fixture();
    let open!: () => void, started!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const running = f.ledger.executeBillableOperation({
      tenantId: owner.tenantId,
      idempotencyKey: 'expired-pending',
      costCents: 70,
      operation: async () => {
        started();
        await gate;
        return 'done';
      },
    });
    await ready;
    await f.client.execute({
      sql: "UPDATE billing_operations SET lease_expires_at = '2000-01-01T00:00:00.000Z' WHERE idempotency_key = ?",
      args: ['expired-pending'],
    });
    try {
      await expect(f.service.reserveExecutionBudget(f.reserve)).rejects.toThrow('BILLING_INSUFFICIENT_BALANCE');
    } finally {
      // Restore the test wallet if the incorrect reservation was accepted, so the original callback can terminate.
      await f.service.releaseUnusedBudget(owner, f.execution.id).catch(() => undefined);
      open();
      await running;
    }
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(30);
  });
  it('não autoriza liquidação no ledger sem preparar o consumo medido', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    await f.service.authorizeProviderCall(owner, f.execution.id, quote);
    let invoked = false;
    await expect(
      f.ledger.executeBillableOperation({
        ...owner,
        idempotencyKey: `inference:${f.execution.id}:${quote.callId}`,
        costCents: 10,
        budgetFunding: { executionId: f.execution.id, callId: quote.callId },
        operation: async () => {
          invoked = true;
          return 'no';
        },
      }),
    ).rejects.toThrow('BUDGET_FUNDING_INVALID');
    expect(invoked).toBe(false);
  });
  it('devolve verbas aos buckets originais sem reviver promoção expirada', async () => {
    const f = await fixture();
    const expires = Date.now() + 60000;
    await f.client.execute({
      sql: 'UPDATE ledger_accounts SET promotional_balance_cents = 30, promo_expires_at = ? WHERE tenant_id = ?',
      args: [new Date(expires).toISOString(), owner.tenantId],
    });
    await f.service.reserveExecutionBudget(f.reserve);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(expires + 1);
    try {
      await expect(f.service.authorizeProviderCall(owner, f.execution.id, quote)).rejects.toThrow('PROMOTION_EXPIRED');
      const released = await f.service.releaseUnusedBudget(owner, f.execution.id);
      expect(released.expiredPromoCents).toBe(30);
      expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(100);
    } finally {
      clock.mockRestore();
    }
  });
  it('falha de provider sem consumo confirmado mantém cobertura incerta', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    await expect(
      f.service.executeProviderCall(owner, f.execution.id, quote, async () => {
        throw new Error('network-unknown');
      }),
    ).rejects.toThrow('network-unknown');
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(80);
  });
  it('provider fake só executa após cobertura e não repete um callId', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    let invoked = 0;
    const fake = async () => {
      invoked++;
      return { data: 'synthetic', usage, actualCostCents: 10 };
    };
    await expect(
      f.service.executeProviderCall(owner, f.execution.id, { ...quote, inputTokens: 1001 }, fake),
    ).rejects.toThrow('PROVIDER_LIMIT');
    expect(invoked).toBe(0);
    const result = await f.service.executeProviderCall(owner, f.execution.id, quote, fake);
    expect(result.settlement.status).toBe('SETTLED');
    await expect(f.service.executeProviderCall(owner, f.execution.id, quote, fake)).rejects.toThrow(
      'CALL_ALREADY_AUTHORIZED',
    );
    expect(invoked).toBe(1);
  });
  it('libera saldo livre no cancelamento mas conserva cobertura de chamada em trânsito', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    await f.service.authorizeProviderCall(owner, f.execution.id, quote);
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(80);
    await f.service.settleProviderCall(owner, f.execution.id, { callId: quote.callId, usage, actualCostCents: 10 });
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(90);
  });
  it('aceita custo zero somente quando medido e previsto na política sintética', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget({
      ...f.reserve,
      policy: { ...policy, inputCentsPerMillion: 0, outputCentsPerMillion: 0 },
    });
    await f.service.authorizeProviderCall(owner, f.execution.id, { ...quote, upperBoundCents: 0 });
    await f.service.settleProviderCall(owner, f.execution.id, { callId: quote.callId, usage, actualCostCents: 0 });
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(100);
    expect(await f.ledger.getSettledChargeCents(owner.tenantId, `inference:${f.execution.id}:${quote.callId}`)).toBe(0);
  });
  it('reserva cobertura na carteira, mantém replay e não deixa operação avulsa gastar a reserva', async () => {
    const f = await fixture();
    const budget = await f.service.reserveExecutionBudget(f.reserve);
    expect((await f.service.reserveExecutionBudget(f.reserve)).id).toBe(budget.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(40);
    await expect(f.service.reserveExecutionBudget({ ...f.reserve, maxCostCents: 61 })).rejects.toThrow(
      'IDEMPOTENCY_CONFLICT',
    );
    await expect(
      f.ledger.executeBillableOperation({
        tenantId: owner.tenantId,
        idempotencyKey: 'unrelated',
        costCents: 41,
        operation: async () => 'no',
      }),
    ).rejects.toThrow();
  });
  it('contabiliza callId uma vez, persiste após nova instância e libera somente o restante', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    expect((await f.service.authorizeProviderCall(owner, f.execution.id, quote)).shouldExecute).toBe(true);
    expect(
      (await new InferenceBudgetService(f.db, f.client).authorizeProviderCall(owner, f.execution.id, quote))
        .shouldExecute,
    ).toBe(false);
    await f.service.settleProviderCall(owner, f.execution.id, { callId: quote.callId, usage, actualCostCents: 10 });
    await f.service.settleProviderCall(owner, f.execution.id, { callId: quote.callId, usage, actualCostCents: 10 });
    expect(await f.ledger.getSettledChargeCents(owner.tenantId, `inference:${f.execution.id}:${quote.callId}`)).toBe(
      10,
    );
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(90);
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(90);
  });
  it('consumo não mensurável bloqueia novas chamadas e retém cobertura incerta no cancelamento', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    await f.service.authorizeProviderCall(owner, f.execution.id, quote);
    expect(
      (
        await f.service.settleProviderCall(owner, f.execution.id, {
          callId: quote.callId,
          usage: null,
          actualCostCents: null,
        })
      ).status,
    ).toBe('RECONCILIATION_REQUIRED');
    await expect(f.service.authorizeProviderCall(owner, f.execution.id, { ...quote, callId: 'next' })).rejects.toThrow(
      'BUDGET_NOT_ACTIVE',
    );
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(80);
    expect(await f.ledger.getUsageEvents(owner.tenantId)).toHaveLength(0);
  });
  it('nega limites de contexto/saída, custo e chamadas antes do provider fake', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget({ ...f.reserve, policy: { ...policy, maxCalls: 1 } });
    for (const q of [
      { ...quote, inputTokens: 1001 },
      { ...quote, maxOutputTokens: 1001 },
      { ...quote, upperBoundCents: 19 },
    ])
      await expect(f.service.authorizeProviderCall(owner, f.execution.id, q)).rejects.toThrow();
    await f.service.authorizeProviderCall(owner, f.execution.id, quote);
    await expect(
      f.service.authorizeProviderCall(owner, f.execution.id, { ...quote, callId: 'excess' }),
    ).rejects.toThrow('CALL_LIMIT');
    expect(
      (
        await f.service.settleProviderCall(owner, f.execution.id, {
          callId: quote.callId,
          usage: { ...usage, outputTokens: 2000 },
          actualCostCents: 25,
        })
      ).status,
    ).toBe('RECONCILIATION_REQUIRED');
  });
  it('inclui pesquisa STJ usando o débito e a idempotência do ledger existente', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    let calls = 0;
    const input = {
      callId: 'stj-1',
      idempotencyKey: 'existing-stj-operation',
      costCents: 15,
      requestFingerprint: 'synthetic-query',
      operation: async () => {
        calls++;
        return { results: [] };
      },
    };
    await f.service.executeResearchCall(owner, f.execution.id, input);
    await f.service.executeResearchCall(owner, f.execution.id, input);
    expect(calls).toBe(1);
    expect(await f.ledger.getSettledChargeCents(owner.tenantId, input.idempotencyKey)).toBe(15);
    await f.service.releaseUnusedBudget(owner, f.execution.id);
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(85);
    expect(await f.ledger.getUsageEvents(owner.tenantId)).toHaveLength(1);
  });
  it('isola usuário/tenant e rejeita execução sem vínculo', async () => {
    const f = await fixture();
    await f.service.reserveExecutionBudget(f.reserve);
    for (const stranger of [
      { ...owner, tenantId: 'other' },
      { ...owner, userId: 'other' },
    ]) {
      await expect(f.service.authorizeProviderCall(stranger, f.execution.id, quote)).rejects.toThrow('NOT_FOUND');
      await expect(f.service.releaseUnusedBudget(stranger, f.execution.id)).rejects.toThrow('NOT_FOUND');
    }
    await expect(
      f.service.reserveExecutionBudget({ ...f.reserve, executionId: 'absent', idempotencyKey: 'absent' }),
    ).rejects.toThrow('NOT_FOUND');
  });
});
