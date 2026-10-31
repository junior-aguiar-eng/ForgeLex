import { afterEach, expect, it } from 'vitest';
import {
  createDatabase,
  runPersistenceMigrations,
  AgenticWorkspaceRepository,
  agenticTenantKey,
} from '@forgelex/persistence';
import { LedgerService } from './ledger-service.js';
import { BillingService } from './billing-service.js';
import {
  CommercialInferenceService,
  COMMERCIAL_POLICY_VERSION,
  commercialPriceCents,
} from './commercial-inference-service.js';

const owner = { tenantId: 'commercial-test', userId: 'author' };
const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
afterEach(() => {
  for (const c of connections.splice(0)) c.client.close();
});
async function fixture(balance = 20000) {
  const c = await createDatabase({ url: 'file::memory:' });
  connections.push(c);
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: balance, promotionalBalanceCents: 0 });
  const repo = new AgenticWorkspaceRepository(c.db);
  const conversation = await repo.createConversation(owner, {
    objective: 'Synthetic',
    context: { text: 'Test', origin: 'USER', documents: [] },
  });
  let index = 0;
  let now = new Date('2026-10-30T12:00:00Z');
  const service = new CommercialInferenceService(c.db, c.client, { now: () => now });
  const execution = async (identity = owner) => {
    const context =
      identity.userId === owner.userId
        ? conversation
        : await repo.createConversation(identity, {
            objective: 'Synthetic',
            context: { text: 'Test', origin: 'USER', documents: [] },
          });
    const e = await repo.createExecution(identity, {
      conversationId: context.id,
      contextRevision: 1,
      idempotencyKey: `execution-${index++}`,
      authorizationId: 'consent',
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    return {
      executionId: e.id,
      idempotencyKey: e.id,
      requestFingerprint: 'synthetic',
      policyVersion: COMMERCIAL_POLICY_VERSION,
    };
  };
  return {
    ...c,
    repo,
    ledger,
    service,
    execution,
    advance: (date: string) => {
      now = new Date(date);
    },
  };
}
const quote = { callId: 'call', inputTokens: 1000, maxOutputTokens: 1000, upperBoundMicroUsd: 12000 };
const usage = { inputTokens: 1000, outputTokens: 1000 };

it.each(['settle', 'void'] as const)(
  'blocks the entire account after restart until %s resolves liability without retrocharge',
  async (resolution) => {
    const f = await fixture();
    const a = await f.execution();
    await f.service.reserve(owner, a);
    await f.service.authorizeCall(owner, a.executionId, quote);
    await f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'CANCELLED' });
    const other = { ...owner, userId: 'colleague' };
    const b = await f.execution(other);
    const restarted = new CommercialInferenceService(f.db, f.client);
    await expect(restarted.reserve(other, b)).rejects.toThrow('COMMERCIAL_RECONCILIATION_REQUIRED');
    expect(await restarted.reserve(owner, a)).toMatchObject({ status: 'CANCELLED', chargedCents: 0 });
    if (resolution === 'settle') await restarted.settleCall(owner, a.executionId, quote.callId, usage);
    else await restarted.markNotDispatched(owner, a.executionId, quote.callId);
    await expect(restarted.reserve(other, b)).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(await restarted.getReceipt(owner, a.executionId)).toMatchObject({
      chargedCents: 0,
      uncertainMicroUsd: 0,
      releasedCents: 500,
    });
  },
);

it('serializes new admission with account uncertainty without reserving a second job', async () => {
  const f = await fixture();
  const a = await f.execution(),
    b = await f.execution();
  await f.service.reserve(owner, a);
  await f.service.authorizeCall(owner, a.executionId, quote);
  const results = await Promise.allSettled([
    f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'FAILED' }),
    new CommercialInferenceService(f.db, f.client).reserve(owner, b),
  ]);
  expect(results[0].status).toBe('fulfilled');
  expect(results[1].status).toBe('rejected');
  expect(await f.service.getReceipt(owner, b.executionId)).toBeUndefined();
  await expect(f.service.reserve(owner, b)).rejects.toThrow('COMMERCIAL_RECONCILIATION_REQUIRED');
});

it('refuses dispatch against another user unresolved call even if an older admission exists', async () => {
  const f = await fixture();
  const a = await f.execution();
  await f.service.reserve(owner, a);
  await f.service.authorizeCall(owner, a.executionId, quote);
  await f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'FAILED' });
  const other = { ...owner, userId: 'colleague' };
  const b = await f.execution(other);
  // Persist an admission made by the older implementation before the account-wide gate existed.
  const rows = await f.client.execute('SELECT * FROM commercial_executions');
  const old = JSON.parse(String(rows.rows[0].payload_json));
  const admitted = {
    ...old,
    firstAuthorizedAt: undefined,
    id: 'old-admission',
    ...other,
    executionId: b.executionId,
    idempotencyKey: b.idempotencyKey,
    status: 'ACTIVE',
    uncertainMicroUsd: 0,
    measuredMicroUsd: 0,
    chargedCents: 0,
    releasedCents: 0,
  };
  await f.client.execute({
    sql: 'INSERT INTO commercial_executions(id,tenant_id,user_id,account_id,execution_id,idempotency_key,status,payload_json) VALUES(?,?,?,?,?,?,?,?)',
    args: [
      admitted.id,
      other.tenantId,
      other.userId,
      old.accountId,
      b.executionId,
      b.idempotencyKey,
      'ACTIVE',
      JSON.stringify(admitted),
    ],
  });
  await expect(
    new CommercialInferenceService(f.db, f.client).authorizeCall(other, b.executionId, quote),
  ).rejects.toThrow('COMMERCIAL_RECONCILIATION_REQUIRED');
});

it('prices in integer cents with approved rounding and floor', () => {
  expect([0, 10000, 100000, 250000].map(commercialPriceCents)).toEqual([50, 50, 205, 475]);
  expect(commercialPriceCents(14000)).toBe(51);
  expect(() => commercialPriceCents(-1)).toThrow();
});
it('escrows BRL, prevents research spending escrow, settles once and releases unused', async () => {
  const f = await fixture(600);
  const input = await f.execution();
  expect(await f.service.quote(owner)).toMatchObject({ currency: 'BRL', availableCents: 600, maxCostCents: 500 });
  await f.service.reserve(owner, input);
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(100);
  await expect(
    f.ledger.executeBillableOperation({
      tenantId: owner.tenantId,
      idempotencyKey: 'search',
      costCents: 101,
      operation: async () => 'result',
    }),
  ).rejects.toThrow();
  await f.service.authorizeCall(owner, input.executionId, quote);
  await f.service.settleCall(owner, input.executionId, quote.callId, usage);
  const receipt = await f.service.finalize(owner, input.executionId, { usableDelivery: true, outcome: 'COMPLETED' });
  expect(receipt).toMatchObject({ reservedCents: 500, chargedCents: 50, releasedCents: 450, measuredMicroUsd: 12000 });
  expect(await f.service.finalize(owner, input.executionId, { usableDelivery: true, outcome: 'COMPLETED' })).toEqual(
    receipt,
  );
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(550);
});
it('rejects insufficient balance, version conflict and changed replay fingerprint', async () => {
  const f = await fixture(499);
  const input = await f.execution();
  await expect(f.service.reserve(owner, input)).rejects.toThrow('BILLING_INSUFFICIENT_BALANCE');
  await expect(f.service.reserve(owner, { ...input, policyVersion: 'unknown' })).rejects.toThrow(
    'COMMERCIAL_POLICY_MISMATCH',
  );
  const funded = await fixture();
  const i = await funded.execution();
  const receipt = await funded.service.reserve(owner, i);
  expect(await funded.service.reserve(owner, i)).toEqual(receipt);
  await expect(funded.service.reserve(owner, { ...i, requestFingerprint: 'different' })).rejects.toThrow(
    'IDEMPOTENCY_CONFLICT',
  );
});
it('permits one active account execution and isolates receipt by tenant and user', async () => {
  const f = await fixture();
  const a = await f.execution(),
    b = await f.execution();
  await f.service.reserve(owner, a);
  await expect(f.service.reserve(owner, b)).rejects.toThrow('COMMERCIAL_EXECUTION_ACTIVE');
  expect(await f.service.getReceipt({ ...owner, userId: 'other' }, a.executionId)).toBeUndefined();
  expect(await f.service.getReceipt({ ...owner, tenantId: 'other' }, a.executionId)).toBeUndefined();
});
it('does not repeat dispatch after restart and retains unknown operational cost without customer charge', async () => {
  const f = await fixture();
  const input = await f.execution();
  await f.service.reserve(owner, input);
  expect((await f.service.authorizeCall(owner, input.executionId, quote)).shouldExecute).toBe(true);
  const restarted = new CommercialInferenceService(f.db, f.client);
  expect((await restarted.authorizeCall(owner, input.executionId, quote)).shouldExecute).toBe(false);
  const receipt = await restarted.finalize(owner, input.executionId, { usableDelivery: false, outcome: 'CANCELLED' });
  expect(receipt).toMatchObject({ chargedCents: 0, releasedCents: 500, uncertainMicroUsd: 12000 });
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(20000);
  await expect(restarted.authorizeCall(owner, input.executionId, { ...quote, callId: 'new' })).rejects.toThrow();
});
it('no usable delivery costs zero even with measured provider usage; no dispatch also costs zero', async () => {
  const f = await fixture();
  const a = await f.execution();
  await f.service.reserve(owner, a);
  await f.service.authorizeCall(owner, a.executionId, quote);
  await f.service.settleCall(owner, a.executionId, quote.callId, usage);
  expect(await f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'FAILED' })).toMatchObject({
    chargedCents: 0,
    measuredMicroUsd: 12000,
  });
  const b = await f.execution();
  await f.service.reserve(owner, b);
  expect(await f.service.finalize(owner, b.executionId, { usableDelivery: true, outcome: 'COMPLETED' })).toMatchObject({
    chargedCents: 0,
  });
});
it('enforces 24 calls, operational budget, bounded usage and stops after uncertainty', async () => {
  const f = await fixture();
  const a = await f.execution();
  await f.service.reserve(owner, a);
  await expect(f.service.authorizeCall(owner, a.executionId, { ...quote, upperBoundMicroUsd: 250001 })).rejects.toThrow(
    'COMMERCIAL_INFERENCE_LIMIT',
  );
  await expect(f.service.authorizeCall(owner, a.executionId, { ...quote, upperBoundMicroUsd: 1 })).rejects.toThrow(
    'COMMERCIAL_CALL_LIMIT',
  );
  for (let n = 0; n < 24; n++) {
    const q = { callId: `c${n}`, inputTokens: 1, maxOutputTokens: 1, upperBoundMicroUsd: 12 };
    await f.service.authorizeCall(owner, a.executionId, q);
    await f.service.settleCall(owner, a.executionId, q.callId, { inputTokens: 1, outputTokens: 1 });
  }
  await expect(f.service.authorizeCall(owner, a.executionId, quote)).rejects.toThrow('COMMERCIAL_CALL_LIMIT');
});
it('includes reservations in daily and monthly limits with Fortaleza periods', async () => {
  const f = await fixture();
  for (let n = 0; n < 4; n++) {
    const a = await f.execution();
    await f.service.reserve(owner, a);
    await f.service.authorizeCall(owner, a.executionId, {
      callId: 'full',
      inputTokens: 114760,
      maxOutputTokens: 2048,
      upperBoundMicroUsd: 250000,
    });
    await f.service.settleCall(owner, a.executionId, 'full', { inputTokens: 114760, outputTokens: 2048 });
    await f.service.finalize(owner, a.executionId, { usableDelivery: true, outcome: 'COMPLETED' });
  }
  f.advance('2026-10-31T02:59:59Z');
  await expect(f.service.reserve(owner, await f.execution())).rejects.toThrow('COMMERCIAL_DAILY_LIMIT');
  f.advance('2026-10-31T03:00:00Z');
  await f.service.reserve(owner, await f.execution());
});
it('closed tenants cannot reserve or mutate and reads do not reconstruct account data', async () => {
  const f = await fixture();
  const input = await f.execution();
  await f.service.reserve(owner, input);
  await f.client.execute({
    sql: 'UPDATE agentic_tenant_guards SET closed=1 WHERE tenant_key=?',
    args: [agenticTenantKey(owner.tenantId)],
  });
  await expect(f.service.authorizeCall(owner, input.executionId, quote)).rejects.toThrow('AGENTIC_TENANT_CLOSED');
});

it.each(['credit', 'debit', 'refund'] as const)(
  'blocks %s before wallet mutation when tenant is closed',
  async (operation) => {
    const f = await fixture();
    const billing = new BillingService(f.db, f.client);
    await billing.creditPurchase({
      tenantId: owner.tenantId,
      purchaseId: 'purchase',
      amountCents: 1000,
      idempotencyKey: 'purchase',
    });
    await f.client.execute({
      sql: 'UPDATE agentic_tenant_guards SET closed=1 WHERE tenant_key=?',
      args: [agenticTenantKey(owner.tenantId)],
    });
    const perform = () =>
      operation === 'credit'
        ? billing.creditPurchase({
            tenantId: owner.tenantId,
            purchaseId: 'new',
            amountCents: 100,
            idempotencyKey: 'new',
          })
        : operation === 'debit'
          ? billing.debitPaidCredits({ tenantId: owner.tenantId, amountCents: 100, idempotencyKey: 'new' })
          : billing.refundUnusedCredits({
              tenantId: owner.tenantId,
              purchaseId: 'purchase',
              amountCents: 100,
              idempotencyKey: 'new',
            });
    await expect(perform()).rejects.toThrow('AGENTIC_TENANT_CLOSED');
    expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(21000);
  },
);

it('uses the persisted tariff snapshot for call upper bound and measured usage', async () => {
  const f = await fixture();
  const input = await f.execution();
  await f.service.reserve(owner, input);
  const stored = await f.client.execute({
    sql: 'SELECT payload_json FROM commercial_executions WHERE execution_id=?',
    args: [input.executionId],
  });
  const record = JSON.parse(String(stored.rows[0]!.payload_json));
  // Represents an already authorized policy version surviving a different server tariff.
  record.policy.inputMicroUsdPerMillion = 4000000;
  record.policy.outputMicroUsdPerMillion = 20000000;
  record.policy.cachedInputMicroUsdPerMillion = 2000000;
  await f.client.execute({
    sql: 'UPDATE commercial_executions SET payload_json=? WHERE execution_id=?',
    args: [JSON.stringify(record), input.executionId],
  });
  await expect(f.service.authorizeCall(owner, input.executionId, quote)).rejects.toThrow('COMMERCIAL_CALL_LIMIT');
  await f.service.authorizeCall(owner, input.executionId, { ...quote, upperBoundMicroUsd: 24000 });
  expect(
    await f.service.settleCall(owner, input.executionId, quote.callId, { ...usage, cachedInputTokens: 500 }),
  ).toMatchObject({ actualMicroUsd: 23000 });
});

it('honors research already in flight before commercial escrow', async () => {
  const f = await fixture(600);
  const input = await f.execution();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const search = f.ledger.executeBillableOperation({
    tenantId: owner.tenantId,
    idempotencyKey: 'existing-search',
    costCents: 200,
    operation: async () => {
      entered();
      await gate;
      return 'done';
    },
  });
  await ready;
  try {
    await expect(f.service.reserve(owner, input)).rejects.toThrow('BILLING_INSUFFICIENT_BALANCE');
  } finally {
    release();
    await search;
  }
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(400);
});
it('serializes competing reservations through the database account lock', async () => {
  const f = await fixture(1000);
  const a = await f.execution(),
    b = await f.execution();
  const other = new CommercialInferenceService(f.db, f.client);
  const results = await Promise.allSettled([f.service.reserve(owner, a), other.reserve(owner, b)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(500);
  expect(await f.service.listActive(owner)).toHaveLength(1);
});
it('voids proven unsent requests, rejects contradictory settlement and preserves replay', async () => {
  const f = await fixture();
  const a = await f.execution();
  await f.service.reserve(owner, a);
  await f.service.authorizeCall(owner, a.executionId, quote);
  expect(await f.service.markNotDispatched(owner, a.executionId, quote.callId)).toMatchObject({
    status: 'VOID',
    actualMicroUsd: 0,
  });
  expect((await f.service.authorizeCall(owner, a.executionId, quote)).shouldExecute).toBe(false);
  await expect(f.service.settleCall(owner, a.executionId, quote.callId, usage)).rejects.toThrow(
    'COMMERCIAL_CALL_NOT_DISPATCHED',
  );
  expect(await f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'CANCELLED' })).toMatchObject(
    { chargedCents: 0, uncertainMicroUsd: 0, releasedCents: 500 },
  );
});

it('resolves cancellation uncertainty when transport subsequently proves no request was dispatched', async () => {
  const f = await fixture();
  const input = await f.execution();
  await f.service.reserve(owner, input);
  await f.service.authorizeCall(owner, input.executionId, quote);
  await f.service.finalize(owner, input.executionId, { usableDelivery: false, outcome: 'CANCELLED' });
  expect(await f.service.getReceipt(owner, input.executionId)).toMatchObject({
    uncertainMicroUsd: 12000,
    chargedCents: 0,
    releasedCents: 500,
  });
  await f.service.markNotDispatched(owner, input.executionId, quote.callId);
  expect(await f.service.getReceipt(owner, input.executionId)).toMatchObject({
    uncertainMicroUsd: 0,
    chargedCents: 0,
    releasedCents: 500,
  });
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(20000);
});
it('blocks after uncertainty and reconciles late actual cost without repricing closed work', async () => {
  const f = await fixture();
  const a = await f.execution();
  await f.service.reserve(owner, a);
  await f.service.authorizeCall(owner, a.executionId, quote);
  await f.service.markUncertain(owner, a.executionId, quote.callId);
  await expect(f.service.authorizeCall(owner, a.executionId, { ...quote, callId: 'next' })).rejects.toThrow(
    'COMMERCIAL_RECONCILIATION_REQUIRED',
  );
  await f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'FAILED' });
  await f.service.settleCall(owner, a.executionId, quote.callId, usage);
  expect(await f.service.getReceipt(owner, a.executionId)).toMatchObject({
    measuredMicroUsd: 12000,
    uncertainMicroUsd: 0,
    chargedCents: 0,
    releasedCents: 500,
  });
  await expect(f.service.settleCall(owner, a.executionId, quote.callId, { ...usage, outputTokens: 1 })).rejects.toThrow(
    'IDEMPOTENCY_CONFLICT',
  );
});
it('enforces cumulative monthly limit across local days and resets at local month boundary', async () => {
  const f = await fixture();
  for (let n = 0; n < 21; n++) {
    f.advance(`2026-10-${String(1 + Math.floor(n / 4)).padStart(2, '0')}T12:00:00Z`);
    const a = await f.execution();
    await f.service.reserve(owner, a);
    await f.service.authorizeCall(owner, a.executionId, {
      callId: 'full',
      inputTokens: 114760,
      maxOutputTokens: 2048,
      upperBoundMicroUsd: 250000,
    });
    await f.service.settleCall(owner, a.executionId, 'full', { inputTokens: 114760, outputTokens: 2048 });
    await f.service.finalize(owner, a.executionId, { usableDelivery: true, outcome: 'COMPLETED' });
  }
  f.advance('2026-11-01T02:59:59Z');
  await expect(f.service.reserve(owner, await f.execution())).rejects.toThrow('COMMERCIAL_MONTHLY_LIMIT');
  f.advance('2026-11-01T03:00:00Z');
  await f.service.reserve(owner, await f.execution());
});
it('starts time cap at first call, measures cached tokens and preserves promotion expiry', async () => {
  const f = await fixture();
  const a = await f.execution();
  await f.service.reserve(owner, a);
  f.advance('2026-10-30T13:00:00Z');
  await f.service.authorizeCall(owner, a.executionId, quote);
  expect(
    await f.service.settleCall(owner, a.executionId, quote.callId, { ...usage, cachedInputTokens: 1000 }),
  ).toMatchObject({ actualMicroUsd: 10100, usage: { inputTokens: 1000, outputTokens: 1000, cachedInputTokens: 1000 } });
  f.advance('2026-10-30T13:05:00Z');
  await expect(f.service.authorizeCall(owner, a.executionId, { ...quote, callId: 'timeout' })).rejects.toThrow(
    'COMMERCIAL_TIME_LIMIT',
  );
  await f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'CANCELLED' });
  await f.client.execute({
    sql: 'UPDATE ledger_accounts SET paid_balance_cents=100,promotional_balance_cents=400,promo_expires_at=? WHERE tenant_id=?',
    args: ['2026-10-30T14:00:00Z', owner.tenantId],
  });
  const b = await f.execution();
  await f.service.reserve(owner, b);
  f.advance('2026-10-30T15:00:00Z');
  expect(await f.service.finalize(owner, b.executionId, { usableDelivery: false, outcome: 'CANCELLED' })).toMatchObject(
    { releasedCents: 100, expiredPromoCents: 400 },
  );
  expect(await f.ledger.getAvailableBalanceCents(owner.tenantId)).toBe(100);
  const expired = await f.client.execute("SELECT amount_cents FROM ledger_entries WHERE kind='EXPIRATION'");
  expect(expired.rows[0]?.amount_cents).toBe(400);
});

it.each([
  ['NOT_DISPATCHED', { kind: 'NOT_DISPATCHED' as const }, 0],
  ['USAGE', { kind: 'USAGE' as const, usage }, 12000],
])(
  'operator reconciliation %s unblocks the account, keeps the evidence and never charges',
  async (_name, resolution, measured) => {
    const f = await fixture();
    const a = await f.execution();
    await f.service.reserve(owner, a);
    await f.service.authorizeCall(owner, a.executionId, quote);
    await f.service.markUncertain(owner, a.executionId, quote.callId);
    await f.service.finalize(owner, a.executionId, { usableDelivery: false, outcome: 'CANCELLED' });
    expect(await f.service.listUnresolvedCalls(owner.tenantId)).toEqual([
      expect.objectContaining({ executionId: a.executionId, callId: quote.callId, status: 'UNCERTAIN' }),
    ]);
    const b = await f.execution();
    await expect(f.service.reserve(owner, b)).rejects.toThrow('COMMERCIAL_RECONCILIATION_REQUIRED');
    const call = await f.service.reconcileCall(owner, a.executionId, quote.callId, {
      evidenceRef: 'openai-usage-2026-10-30',
      resolution,
    });
    expect(call.reconciliation).toMatchObject({ evidenceRef: 'openai-usage-2026-10-30' });
    expect(await f.service.listUnresolvedCalls(owner.tenantId)).toEqual([]);
    expect(await f.service.getReceipt(owner, a.executionId)).toMatchObject({
      measuredMicroUsd: measured,
      uncertainMicroUsd: 0,
      chargedCents: 0,
      releasedCents: 500,
    });
    await expect(f.service.reserve(owner, b)).resolves.toMatchObject({ status: 'ACTIVE' });
  },
);
it('operator reconciliation refuses in-flight, missing-evidence and already-settled calls', async () => {
  const f = await fixture();
  const a = await f.execution();
  await f.service.reserve(owner, a);
  await f.service.authorizeCall(owner, a.executionId, quote);
  const resolution = { kind: 'NOT_DISPATCHED' as const };
  await expect(
    f.service.reconcileCall(owner, a.executionId, quote.callId, { evidenceRef: 'openai-usage-2026-10-30', resolution }),
  ).rejects.toThrow('COMMERCIAL_CALL_NOT_UNCERTAIN');
  await f.service.markUncertain(owner, a.executionId, quote.callId);
  await expect(
    f.service.reconcileCall(owner, a.executionId, quote.callId, { evidenceRef: 'x', resolution }),
  ).rejects.toThrow();
  await f.service.reconcileCall(owner, a.executionId, quote.callId, {
    evidenceRef: 'openai-usage-2026-10-30',
    resolution: { kind: 'USAGE', usage },
  });
  await expect(
    f.service.reconcileCall(owner, a.executionId, quote.callId, { evidenceRef: 'openai-usage-2026-10-30', resolution }),
  ).rejects.toThrow('COMMERCIAL_CALL_NOT_UNCERTAIN');
});
