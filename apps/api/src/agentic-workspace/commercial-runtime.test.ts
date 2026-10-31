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
import { NativeCaseContextService } from '@forgelex/legal-tools';
import { AgenticTaskDeliverySchema } from '@forgelex/domain';
import { AccountClosurePurgeService } from '../account/account-closure-purge-service.js';
import { AccountClosureBillingRetention } from '../account/account-closure-billing-retention.js';

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
it.each([
  ['create_document', false, false, 0],
  ['create_document', true, false, 50],
  ['analyze_documents', false, true, 50],
  ['review_text', false, false, 0],
  ['review_text', false, 'finding', 50],
  ['review_text', false, 'refusal', 0],
  ['analyze_documents', false, 'gap', 0],
  ['analyze_documents', false, 'issues', 0],
] as const)(
  'charges only concrete persisted %s results (document=%s, claims=%s)',
  async (actionId, document, claims, charge) => {
    const f = await fixture();
    const run = await f.commercial.start(owner, 'delivery', {
      ...input,
      actionId,
      context: { text: 'O instrumento prevê duas datas de pagamento incompatíveis.', origin: 'USER', documents: [] },
    });
    const lease = (await f.commercial.service.claimNext('delivery-worker'))!;
    await f.commercial.service.beginStep(lease, 'delivery-step');
    await f.commercial.finance.authorizeCall(owner, run.id, {
      callId: 'http',
      inputTokens: 1000,
      maxOutputTokens: 1000,
      upperBoundMicroUsd: 12000,
    });
    await f.commercial.finance.settleCall(owner, run.id, 'http', { inputTokens: 1000, outputTokens: 1000 });
    const native = new NativeCaseContextService(f.db, async () => {});
    const binding = {
      ...owner,
      executionId: run.id,
      conversationId: run.conversationId,
      contextRevision: run.contextRevision,
      objective: input.objective,
      actionId,
    };
    const packet = await native.load(binding);
    const sourceIds = packet.sources.map((s) => s.id);
    const delivery = AgenticTaskDeliverySchema.parse({
      action: actionId,
      contextId: run.conversationId,
      contextRevision: run.contextRevision,
      status: 'LIMITED',
      humanReviewRequired: true,
      issues: claims === 'issues' ? [{ id: 'planned', statement: 'Qual a data de pagamento?', sourceIds }] : [],
      requirements: [],
      sources: packet.sources.map(({ text: _text, ...s }) => s),
      claims:
        claims === true
          ? [
              {
                id: 'claim',
                classification: 'INFERENCE',
                statement: 'O texto contém obrigações contraditórias.',
                sourceIds,
              },
            ]
          : [],
      findings: [
        {
          id: 'gap',
          code:
            claims === 'finding'
              ? 'CONTRADICTORY_DATES'
              : claims === 'refusal'
                ? 'TASK_REFUSED'
                : 'DOCUMENT_NOT_PRODUCED',
          severity: 'BLOCKING',
          statement:
            claims === 'finding'
              ? 'O instrumento apresenta duas datas incompatíveis para a mesma obrigação.'
              : 'Faltam elementos para concluir.',
          sourceIds: typeof claims === 'string' ? sourceIds : [],
        },
      ],
      ...(document
        ? {
            document: {
              title: 'Minuta parcial',
              documentType: 'Parecer',
              sections: [{ title: 'Objeto', content: 'Exame preliminar da obrigação descrita.', sourceIds: [] }],
            },
          }
        : {}),
    });
    const saved = await native.save(binding, delivery);
    await f.commercial.service.finishStep(lease, 'delivery-step', {
      kind: 'completed',
      checkpoint: {},
      deliveryIds: [saved.id],
    });
    expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({
      status: 'COMPLETED',
      measuredMicroUsd: 12000,
      chargedCents: charge,
      releasedCents: 500 - charge,
    });
    expect((await native.getDelivery(owner, saved.id)).delivery.humanReviewRequired).toBe(true);
  },
);

it.each(['question', 'reconciliation', 'held-question'] as const)(
  'closed commercial %s can drain and purge without identity interaction',
  async (kind) => {
    const f = await fixture();
    const run = await f.commercial.start(owner, 'closure', input);
    const lease = (await f.commercial.service.claimNext('closure-worker'))!;
    await f.commercial.service.beginStep(lease, 'step');
    if (kind !== 'reconciliation') {
      await f.commercial.service.finishStep(lease, 'step', {
        kind: 'question',
        checkpoint: {},
        question: {
          id: 'purpose',
          version: 1,
          contextRevision: 1,
          prompt: 'Finalidade?',
          selection: 'free_text',
          options: [],
          allowFreeText: true,
          allowUnknown: true,
          reason: 'Delimitar',
        },
      });
    } else {
      await f.commercial.finance.authorizeCall(owner, run.id, {
        callId: 'http',
        inputTokens: 1000,
        maxOutputTokens: 1000,
        upperBoundMicroUsd: 12000,
      });
      await f.commercial.service.failLease(lease);
    }
    const before = await f.commercial.finance.getReceipt(owner, run.id);
    expect(before).toMatchObject({ chargedCents: 0, releasedCents: 500 });
    if (kind === 'held-question') {
      const now = new Date().toISOString();
      await f.client.execute({
        sql: 'INSERT INTO account_closures(id,subject_hash,user_hash,tenant_hash,status_token_hash,idempotency_key_hash,request_fingerprint,policy_version,status,requested_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        args: ['closure', 'subject', 'user', 'tenant', 'token', 'key', 'fingerprint', 'policy', 'PURGING', now, now],
      });
      await f.client.execute({
        sql: "INSERT INTO retention_exceptions(id,closure_id,category,legal_basis_reference,authority_reference,responsible,starts_at,review_at,status) VALUES('hold','closure','SESSIONS','LEGAL_HOLD','case','Boni',?,?,'ACTIVE')",
        args: [now, now],
      });
    }
    f.authorizeOwner.mockRejectedValue(new Error('ACCESS_REVOKED'));
    const purge = new AccountClosurePurgeService(f.client);
    await expect(purge.purgePrivateContent({ tenantId: owner.tenantId, closureId: 'closure' })).resolves.toMatchObject({
      remainingPrivateRows: 0,
    });
    if (kind === 'held-question') {
      expect((await new AgenticWorkspaceRepository(f.db).getExecution(owner, run.id))?.status).toBe('CANCELLED');
      expect((await f.commercial.service.store.getJob(owner, run.id)).state).toBe('CANCELLED');
      expect((await f.client.execute('SELECT id FROM agentic_conversations')).rows).toHaveLength(1);
      await f.client.execute("UPDATE retention_exceptions SET status='RELEASED' WHERE id='hold'");
      await purge.purgePrivateContent({ tenantId: owner.tenantId, closureId: 'closure' });
      expect((await f.client.execute('SELECT id FROM agentic_conversations')).rows).toHaveLength(0);
    }
    await new AccountClosureBillingRetention(f.client).minimize({
      ...owner,
      tenantPseudonym: 'closed-tenant',
      userPseudonym: 'closed-user',
    });
    const retained = JSON.parse(
      String((await f.client.execute('SELECT payload_json FROM commercial_executions')).rows[0].payload_json),
    );
    expect(retained).toMatchObject({
      chargedCents: before!.chargedCents,
      releasedCents: before!.releasedCents,
      uncertainMicroUsd: before!.uncertainMicroUsd,
    });
    expect(f.transport).not.toHaveBeenCalled();
  },
);

it('closure leaves a leased commercial job with terminal finance untouched until the worker stops', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'in-flight-closure', input);
  const lease = (await f.commercial.service.claimNext('active-worker'))!;
  await f.commercial.service.beginStep(lease, 'http-step');
  await f.commercial.finance.authorizeCall(owner, run.id, {
    callId: 'http',
    inputTokens: 1000,
    maxOutputTokens: 1000,
    upperBoundMicroUsd: 12000,
  });
  await f.commercial.finance.finalize(owner, run.id, { usableDelivery: false, outcome: 'CANCELLED' });
  await expect(
    new AccountClosurePurgeService(f.client).purgePrivateContent({ tenantId: owner.tenantId, closureId: 'closure' }),
  ).rejects.toThrow('ACCOUNT_CLOSURE_AGENTIC_PENDING');
  expect((await f.commercial.service.store.getJob(owner, run.id)).state).toBe('LEASED');
  expect((await new AgenticWorkspaceRepository(f.db).getExecution(owner, run.id))?.status).toBe('RUNNING');
});
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
it('an answer refused for balance keeps the question so it can be answered after funding', async () => {
  const f = await fixture();
  const run = await f.commercial.start(owner, 'ask-funds', input);
  const lease = (await f.commercial.service.claimNext('question-funds-worker'))!;
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
  const answer = {
    questionId: 'purpose',
    questionVersion: 1,
    contextRevision: 1,
    selectedOptionIds: ['review'],
    unknown: false,
    confirmed: true,
    policyVersion: COMMERCIAL_POLICY_VERSION,
  };
  const setBalance = (cents: number) =>
    f.client.execute({
      sql: 'UPDATE ledger_accounts SET paid_balance_cents=? WHERE tenant_id=?',
      args: [cents, owner.tenantId],
    });
  await setBalance(100);
  await expect(f.commercial.successor(owner, run.id, 'answer-broke', 'answer', answer)).rejects.toThrow(
    'BILLING_INSUFFICIENT_BALANCE',
  );
  const repo = new AgenticWorkspaceRepository(f.db);
  expect(await repo.getExecution(owner, run.id)).toMatchObject({ status: 'WAITING_USER' });
  expect((await f.commercial.service.store.getJob(owner, run.id)).successorId).toBeUndefined();
  await setBalance(2000);
  const next = await f.commercial.successor(owner, run.id, 'answer-funded', 'answer', answer);
  expect(await f.commercial.finance.getReceipt(owner, next.id)).toMatchObject({ reservedCents: 500, status: 'ACTIVE' });
});
it('the admission deadline column follows the job: set while admitting, null once admitted or waiting for a person', async () => {
  const f = await fixture();
  const deadline = async (id: string) =>
    (
      await f.client.execute({
        sql: 'SELECT admission_expires_at AS d FROM agentic_execution_jobs WHERE execution_id=?',
        args: [id],
      })
    ).rows[0].d;
  const approval = {
    authorizationId: `commercial:${COMMERCIAL_POLICY_VERSION}`,
    provider: 'openai',
    model: 'gpt-6.1-sol',
  };
  const pending = await f.commercial.service.startExecution(owner, 'deadline', { objective: 'x' }, approval);
  expect(await deadline(pending.id)).toEqual(expect.any(String));
  const run = await f.commercial.start(owner, 'deadline-activated', input);
  expect(await deadline(run.id)).toBeNull();
});
it('sweep ignores jobs that are admitted or waiting for a person and still expires an overdue admission', async () => {
  const f = await fixture();
  const approval = {
    authorizationId: `commercial:${COMMERCIAL_POLICY_VERSION}`,
    provider: 'openai',
    model: 'gpt-6.1-sol',
  };
  const overdue = await f.commercial.service.startExecution(owner, 'overdue', { objective: 'x' }, approval);
  await f.client.execute({
    sql: "UPDATE agentic_execution_jobs SET admission_expires_at='2020-01-01T00:00:00.000Z', payload_json=json_set(payload_json,'$.admissionExpiresAt','2020-01-01T00:00:00.000Z') WHERE execution_id=?",
    args: [overdue.id],
  });
  const active = await f.commercial.start(owner, 'still-active', input).catch(() => undefined);
  await f.commercial.sweepAdmissions();
  expect((await new AgenticWorkspaceRepository(f.db).getExecution(owner, overdue.id))?.status).toBe('CANCELLED');
  if (active)
    expect((await new AgenticWorkspaceRepository(f.db).getExecution(owner, active.id))?.status).not.toBe('CANCELLED');
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
  const next = await f.app.inject({
    method: 'POST',
    url: '/api/agentic/commercial/executions',
    headers: { ...headers, 'idempotency-key': 'blocked-after-uncertainty' },
    payload: input,
  });
  expect(next.statusCode).toBe(409);
  expect(next.json()).toMatchObject({ error: 'COMMERCIAL_RECONCILIATION_REQUIRED' });
  expect((await f.commercial.start(owner, 'uncertain', input)).id).toBe(run.id);
  expect(await f.commercial.finance.getReceipt(owner, run.id)).toMatchObject({ chargedCents: 0, releasedCents: 500 });
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
