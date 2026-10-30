import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations, AgenticWorkspaceRepository } from '@forgelex/persistence';
import { InferenceBudgetService, LedgerService } from '@forgelex/billing-ledger';
import { createPilotOpenAIRuntime, PILOT_POLICY } from './real-provider.js';
import { assertPilotRecoverySafe, assertPilotResult } from './task6-homologation.js';
const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
afterEach(() => {
  for (const c of connections.splice(0)) c.client.close();
});
const owner = { tenantId: 'synthetic-pilot', userId: 'boni' };
async function fixture(ceiling = 50) {
  const c = await createDatabase({ url: 'file::memory:' });
  connections.push(c);
  await runPersistenceMigrations(c.client);
  await new LedgerService(c.db, c.client).provisionAccount(owner.tenantId, {
    paidBalanceCents: 500,
    promotionalBalanceCents: 0,
  });
  const repo = new AgenticWorkspaceRepository(c.db);
  const conv = await repo.createConversation(owner, {
    objective: 'Teste sintÃ©tico',
    context: { origin: 'USER', text: 'Exemplo sintÃ©tico', documents: [] },
  });
  const execution = await repo.createExecution(owner, {
    conversationId: conv.id,
    contextRevision: 1,
    idempotencyKey: 'test',
    authorizationId: 'boni-task6',
    budgetReservationId: null,
    provider: 'openai',
    model: 'gpt-6.1-sol',
  });
  const budget = new InferenceBudgetService(c.db, c.client);
  await budget.reserveExecutionBudget({
    ...owner,
    executionId: execution.id,
    maxCostCents: ceiling,
    idempotencyKey: 'reserve',
    policy: PILOT_POLICY,
  });
  return { ...c, budget, execution };
}
function sse(model = 'gpt-6.1-sol', input = 100, output = 20) {
  return new Response(
    'data: ' +
      JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_synthetic',
          model,
          status: 'completed',
          usage: { input_tokens: input, output_tokens: output, input_tokens_details: { cached_tokens: 0 } },
        },
      }) +
      '\n\n',
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
const request = () => ({
  method: 'POST',
  body: JSON.stringify({ model: 'gpt-6.1-sol', input: 'Exemplo sintÃ©tico', stream: true, tools: [] }),
});
describe('provider real limitado ao piloto aprovado', () => {
  it('recusa modelo ou teto divergentes antes de criar provider', async () => {
    const f = await fixture();
    expect(() =>
      createPilotOpenAIRuntime({
        ...f,
        owner,
        apiKey: 'test',
        approval: { provider: 'openai', model: 'other', ceilingCents: 500, reference: 'boni-task6' },
        assertContext: async () => {},
      }),
    ).toThrow('PILOT_APPROVAL_INVALID');
    expect(() =>
      createPilotOpenAIRuntime({
        ...f,
        owner,
        apiKey: 'test',
        approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 501, reference: 'boni-task6' },
        assertContext: async () => {},
      }),
    ).toThrow('PILOT_APPROVAL_INVALID');
  });
  it('reserva antes de enviar e liquida usage normalizado sem cache ou fallback', async () => {
    const f = await fixture();
    let calls = 0;
    let observed: any;
    const runtime = createPilotOpenAIRuntime({
      ...f,
      owner,
      apiKey: 'test',
      approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
      assertContext: async () => {},
      transport: async (_url: any, init: any) => {
        calls++;
        observed = JSON.parse(init.body);
        const rows = await f.client.execute('SELECT payload_json FROM inference_calls');
        expect(rows.rows).toHaveLength(1);
        expect(String(rows.rows[0].payload_json)).toContain('AUTHORIZED');
        return sse();
      },
    });
    await runtime.fetchFor(f.execution.id)('https://api.openai.com/v1/responses', request());
    expect(calls).toBe(1);
    expect(observed.max_output_tokens).toBe(2048);
    expect(observed.service_tier).toBe('default');
    expect(observed.store).toBe(false);
    expect(observed.parallel_tool_calls).toBe(false);
    expect(observed.prompt_cache_options).toEqual({ mode: 'explicit' });
    expect(runtime.observations[0].usage).toMatchObject({
      provider: 'openai',
      model: 'gpt-6.1-sol',
      inputTokens: 100,
      outputTokens: 20,
    });
    expect(runtime.observations[0].status).toBe('SETTLED');
  });
  it('recusa destino alternativo, tool hospedada e histÃ³rico remoto antes da rede', async () => {
    const f = await fixture();
    let calls = 0;
    const r = createPilotOpenAIRuntime({
      ...f,
      owner,
      apiKey: 'test',
      approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
      assertContext: async () => {},
      transport: async () => {
        calls++;
        return sse();
      },
    }).fetchFor(f.execution.id);
    await expect(r('https://example.com/v1/responses', request())).rejects.toThrow('PILOT_DESTINATION_INVALID');
    await expect(
      r('https://api.openai.com/v1/responses', {
        ...request(),
        body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, input: 'X', tools: [{ type: 'web_search' }] }),
      }),
    ).rejects.toThrow('PILOT_REQUEST_INVALID');
    await expect(
      r('https://api.openai.com/v1/responses', {
        ...request(),
        body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, input: 'X', previous_response_id: 'resp_other' }),
      }),
    ).rejects.toThrow('PILOT_REQUEST_INVALID');
    expect(calls).toBe(0);
  });
  it('orÃ§amento insuficiente impede envio', async () => {
    const f = await fixture(1);
    let calls = 0;
    const r = createPilotOpenAIRuntime({
      ...f,
      owner,
      apiKey: 'test',
      approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
      assertContext: async () => {},
      transport: async () => {
        calls++;
        return sse();
      },
    });
    await expect(r.fetchFor(f.execution.id)('https://api.openai.com/v1/responses', request())).rejects.toThrow(
      'BUDGET_EXCEEDED',
    );
    expect(calls).toBe(0);
  });
  it('perda de contexto impede envio', async () => {
    const f = await fixture();
    let calls = 0;
    const r = createPilotOpenAIRuntime({
      ...f,
      owner,
      apiKey: 'test',
      approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
      assertContext: async () => {
        throw new Error('ACCESS_REVOKED');
      },
      transport: async () => {
        calls++;
        return sse();
      },
    });
    await expect(r.fetchFor(f.execution.id)('https://api.openai.com/v1/responses', request())).rejects.toThrow(
      'ACCESS_REVOKED',
    );
    expect(calls).toBe(0);
  });
  it('falha de transporte retÃ©m reserva para conciliaÃ§Ã£o, sem retry', async () => {
    const f = await fixture();
    let calls = 0;
    const r = createPilotOpenAIRuntime({
      ...f,
      owner,
      apiKey: 'test',
      approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
      assertContext: async () => {},
      transport: async () => {
        calls++;
        throw new Error('secret error');
      },
    });
    await expect(r.fetchFor(f.execution.id)('https://api.openai.com/v1/responses', request())).rejects.toThrow(
      'PILOT_TRANSPORT_FAILED',
    );
    expect(calls).toBe(1);
    expect(r.observations[0].status).toBe('RECONCILIATION_REQUIRED');
  });
  it('usage ausente ou modelo efetivo divergente nunca vira custo zero', async () => {
    for (const response of [new Response('data: {}\n\n'), sse('other')]) {
      const f = await fixture();
      const r = createPilotOpenAIRuntime({
        ...f,
        owner,
        apiKey: 'test',
        approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
        assertContext: async () => {},
        transport: async () => response,
      });
      await expect(r.fetchFor(f.execution.id)('https://api.openai.com/v1/responses', request())).rejects.toThrow(
        'PILOT_RESPONSE_INVALID',
      );
      expect(r.observations[0].status).toBe('RECONCILIATION_REQUIRED');
    }
  });
});

it('compatibiliza detalhe de cache zerado do wire sem descartar usage financeiro', async () => {
  const f = await fixture();
  const raw = JSON.stringify({
    type: 'response.completed',
    response: {
      id: 'resp_new',
      model: 'gpt-6.1-sol',
      usage: {
        input_tokens: 100,
        output_tokens: 5,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens_details: { ephemeral_30m_input_tokens: 0 } },
      },
    },
  });
  const r = createPilotOpenAIRuntime({
    ...f,
    owner,
    apiKey: 'test',
    approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
    assertContext: async () => {},
    transport: async () => new Response('data: ' + raw + '\n\n'),
  });
  const result = await r.fetchFor(f.execution.id)('https://api.openai.com/v1/responses', request());
  expect(await result.text()).not.toContain('cache_write_tokens_details');
  expect(r.observations[0].usage?.inputTokens).toBe(100);
});

it('cancelamento prévio e função fora do piloto são recusados antes de qualquer envio', async () => {
  const f = await fixture();
  let calls = 0;
  const r = createPilotOpenAIRuntime({
    ...f,
    owner,
    apiKey: 'test',
    approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
    assertContext: async () => {},
    transport: async () => {
      calls++;
      return sse();
    },
  }).fetchFor(f.execution.id);
  await expect(r('https://api.openai.com/v1/responses', { ...request(), signal: AbortSignal.abort() })).rejects.toThrow(
    'SESSION_CANCELLED',
  );
  await expect(
    r('https://api.openai.com/v1/responses', {
      ...request(),
      body: JSON.stringify({
        model: 'gpt-6.1-sol',
        stream: true,
        input: 'Exemplo sintético',
        tools: [{ type: 'function', name: 'forgelex_research_search_case_law' }],
      }),
    }),
  ).rejects.toThrow('PILOT_REQUEST_INVALID');
  expect(calls).toBe(0);
});

it('timeout simulado mantém custo incerto sem fallback ou repetição', async () => {
  const f = await fixture();
  let calls = 0;
  const r = createPilotOpenAIRuntime({
    ...f,
    owner,
    apiKey: 'test',
    approval: { provider: 'openai', model: 'gpt-6.1-sol', ceilingCents: 500, reference: 'boni-task6' },
    assertContext: async () => {},
    transport: async () => {
      calls++;
      throw new DOMException('synthetic timeout', 'TimeoutError');
    },
  });
  await expect(r.fetchFor(f.execution.id)('https://api.openai.com/v1/responses', request())).rejects.toThrow(
    'PILOT_TRANSPORT_FAILED',
  );
  expect(calls).toBe(1);
  expect(r.observations[0].status).toBe('RECONCILIATION_REQUIRED');
});

it('retomada com execução autorizada já reservada exige recuperação explícita', async () => {
  const f = await fixture();
  await expect(assertPilotRecoverySafe(f.db, owner)).rejects.toThrow('PILOT_PREVIOUS_EXECUTION_PENDING');
});
it('homologação não aceita tarefa ainda QUEUED nem cancelamento não observado', () => {
  const report: any = {
    attempts: [
      { caseId: 'T6-MIN', status: 'COMPLETED', events: [{ type: 'lifecycle:completed', output: 'OK' }] },
      { caseId: 'T6-CONTEXT', status: 'QUEUED' },
      {
        caseId: 'T6-CANCEL',
        status: 'UNEXPECTED',
        dispatched: true,
        events: [{ type: 'lifecycle:completed', output: 'OK' }],
      },
    ],
    observations: [],
  };
  expect(() => assertPilotResult(report, 'all', 'T6-CONTEXT')).toThrow('PILOT_CASE_NOT_FINISHED');
  expect(() => assertPilotResult(report, 'cancel')).toThrow('PILOT_CANCELLATION_NOT_OBSERVED');
  report.attempts[2] = {
    caseId: 'T6-CANCEL',
    status: 'CANCELLED',
    dispatched: true,
    events: [{ type: 'error', code: 'SESSION_CANCELLED' }],
  };
  expect(() => assertPilotResult(report, 'cancel')).not.toThrow();
});
