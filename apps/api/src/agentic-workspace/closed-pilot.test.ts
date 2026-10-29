import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDatabase, runPersistenceMigrations, AgenticWorkspaceRepository } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { createClosedPilot } from './closed-pilot.js';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { createCaseTaskDriver } from './case-task-driver.js';
import { ExecutionWorker } from './execution-worker.js';
import { createClosedFinance } from './closed-pilot-finance.js';

const root = new URL('../../../../', import.meta.url);
const history = JSON.parse(
  readFileSync(new URL('docs/architecture/evidence/2026-10-27-agentic-task6-real.json', root), 'utf8'),
);
const funding = { tenantId: 'boni-task6-synthetic-only', userId: 'boni' };
const owner = { tenantId: 'real-boni-tenant', userId: 'verified-boni-user' };
const env = {
  FORGELEX_CLOSED_PILOT_ENABLED: 'true',
  FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true',
  FORGELEX_CLOSED_PILOT_TENANT_ID: owner.tenantId,
  FORGELEX_CLOSED_PILOT_USER_ID: owner.userId,
};
const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const c of connections.splice(0)) c.client.close();
});

it('libera reserva se o cancelamento vencer a ativação entre os dois bancos', async () => {
  const f = await fixture();
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, {
    financeDatabase: f.finance.db,
    financeClient: f.finance.client,
    apiKey: 'synthetic-test-key',
  });
  const original = AgenticWorkspaceRepository.prototype.getExecution;
  let cancelled = false;
  vi.spyOn(AgenticWorkspaceRepository.prototype, 'getExecution').mockImplementation(async function (identity, id) {
    const execution = await original.call(this, identity, id);
    // The financial store reads the application store outside its transaction.
    if (!cancelled && (this as unknown as { db: unknown }).db === f.app.db && execution?.status === 'QUEUED') {
      cancelled = true;
      await pilot.service.store.atomic(owner, async (store) => {
        await store.workspace.compareAndSetStatus(owner, id, 'QUEUED', 'CANCELLED');
        const job = await store.getJob(owner, id);
        await store.saveJob({ ...job, state: 'CANCELLED', budgetReleasePending: false });
      });
    }
    return execution;
  });
  const run = await pilot.start(owner, 'cancel-race', { caseId: 'T6-MIN', maxCostCents: 50, confirmed: true });
  expect(cancelled).toBe(true);
  expect(run.status).toBe('CANCELLED');
  expect(await pilot.summary(owner)).toMatchObject({ availableCents: 441, escrowCents: 0 });
});
async function fixture(withHistory = true) {
  const app = await createDatabase({ url: 'file::memory:' });
  const finance = await createDatabase({ url: 'file::memory:' });
  connections.push(app, finance);
  for (const c of [app, finance]) {
    await runPersistenceMigrations(c.client);
    await new LedgerService(c.db, c.client).runMigrations();
  }
  if (withHistory) {
    // Test-only simulation of the already spent history. Runtime never provisions funds.
    await new LedgerService(finance.db, finance.client).provisionAccount(funding.tenantId, {
      paidBalanceCents: 441,
      promotionalBalanceCents: 0,
    });
    await finance.client.execute({
      sql: 'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)',
      args: [
        'historical',
        funding.tenantId,
        funding.userId,
        'history-execution',
        'historical-key',
        JSON.stringify({
          ...funding,
          id: 'historical',
          executionId: 'history-execution',
          idempotencyKey: 'historical-key',
          remainingPaidCents: 0,
          remainingPromoCents: 0,
          consumedCents: 55,
          provisionedCents: 4,
          policy: { id: 'boni-synthetic-task6' },
          status: 'RELEASED',
        }),
      ],
    });
    for (const old of history.observations) {
      await finance.client.execute({
        sql: 'INSERT INTO inference_calls VALUES(?,?,?,?,?,?)',
        args: [
          old.callId,
          funding.tenantId,
          old.executionId,
          old.callId,
          old.callId,
          JSON.stringify({
            ...funding,
            id: old.callId,
            executionId: old.executionId,
            callId: old.callId,
            kind: 'PROVIDER',
            status: old.status === 'SETTLED' ? 'SETTLED' : 'PROVISIONED',
            ...(old.status === 'SETTLED'
              ? { settlement: { actualCostCents: old.costCents } }
              : { provision: { amountCents: 4, actualCostCents: null, usage: null } }),
          }),
        ],
      });
    }
  }
  return { app, finance };
}

it('não habilita executor sem identidade de Boni explicitamente configurada', async () => {
  const f = await fixture(false);
  await expect(
    createClosedPilot(
      f.app.db,
      f.app.client,
      { ...env, FORGELEX_CLOSED_PILOT_USER_ID: '' },
      { financeDatabase: f.finance.db, financeClient: f.finance.client, apiKey: 'synthetic-test-key' },
    ),
  ).rejects.toThrow('CLOSED_PILOT_CONFIGURATION_REQUIRED');
});

it('recusa ledger novo e não concede outros US$ 5,00', async () => {
  const f = await fixture(false);
  await expect(
    createClosedPilot(f.app.db, f.app.client, env, {
      financeDatabase: f.finance.db,
      financeClient: f.finance.client,
      apiKey: 'synthetic-test-key',
    }),
  ).rejects.toThrow('CLOSED_PILOT_HISTORY_REQUIRED');
  expect((await f.finance.client.execute('SELECT * FROM ledger_accounts')).rows).toHaveLength(0);
});

it('mantém os 59 centavos históricos e reserva/retry/cancela sem tocar no billing da aplicação', async () => {
  const f = await fixture();
  const dependencies = { financeDatabase: f.finance.db, financeClient: f.finance.client, apiKey: 'synthetic-test-key' };
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, dependencies);
  expect(await pilot.summary(owner)).toMatchObject({
    currency: 'USD',
    ceilingCents: 500,
    availableCents: 441,
    settledCents: 55,
    provisionedCents: 4,
    escrowCents: 0,
    invoiceReconciled: false,
  });
  await expect(pilot.summary({ ...owner, userId: 'another' })).rejects.toThrow('CLOSED_PILOT_FORBIDDEN');
  const input = { caseId: 'T6-CONTEXT', maxCostCents: 50, confirmed: true };
  const run = await pilot.start(owner, 'same-key', input);
  const restarted = await createClosedPilot(f.app.db, f.app.client, env, dependencies);
  expect((await restarted.start(owner, 'same-key', input)).id).toBe(run.id);
  await expect(restarted.start(owner, 'same-key', { ...input, maxCostCents: 51 })).rejects.toThrow(
    'IDEMPOTENCY_CONFLICT',
  );
  expect(await restarted.summary(owner)).toMatchObject({ availableCents: 391, escrowCents: 50 });
  expect((await f.app.client.execute('SELECT id FROM matters')).rows).toHaveLength(1);
  expect((await f.app.client.execute('SELECT id FROM legal_documents')).rows).toHaveLength(2);
  expect((await f.app.client.execute('SELECT id FROM ledger_accounts')).rows).toHaveLength(0);
  await restarted.service.cancelExecution(owner, run.id, 'cancel');
  expect(await restarted.summary(owner)).toMatchObject({ availableCents: 441, escrowCents: 0, provisionedCents: 4 });
});

it('exige confirmação e casos fixos; rejeita instruções, modelo e tarifas do cliente', async () => {
  const f = await fixture();
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, {
    financeDatabase: f.finance.db,
    financeClient: f.finance.client,
    apiKey: 'synthetic-test-key',
  });
  for (const input of [
    { caseId: 'T6-MIN', maxCostCents: 50, confirmed: false },
    { caseId: 'T6-MIN', maxCostCents: 501, confirmed: true },
    { caseId: 'T6-MIN', maxCostCents: 50, confirmed: true, objective: 'Send private data' },
    { caseId: 'T6-MIN', maxCostCents: 50, confirmed: true, model: 'other' },
    { caseId: 'PRIVATE', maxCostCents: 50, confirmed: true },
  ])
    await expect(pilot.start(owner, 'rejected', input)).rejects.toThrow();
  expect((await f.app.client.execute('SELECT id FROM agentic_executions')).rows).toHaveLength(0);
});

it('liga o executor pelo buildApp e protege os endpoints de autorização e consumo', async () => {
  const f = await fixture();
  const principal = {
    ...owner,
    subjectId: 'verified-subject',
    roles: ['owner'],
    scopes: ['research:read', 'matter:read', 'matter:write', 'draft:write'],
    authMethod: 'session' as const,
  };
  const app = await buildApp({
    database: f.app.db,
    databaseClient: f.app.client,
    ledgerService: new LedgerService(f.app.db, f.app.client),
    environment: { NODE_ENV: 'test', ...env },
    agenticWorkspace: { scheduler: false },
    authAdapter: new AuthAdapter({
      verify: async (token) =>
        token === 'boni' ? principal : token === 'other' ? { ...principal, userId: 'not-boni' } : null,
    }),
    closedPilotDependencies: {
      financeDatabase: f.finance.db,
      financeClient: f.finance.client,
      apiKey: 'synthetic-test-key',
    },
  });
  try {
    const headers = { authorization: 'Bearer boni', 'idempotency-key': 'api-consent' };
    expect((await app.inject({ url: '/api/agentic/actions', headers })).json()).toMatchObject({
      available: true,
      closedPilot: true,
    });
    expect(
      (await app.inject({ url: '/api/agentic/pilot/budget', headers: { authorization: 'Bearer other' } })).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/agentic/executions',
          headers,
          payload: { objective: 'Conteúdo não autorizado' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/agentic/pilot/executions',
          headers,
          payload: { caseId: 'T6-MIN', maxCostCents: 20, confirmed: false },
        })
      ).statusCode,
    ).toBe(400);
    const request = {
      method: 'POST' as const,
      url: '/api/agentic/pilot/executions',
      headers,
      payload: { caseId: 'T6-MIN', maxCostCents: 20, confirmed: true },
    };
    const started = await app.inject(request);
    expect(started.statusCode, started.body).toBe(202);
    expect((await app.inject(request)).json().id).toBe(started.json().id);
    expect((await app.inject({ url: '/api/agentic/pilot/budget', headers })).json()).toMatchObject({
      availableCents: 421,
      escrowCents: 20,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/agentic/executions/${started.json().id}/continue`,
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const cancelled = await app.inject({
      method: 'POST',
      url: `/api/agentic/executions/${started.json().id}/cancel`,
      headers: { ...headers, 'idempotency-key': 'api-cancel' },
      payload: {},
    });
    expect(cancelled.statusCode, cancelled.body).toBe(200);
    expect((await app.inject({ url: '/api/agentic/pilot/budget', headers })).json()).toMatchObject({
      availableCents: 441,
      escrowCents: 0,
    });
  } finally {
    await app.close();
  }
});

it('o transporte real limitado reserva antes do HTTP, liquida usage e bloqueia contexto fora da seleção', async () => {
  const f = await fixture();
  let requests = 0;
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, {
    financeDatabase: f.finance.db,
    financeClient: f.finance.client,
    apiKey: 'synthetic-test-key',
    transport: async (_url, init) => {
      requests++;
      expect((await pilot.summary(owner)).escrowCents).toBe(50);
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'gpt-6.1-sol',
        store: false,
        service_tier: 'default',
        max_output_tokens: 2048,
      });
      return new Response(
        'data: ' +
          JSON.stringify({
            type: 'response.completed',
            response: {
              id: 'synthetic-response',
              model: 'gpt-6.1-sol',
              service_tier: 'default',
              usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 } },
            },
          }) +
          '\n\n',
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  const run = await pilot.start(owner, 'transport', { caseId: 'T6-MIN', maxCostCents: 50, confirmed: true });
  const lease = await pilot.service.claimNext('worker');
  await pilot.service.beginStep(lease!, 'transport-step');
  const fetch = pilot.providerRuntime.fetchFor(run.id);
  await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, tools: [] }),
  });
  expect(requests).toBe(1);
  expect(await pilot.summary(owner)).toMatchObject({ settledCents: 56, escrowCents: 49, provisionedCents: 4 });
  const packet = {
    contextId: run.conversationId,
    contextRevision: 1,
    sources: [{ kind: 'DOCUMENT', text: 'private' }],
    answers: [],
  };
  await expect(
    pilot.providerRuntime.fetchFor(run.id, packet as never)('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, tools: [] }),
    }),
  ).rejects.toThrow('CLOSED_PILOT_SYNTHETIC_ONLY');
  expect(requests).toBe(1);
  await pilot.service.finishStep(lease!, 'transport-step', { kind: 'completed', checkpoint: {} });
  expect(await pilot.summary(owner)).toMatchObject({ availableCents: 440, escrowCents: 0, settledCents: 56 });
});

it('não gasta além do saldo remanescente e detecta reposição indevida', async () => {
  const f = await fixture();
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, {
    financeDatabase: f.finance.db,
    financeClient: f.finance.client,
    apiKey: 'synthetic-test-key',
  });
  await expect(
    pilot.start(owner, 'too-much', { caseId: 'T6-MIN', maxCostCents: 442, confirmed: true }),
  ).rejects.toThrow('BILLING_INSUFFICIENT_BALANCE');
  expect(await pilot.summary(owner)).toMatchObject({ availableCents: 441, escrowCents: 0 });
  await f.finance.client.execute('UPDATE ledger_accounts SET paid_balance_cents=500');
  await expect(pilot.summary(owner)).rejects.toThrow('CLOSED_PILOT_BUDGET_INVARIANT');
});

it('preserva reserva incerta no cancelamento e suspende novos envios sem usage', async () => {
  const f = await fixture();
  let requests = 0;
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, {
    financeDatabase: f.finance.db,
    financeClient: f.finance.client,
    apiKey: 'synthetic-test-key',
    transport: async () => {
      requests++;
      throw new Error('synthetic timeout');
    },
  });
  const run = await pilot.start(owner, 'uncertain', { caseId: 'T6-MIN', maxCostCents: 50, confirmed: true });
  const lease = await pilot.service.claimNext('worker');
  await pilot.service.beginStep(lease!, 'uncertain-step');
  await expect(
    pilot.providerRuntime.fetchFor(run.id)('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-6.1-sol', stream: true, tools: [] }),
    }),
  ).rejects.toThrow('PILOT_TRANSPORT_FAILED');
  const before = await pilot.summary(owner);
  expect(before).toMatchObject({ availableCents: 391, escrowCents: 50, reconciliationRequired: true });
  await pilot.service.cancelExecution(owner, run.id, 'cancel-uncertain');
  const after = await pilot.summary(owner);
  expect(after.reconciliationRequired).toBe(true);
  expect(after.escrowCents).toBeGreaterThan(0);
  expect(after.availableCents + after.escrowCents + after.settledCents + after.provisionedCents).toBe(500);
  expect(after.provisionedCents).toBe(4);
  await expect(pilot.start(owner, 'blocked', { caseId: 'T6-MIN', maxCostCents: 10, confirmed: true })).rejects.toThrow(
    'CLOSED_PILOT_RECONCILIATION_REQUIRED',
  );
  expect(requests).toBe(1);
});

it('executa worker, driver e OpenAI SDK reais com SSE sintético e pergunta persistida', async () => {
  const f = await fixture();
  let requests = 0;
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, {
    financeDatabase: f.finance.db,
    financeClient: f.finance.client,
    apiKey: 'synthetic-test-key',
    transport: async (_url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('gpt-6.1-sol');
      expect(
        body.tools.every(
          (t: { type: string; name: string }) =>
            t.type === 'function' &&
            ['forgelex_case_read_selected', 'forgelex_task_get_sources', 'forgelex_task_submit'].includes(t.name),
        ),
      ).toBe(true);
      const plan = {
        action: 'create_document',
        requiresCaseLaw: false,
        requiresNorms: false,
        requiresProcedure: false,
        issues: [{ id: 'goal', statement: 'Objetivo sintético', sourceIds: [] }],
        gaps: [
          {
            key: 'purpose',
            kind: 'MISSING',
            material: true,
            prompt: 'Qual finalidade sintética?',
            reason: 'Dado ausente',
            sourceIds: [],
            options: [{ id: 'investigate', label: 'Investigar' }],
          },
        ],
      };
      const item = {
        id: 'fc_synthetic',
        type: 'function_call',
        call_id: 'call_synthetic',
        name: 'forgelex_task_submit',
        arguments: JSON.stringify(plan),
        status: 'completed',
      };
      const message = {
        id: 'msg_synthetic',
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'OK', annotations: [] }],
      };
      const events =
        requests === 1
          ? [
              {
                type: 'response.output_item.added',
                output_index: 0,
                item: { ...item, arguments: '', status: 'in_progress' },
              },
              {
                type: 'response.function_call_arguments.delta',
                item_id: item.id,
                output_index: 0,
                delta: item.arguments,
              },
              {
                type: 'response.function_call_arguments.done',
                item_id: item.id,
                output_index: 0,
                arguments: item.arguments,
              },
              { type: 'response.output_item.done', output_index: 0, item },
            ]
          : [
              { type: 'response.output_item.added', output_index: 0, item: message } as never,
              { type: 'response.output_item.done', output_index: 0, item: message } as never,
            ];
      events.push({
        type: 'response.completed',
        response: {
          id: `resp_synthetic_${requests}`,
          object: 'response',
          status: 'completed',
          model: 'gpt-6.1-sol',
          output: requests === 1 ? [item] : [message],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 } },
        },
      } as never);
      return new Response(events.map((event) => 'data: ' + JSON.stringify(event) + '\n\n').join(''), {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  const run = await pilot.start(owner, 'sdk', { caseId: 'T6-GAP', maxCostCents: 50, confirmed: true });
  const { driver } = createCaseTaskDriver(f.app.db, f.app.client, pilot.caseTask);
  let failure: unknown;
  await new ExecutionWorker(pilot.service, {
    next: (context) => {
      const step = driver.next(context);
      return (
        step && {
          ...step,
          run: async (args) => {
            try {
              return await step.run(args);
            } catch (error) {
              failure = error;
              throw error;
            }
          },
        }
      );
    },
  }).runOnce();
  const current = await pilot.service.getExecution(owner, run.id);
  expect(current.status, String(failure)).toBe('WAITING_USER');
  expect(requests).toBe(2);
  expect(pilot.providerRuntime.observations).toHaveLength(2);
  expect(await pilot.summary(owner)).toMatchObject({
    settledCents: 57,
    provisionedCents: 4,
    reconciliationRequired: false,
  });
  await pilot.service.cancelExecution(owner, run.id, 'sdk-cancel');
  expect(await pilot.summary(owner)).toMatchObject({ availableCents: 439, escrowCents: 0 });
});

it('pausa após crash com chamada autorizada sem liquidação, inclusive após reconstrução', async () => {
  const f = await fixture();
  const dependencies = { financeDatabase: f.finance.db, financeClient: f.finance.client, apiKey: 'synthetic-test-key' };
  const pilot = await createClosedPilot(f.app.db, f.app.client, env, dependencies);
  const run = await pilot.start(owner, 'crash', { caseId: 'T6-MIN', maxCostCents: 50, confirmed: true });
  const lease = await pilot.service.claimNext('crashing-worker');
  await pilot.service.beginStep(lease!, 'crashing-step');
  const finance = createClosedFinance(f.finance.db, f.finance.client, f.app.db, owner, history.observations);
  await finance.gateway.authorizeProviderCall(owner, run.id, {
    callId: 'crashed-http',
    upperBoundCents: 4,
    inputTokens: 100,
    maxOutputTokens: 2048,
  });
  await pilot.service.failLease(lease!, 'EXECUTION_FAILED');
  const restarted = await createClosedPilot(f.app.db, f.app.client, env, dependencies);
  expect(await restarted.summary(owner)).toMatchObject({
    reconciliationRequired: true,
    escrowCents: 4,
    availableCents: 437,
  });
  await expect(
    restarted.start(owner, 'after-crash', { caseId: 'T6-MIN', maxCostCents: 10, confirmed: true }),
  ).rejects.toThrow('CLOSED_PILOT_RECONCILIATION_REQUIRED');
});
