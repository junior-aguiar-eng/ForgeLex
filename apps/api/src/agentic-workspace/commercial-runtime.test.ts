import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, AgenticWorkspaceRepository } from '@forgelex/persistence';
import { LedgerService, COMMERCIAL_POLICY_VERSION } from '@forgelex/billing-ledger';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { registerAgenticWorkspace } from './execution-routes.js';
import { createCommercialRuntime } from './commercial-runtime.js';
import { ExecutionWorker } from './execution-worker.js';
import { ExecutionService } from './execution-service.js';
import { ExecutionStore } from './execution-store.js';

const owner = { tenantId: 'commercial', userId: 'boni' };
const env = {
  FORGELEX_COMMERCIAL_EXECUTION_ENABLED: 'true',
  FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true',
  FORGELEX_DATABASE_URL: 'file:synthetic-commercial-test.sqlite',
};
const headers = { authorization: 'Bearer owner', 'idempotency-key': 'commercial-start' };
const input = { objective: 'Analisar texto sintético', confirmed: true, policyVersion: COMMERCIAL_POLICY_VERSION };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function fixture() {
  const c = await createDatabase({ url: 'file::memory:' });
  cleanup.push(async () => c.client.close());
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.runMigrations();
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 2000, promotionalBalanceCents: 0 });
  const transport = vi.fn(async () => {
    throw new Error('must not send');
  });
  const authorizeOwner = vi.fn(async () => {});
  const commercial = await createCommercialRuntime(c.db, c.client, env, {
    apiKey: 'synthetic-key',
    authorizeOwner,
    transport,
  });
  const auth = new AuthAdapter({
    verify: async (token) =>
      token === 'owner'
        ? {
            ...owner,
            subjectId: 'boni',
            roles: ['lawyer'],
            scopes: ['research:read', 'matter:read'],
            authMethod: 'session',
          }
        : null,
  });
  const app = Fastify();
  const runtime = registerAgenticWorkspace(app, {
    database: c.db,
    client: c.client,
    auth,
    environment: env,
    options: { commercial, scheduler: false },
  })!;
  cleanup.unshift(async () => {
    await runtime.worker?.stop();
    await app.close();
  });
  await app.ready();
  return { ...c, app, commercial, transport, authorizeOwner, worker: runtime.worker! };
}
it('factory is closed without both flags, durable storage and key', async () => {
  const f = await fixture();
  for (const environment of [
    { ...env, FORGELEX_COMMERCIAL_EXECUTION_ENABLED: 'false' },
    { ...env, FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'false' },
    { ...env, FORGELEX_DATABASE_URL: 'file::memory:' },
  ])
    await expect(createCommercialRuntime(f.db, f.client, environment, { apiKey: 'synthetic' })).rejects.toThrow(
      'COMMERCIAL_CONFIGURATION_REQUIRED',
    );
  await expect(createCommercialRuntime(f.db, f.client, env, { apiKey: '' })).rejects.toThrow('COMMERCIAL_KEY_REQUIRED');
});
it('requires a session and exact price confirmation before any reservation', async () => {
  const f = await fixture();
  expect((await f.app.inject({ method: 'GET', url: '/api/agentic/commercial/quote' })).statusCode).toBe(401);
  expect((await f.app.inject({ method: 'GET', url: '/api/agentic/actions', headers })).json()).toMatchObject({
    commercial: true,
  });
  expect((await f.app.inject({ method: 'GET', url: '/api/agentic/commercial/quote', headers })).json()).toMatchObject({
    currency: 'BRL',
    maxCostCents: 500,
    availableCents: 2000,
  });
  for (const body of [{ objective: 'texto' }, { ...input, policyVersion: 'old' }])
    expect(
      (await f.app.inject({ method: 'POST', url: '/api/agentic/commercial/executions', headers, payload: body }))
        .statusCode,
    ).toBe(400);
  expect(await f.commercial.finance.listActive(owner)).toEqual([]);
  expect(f.transport).not.toHaveBeenCalled();
});
it('persists reservation before enabling work; cancellation releases without HTTP and receipt is owner-bound', async () => {
  const f = await fixture();
  const response = await f.app.inject({
    method: 'POST',
    url: '/api/agentic/commercial/executions',
    headers,
    payload: input,
  });
  expect(response.statusCode).toBe(202);
  const run = response.json();
  expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({ reservedCents: 500, status: 'ACTIVE' });
  expect((await f.commercial.service.store.getJob(owner, run.id)).state).toBe('READY');
  const replay = await f.app.inject({
    method: 'POST',
    url: '/api/agentic/commercial/executions',
    headers,
    payload: input,
  });
  expect(replay.json().id).toBe(run.id);
  expect(
    (
      await f.app.inject({
        method: 'POST',
        url: `/api/agentic/executions/${run.id}/cancel`,
        headers: { ...headers, 'idempotency-key': 'cancel' },
        payload: {},
      })
    ).statusCode,
  ).toBe(200);
  const receipt = await f.app.inject({
    method: 'GET',
    url: `/api/agentic/commercial/executions/${run.id}/receipt`,
    headers,
  });
  expect(receipt.json()).toMatchObject({ chargedCents: 0, releasedCents: 500, status: 'CANCELLED', currency: 'BRL' });
  expect(await f.commercial.finance.getReceipt({ ...owner, userId: 'other' }, run.id)).toBeUndefined();
  expect(f.transport).not.toHaveBeenCalled();
});
it('continuation requires fresh consent, ID and reservation before worker dispatch', async () => {
  const f = await fixture();
  const first = await f.commercial.start(owner, 'first', input);
  await f.commercial.service.cancelExecution(owner, first.id, 'cancel');
  const url = `/api/agentic/executions/${first.id}/continue`;
  expect((await f.app.inject({ method: 'POST', url, headers, payload: {} })).statusCode).toBe(400);
  const next = await f.app.inject({
    method: 'POST',
    url,
    headers: { ...headers, 'idempotency-key': 'continue' },
    payload: { confirmed: true, policyVersion: COMMERCIAL_POLICY_VERSION },
  });
  expect(next.statusCode).toBe(202);
  expect(next.json().id).not.toBe(first.id);
  expect(await f.commercial.finance.getReceipt(owner, next.json().id)).toMatchObject({
    status: 'ACTIVE',
    reservedCents: 500,
  });
  expect((await f.commercial.service.store.getJob(owner, next.json().id)).state).toBe('READY');
});
it('a human question releases no-delivery funds and its answer reserves a fresh authorized ID', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'ask', input);
  const lease = (await f.commercial.service.claimNext('question-worker'))!;
  await f.commercial.service.beginStep(lease, 'question');
  await f.commercial.service.finishStep(lease, 'question', {
    kind: 'question',
    checkpoint: {},
    question: {
      id: 'purpose',
      version: 1,
      contextRevision: 1,
      prompt: 'Qual finalidade?',
      selection: 'single',
      options: [{ id: 'review', label: 'Revisar' }],
      allowFreeText: true,
      allowUnknown: true,
      reason: 'Delimitar',
    },
  });
  expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({
    chargedCents: 0,
    releasedCents: 500,
    status: 'CANCELLED',
  });
  const answer = {
    questionId: 'purpose',
    questionVersion: 1,
    contextRevision: 1,
    selectedOptionIds: ['review'],
    unknown: false,
  };
  const next = await f.commercial.successor(owner, run.id, 'answer', 'answer', {
    ...answer,
    confirmed: true,
    policyVersion: COMMERCIAL_POLICY_VERSION,
  });
  expect(next.id).not.toBe(run.id);
  expect(await f.commercial.finance.getReceipt(owner, next.id)).toMatchObject({ reservedCents: 500, status: 'ACTIVE' });
  expect((await new AgenticWorkspaceRepository(f.db).getExecution(owner, next.id))?.authorizationId).toMatch(
    /^commercial:/,
  );
});
it('restart cancels a reserved orphan that never reached activation and releases its funds', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'orphan', input);
  await f.commercial.service.store.atomic(owner, async (store) => {
    const job = await store.getJob(owner, run.id);
    await store.saveJob({ ...job, state: 'WAITING', admissionExpiresAt: '2000-01-01T00:00:00.000Z' });
  });
  const recovered = await createCommercialRuntime(f.db, f.client, env, {
    apiKey: 'synthetic',
    authorizeOwner: async () => {},
  });
  await recovered.recover();
  expect(await recovered.finance.getReceipt(owner, run.id)).toMatchObject({
    releasedCents: 500,
    chargedCents: 0,
    status: 'CANCELLED',
  });
  expect((await recovered.service.getExecution(owner, run.id)).status).toBe('CANCELLED');
});
it('a second instance preserves a healthy admission paused before reserve', async () => {
  const f = await fixture();
  let unblock!: () => void, reached!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const started = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const reserve = f.commercial.finance.reserve.bind(f.commercial.finance);
  vi.spyOn(f.commercial.finance, 'reserve').mockImplementationOnce(async (...args) => {
    reached();
    await gate;
    return reserve(...args);
  });
  const pending = f.commercial.start(owner, 'healthy-admission', input);
  await started;
  const second = await createCommercialRuntime(f.db, f.client, env, {
    apiKey: 'synthetic',
    authorizeOwner: async () => {},
  });
  await second.recover();
  unblock();
  const run = await pending;
  expect(run.status).toBe('QUEUED');
  expect(await second.finance.getReceipt(owner, run.id)).toMatchObject({ status: 'ACTIVE', releasedCents: 0 });
});
it('a failed admission replay cannot cancel another replay activated before cleanup commits', async () => {
  const f = await fixture();
  let admittedId: string | undefined;
  const atomic = f.commercial.service.store.atomic.bind(f.commercial.service.store);
  vi.spyOn(f.commercial.finance, 'reserve').mockImplementationOnce(async () => {
    vi.spyOn(f.commercial.service.store, 'atomic').mockImplementationOnce(async (identity, action) => {
      admittedId = (await f.commercial.start(owner, 'parallel-replay', input)).id;
      return atomic(identity, action);
    });
    throw new Error('TRANSIENT_RESERVATION_FAILURE');
  });
  await expect(f.commercial.start(owner, 'parallel-replay', input)).rejects.toThrow('TRANSIENT_RESERVATION_FAILURE');
  expect(admittedId).toBeDefined();
  expect((await f.commercial.service.getExecution(owner, admittedId!)).status).toBe('QUEUED');
  expect((await f.commercial.service.store.getJob(owner, admittedId!)).state).toBe('READY');
  expect(await f.commercial.finance.getReceipt(owner, admittedId!)).toMatchObject({
    status: 'ACTIVE',
    releasedCents: 0,
  });
});
it.each(['READY', 'LEASED'] as const)(
  'recovery atomically preserves admission activated after its stale %s snapshot',
  async (state) => {
    const f = await fixture();
    const run = await f.commercial.start(owner, 'activation-race', input);
    const other = new ExecutionStore(f.db);
    await other.atomic(owner, async (store) => {
      const job = await store.getJob(owner, run.id);
      await store.saveJob({ ...job, state: 'WAITING', admissionExpiresAt: '2000-01-01T00:00:00.000Z' });
    });
    const atomic = f.commercial.service.store.atomic.bind(f.commercial.service.store);
    vi.spyOn(f.commercial.service.store, 'atomic').mockImplementationOnce(async (identity, action) => {
      await other.atomic(owner, async (store) => {
        const job = await store.getJob(owner, run.id);
        await store.saveJob({ ...job, state });
        if (state === 'LEASED') await store.workspace.compareAndSetStatus(owner, run.id, 'QUEUED', 'RUNNING');
      });
      return atomic(identity, action);
    });
    await f.commercial.recover();
    expect((await f.commercial.service.getExecution(owner, run.id)).status).toBe(
      state === 'LEASED' ? 'RUNNING' : 'QUEUED',
    );
    expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({ status: 'ACTIVE', releasedCents: 0 });
  },
);
it('an already-running scheduler releases an expired admission without a restart', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'expired-admission', input);
  await f.commercial.service.store.atomic(owner, async (store) => {
    const job = await store.getJob(owner, run.id);
    await store.saveJob({ ...job, state: 'WAITING', admissionExpiresAt: '2000-01-01T00:00:00.000Z' });
  });
  const app = Fastify();
  const auth = new AuthAdapter({ verify: async () => null });
  const runtime = registerAgenticWorkspace(app, {
    database: f.db,
    client: f.client,
    auth,
    environment: env,
    options: { commercial: f.commercial, pollMs: 10 },
  })!;
  cleanup.unshift(async () => {
    await runtime.worker?.stop();
    await app.close();
  });
  await app.ready();
  await vi.waitFor(
    async () =>
      expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({
        status: 'CANCELLED',
        chargedCents: 0,
        releasedCents: 500,
      }),
    { timeout: 1000 },
  );
  expect(f.transport).not.toHaveBeenCalled();
});
it('restart never replays an uncertain dispatched step and releases a no-delivery reservation', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'uncertain', input);
  const lease = (await f.commercial.service.claimNext('lost-worker'))!;
  await f.commercial.service.beginStep(lease, 'lost-step');
  await f.commercial.finance.authorizeCall(owner, run.id, {
    callId: 'lost-http',
    inputTokens: 1000,
    maxOutputTokens: 2048,
    upperBoundMicroUsd: 22480,
  });
  await f.commercial.service.store.atomic(owner, async (store) => {
    const job = await store.getJob(owner, run.id);
    await store.saveJob({ ...job, leaseExpiresAt: '2000-01-01T00:00:00.000Z' });
  });
  await f.worker.runOnce();
  expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({
    status: 'FAILED',
    chargedCents: 0,
    releasedCents: 500,
    uncertainMicroUsd: 22480,
  });
  expect(f.transport).not.toHaveBeenCalled();
});
it('current owner revocation blocks provider dispatch and closes zero-charge work', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'revoke', input);
  f.authorizeOwner.mockRejectedValue(new Error('ACCESS_REVOKED'));
  await f.worker.runOnce();
  expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({
    status: 'FAILED',
    chargedCents: 0,
    releasedCents: 500,
  });
  expect(f.transport).not.toHaveBeenCalled();
});
it('commercial mode cannot cancel historical executions owned by the same user', async () => {
  const f = await fixture();
  const repo = new AgenticWorkspaceRepository(f.db);
  const legacy = await new ExecutionService(f.db, f.client, { executorAvailable: true }).startExecution(
    owner,
    'historical',
    { objective: 'Histórico' },
    { authorizationId: 'historical-pilot', provider: 'openai', model: 'gpt-6.1-sol' },
  );
  const response = await f.app.inject({
    method: 'POST',
    url: `/api/agentic/executions/${legacy.id}/cancel`,
    headers,
    payload: {},
  });
  expect(response.statusCode).toBe(404);
  expect((await repo.getExecution(owner, legacy.id))?.status).toBe('QUEUED');
});
it('reordered request keys replay the admitted execution; changed input cannot cancel it', async () => {
  const f = await fixture();
  const first = await f.app.inject({
    method: 'POST',
    url: '/api/agentic/commercial/executions',
    headers,
    payload: input,
  });
  const id = first.json().id;
  const reordered = { policyVersion: input.policyVersion, confirmed: true, objective: input.objective };
  const replay = await f.app.inject({
    method: 'POST',
    url: '/api/agentic/commercial/executions',
    headers,
    payload: reordered,
  });
  expect(replay.statusCode).toBe(202);
  expect(replay.json().id).toBe(id);
  const conflict = await f.app.inject({
    method: 'POST',
    url: '/api/agentic/commercial/executions',
    headers,
    payload: { ...input, objective: 'Outro pedido' },
  });
  expect(conflict.statusCode).toBe(409);
  expect((await f.commercial.service.getExecution(owner, id)).status).toBe('QUEUED');
  expect(await f.commercial.finance.getReceipt(owner, id)).toMatchObject({
    status: 'ACTIVE',
    chargedCents: 0,
    releasedCents: 0,
  });
});
it('active work deadline aborts an in-flight step and releases its no-delivery reservation', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'timeout', input);
  let aborted = false;
  const worker = new ExecutionWorker(
    f.commercial.service,
    {
      next: () => ({
        callId: 'slow',
        run: async ({ signal }) => {
          await new Promise<void>((_resolve, reject) =>
            signal.addEventListener(
              'abort',
              () => {
                aborted = true;
                reject(new Error('DEADLINE_EXCEEDED'));
              },
              { once: true },
            ),
          );
          return { kind: 'completed', checkpoint: {} };
        },
      }),
    },
    { maxDurationMs: 10 },
  );
  await worker.runOnce();
  expect(aborted).toBe(true);
  expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({
    status: 'FAILED',
    chargedCents: 0,
    releasedCents: 500,
  });
});
