import { createHash, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterEach, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService, COMMERCIAL_POLICY_VERSION } from '@forgelex/billing-ledger';
import { FinalEditorialContextSchema } from '@forgelex/legal-workflows';
import { createEditorialCommercialRuntime } from './editorial-commercial-runtime.js';
import { drainCommercialClosureJobs } from '../account/commercial-execution-drain.js';

vi.setConfig({ testTimeout: 15000 });
const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
async function database() {
  const value = process.env.FORGELEX_EDITORIAL_TEST_ADMIN_URL;
  if (!value) {
    const c = await createDatabase({ url: 'file::memory:' });
    cleanup.push(() => c.client.close());
    return c;
  }
  const url = new URL(value);
  if (url.protocol !== 'postgres:' || url.hostname !== '127.0.0.1' || url.pathname !== '/editorial_test')
    throw new Error('EDITORIAL_TEST_DATABASE_NOT_DISPOSABLE');
  const name = `editorial_${randomUUID().replaceAll('-', '')}`;
  const admin = postgres(value, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const c = await createDatabase({ url: url.toString() });
  cleanup.push(async () => {
    c.client.close();
    await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  });
  return c;
}
const owner = { tenantId: 'editorial-commercial', userId: 'boni' };
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function fixture(fail = false) {
  const c = await database();
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.runMigrations();
  await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 2000, promotionalBalanceCents: 0 });
  const document = {
    title: 'Minuta',
    documentType: 'Manifestação',
    sections: [{ title: 'Pedido', content: 'Pedido condicionado.', sourceIds: [] }],
  };
  const identity = {
    contractVersion: '1.0.0',
    contextId: 'context',
    contextRevision: 1,
    deliveryId: 'delivery',
    draftId: 'draft',
    versionId: 'version',
    documentHash: hash(document),
  };
  const context = FinalEditorialContextSchema.parse({
    ...identity,
    document,
    sources: [],
    claims: [],
    requirements: [],
    findings: [],
    supportAudit: [],
  });
  const proposal = {
    ...identity,
    status: 'LIMITED',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    changes: [],
    substantiveSuggestions: [],
    limitations: ['Conferir suporte.'],
  };
  const load = vi.fn(async () => structuredClone(context));
  const authorizeOwner = vi.fn(async () => {});
  const transport = vi.fn(async () => {
    if (fail) throw new Error('synthetic lost response');
    const item = {
      id: 'fc_editorial',
      type: 'function_call',
      status: 'completed',
      call_id: 'call_editorial',
      name: 'forgelex_editorial_submit',
      arguments: JSON.stringify(proposal),
    };
    const response = {
      id: 'resp_editorial',
      object: 'response',
      created_at: 1793664000,
      model: 'gpt-6.1-sol',
      status: 'completed',
      output: [item],
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    };
    return new Response(
      [
        { type: 'response.created', response: { ...response, status: 'in_progress', output: [] } },
        { type: 'response.output_item.added', output_index: 0, item },
        { type: 'response.output_item.done', output_index: 0, item },
        { type: 'response.completed', response },
      ]
        .map(
          (frame, sequence_number) =>
            `event: ${frame.type}\ndata: ${JSON.stringify({ ...frame, sequence_number })}\n\n`,
        )
        .join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const runtime = await createEditorialCommercialRuntime(c.db, c.client, {
    apiKey: 'synthetic',
    editor: { load },
    authorizeOwner,
    resolveMatter: async () => null,
    authorizeHistory: async () => {},
    transport,
  });
  const input = {
    deliveryId: 'delivery',
    draftId: 'draft',
    versionId: 'version',
    confirmed: true,
    policyVersion: COMMERCIAL_POLICY_VERSION,
  };
  return { ...c, runtime, input, transport, load, authorizeOwner, context };
}
it('reserves BRL and charges a completed empty review once, recovering its proposal', async () => {
  const f = await fixture();
  const started = await f.runtime.start(owner, 'one', f.input);
  expect(started.receipt?.reservedCents).toBe(500);
  expect(f.transport).not.toHaveBeenCalled();
  await f.runtime.worker.runOnce();
  const result = await f.runtime.read(owner, started.commandId, {
    deliveryId: f.input.deliveryId,
    draftId: f.input.draftId,
    versionId: f.input.versionId,
  });
  expect(result.status).toBe('COMPLETED');
  expect(result.result?.proposal.changes).toEqual([]);
  expect(result.receipt).toMatchObject({ chargedCents: 50, releasedCents: 450, status: 'COMPLETED' });
  expect((await f.runtime.start(owner, 'one', f.input)).commandId).toBe(started.commandId);
  await f.runtime.worker.runOnce();
  expect(f.transport).toHaveBeenCalledTimes(1);
  await expect(f.runtime.start(owner, 'one', { ...f.input, versionId: 'other' })).rejects.toThrow();
  await expect(
    f.runtime.read({ ...owner, userId: 'other' }, started.commandId, {
      deliveryId: f.input.deliveryId,
      draftId: f.input.draftId,
      versionId: f.input.versionId,
    }),
  ).rejects.toThrow();
});
it('releases the customer reservation after an uncertain response, without retry', async () => {
  const f = await fixture(true);
  const start = await f.runtime.start(owner, 'lost', f.input);
  await f.runtime.worker.runOnce();
  const result = await f.runtime.read(owner, start.commandId, {
    deliveryId: f.input.deliveryId,
    draftId: f.input.draftId,
    versionId: f.input.versionId,
  });
  expect(result.status).toBe('FAILED');
  expect(result.receipt).toMatchObject({ chargedCents: 0, releasedCents: 500 });
  expect(result.receipt!.uncertainMicroUsd).toBeGreaterThan(0);
  await f.runtime.start(owner, 'lost', f.input);
  await f.runtime.worker.runOnce();
  expect(f.transport).toHaveBeenCalledTimes(1);
  await drainCommercialClosureJobs(f.client, owner.tenantId, new Date().toISOString());
  expect((await f.runtime.service.store.getJob(owner, start.commandId)).state).toBe('FAILED');
});
it('rejects unconfirmed policy and prevents dispatch after context changes', async () => {
  const f = await fixture();
  await expect(f.runtime.start(owner, 'no', { ...f.input, confirmed: false })).rejects.toThrow();
  const start = await f.runtime.start(owner, 'changed', f.input);
  f.context.findings.push({
    id: 'new',
    code: 'NEW',
    severity: 'INFO',
    message: 'Novo contexto',
    sourceIds: [],
  } as never);
  await f.runtime.worker.runOnce();
  expect(f.transport).not.toHaveBeenCalled();
  expect((await f.runtime.finance.getReceipt(owner, start.commandId))?.chargedCents).toBe(0);
});

it('cancels before dispatch, releases the full reservation and recovers by request key', async () => {
  const f = await fixture();
  const target = { deliveryId: 'delivery', draftId: 'draft', versionId: 'version' };
  const started = await f.runtime.start(owner, 'cancel', f.input);
  expect((await f.runtime.recover(owner, 'cancel', target))?.commandId).toBe(started.commandId);
  expect(await f.runtime.recover(owner, 'unknown', target)).toBeNull();
  await f.runtime.cancel(owner, started.commandId, target, 'cancel-once');
  await f.runtime.worker.runOnce();
  const result = await f.runtime.read(owner, started.commandId, target);
  expect(result.status).toBe('CANCELLED');
  expect(result.receipt).toMatchObject({ chargedCents: 0, releasedCents: 500 });
  expect(f.transport).not.toHaveBeenCalled();
});

it('recovers admission after SQLite contention and refuses a second active command', async () => {
  const f = await fixture();
  const attempts = await Promise.allSettled([
    f.runtime.start(owner, 'same', f.input),
    f.runtime.start(owner, 'same', f.input),
  ]);
  // The single-connection SQLite test client rejects overlapping transactions.
  // Retry admission only; no provider call has occurred. PostgreSQL concurrency is checked separately.
  const a = attempts.find((r) => r.status === 'fulfilled');
  expect(a?.status).toBe('fulfilled');
  if (process.env.FORGELEX_EDITORIAL_TEST_ADMIN_URL) expect(attempts.every((r) => r.status === 'fulfilled')).toBe(true);
  for (const attempt of attempts)
    if (attempt.status === 'rejected') expect(String(attempt.reason)).toContain('TRANSACTION_ACTIVE');
  const b = await f.runtime.start(owner, 'same', f.input);
  if (a?.status === 'fulfilled') expect(a.value.commandId).toBe(b.commandId);
  await expect(f.runtime.start(owner, 'different', f.input)).rejects.toThrow('COMMERCIAL_EXECUTION_ACTIVE');
  await f.runtime.worker.runOnce();
  expect(f.transport).toHaveBeenCalledTimes(1);
});

it('checks live account access before dispatch', async () => {
  const f = await fixture();
  const started = await f.runtime.start(owner, 'revoke', f.input);
  f.authorizeOwner.mockRejectedValue(new Error('ACCESS_REVOKED'));
  await f.runtime.worker.runOnce();
  expect(f.transport).not.toHaveBeenCalled();
  expect(await f.runtime.finance.getReceipt(owner, started.commandId)).toMatchObject({
    chargedCents: 0,
    releasedCents: 500,
  });
});

it('discovers a paid review without its request key and keeps the receipt after a newer draft version', async () => {
  const f = await fixture();
  const target = { deliveryId: 'delivery', draftId: 'draft', versionId: 'version' };
  const started = await f.runtime.start(owner, 'history', f.input);
  await f.runtime.worker.runOnce();
  f.load.mockRejectedValue(new Error('EDITORIAL_VERSION_CONFLICT'));
  const historical = await f.runtime.read(owner, started.commandId, target);
  expect(historical.receipt?.chargedCents).toBe(50);
  expect((await f.runtime.latest(owner, target))?.commandId).toBe(started.commandId);
  expect((await f.runtime.recover(owner, 'history', target))?.result?.proposal.changes).toEqual([]);
  expect(await f.runtime.latest({ ...owner, userId: 'other' }, target)).toBeNull();
  expect(await f.runtime.quote(owner, target)).toMatchObject({ enabled: false, mode: 'COMMERCIAL' });
  await expect(f.runtime.start(owner, 'new', f.input)).rejects.toThrow('EDITORIAL_VERSION_CONFLICT');
});
