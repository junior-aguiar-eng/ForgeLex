import { afterEach, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { runLedgerMigrations } from '@forgelex/billing-ledger';
import { AccountClosureBillingRetention } from './account-closure-billing-retention.js';
import { AccountClosurePurgeService } from './account-closure-purge-service.js';

const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
afterEach(() => {
  for (const connection of connections.splice(0)) connection.client.close();
});
const identity = {
  tenantId: 'private-tenant',
  userId: 'private-user',
  tenantPseudonym: 'closed-tenant',
  userPseudonym: 'closed-user',
};
async function fixture(status = 'COMPLETED', callStatus = 'SETTLED') {
  const connection = await createDatabase({ url: ':memory:' });
  connections.push(connection);
  await runPersistenceMigrations(connection.client);
  await runLedgerMigrations(connection.client);
  const payload = {
    ...identity,
    id: 'commercial',
    accountId: 'wallet',
    executionId: 'execution',
    idempotencyKey: 'private-key',
    inputHash: 'private-hash',
    status,
    currency: 'BRL',
    policyVersion: 'commercial-v1',
    reservedCents: 500,
    chargedCents: status === 'ACTIVE' ? 0 : 50,
    releasedCents: status === 'ACTIVE' ? 0 : 450,
    expiredPromoCents: 0,
    measuredMicroUsd: 10000,
    uncertainMicroUsd: callStatus === 'UNCERTAIN' ? 20000 : 0,
    objective: 'private legal content',
    policy: {
      inputMicroUsdPerMillion: 2000000,
      outputMicroUsdPerMillion: 10000000,
      objective: 'private legal content',
    },
    createdAt: '2026-10-30T12:00:00Z',
  };
  const call = {
    ...identity,
    id: 'call',
    executionId: 'execution',
    callId: 'private-call',
    inputHash: 'private-input',
    usageHash: 'private-usage',
    usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 0, objective: 'private legal content' },
    status: callStatus,
    actualMicroUsd: callStatus === 'UNCERTAIN' ? null : 10000,
    upperBoundMicroUsd: 20000,
    authorizedAt: '2026-10-30T12:00:00Z',
  };
  await connection.client.execute({
    sql: 'INSERT INTO commercial_executions(id,tenant_id,user_id,account_id,execution_id,idempotency_key,status,payload_json) VALUES(?,?,?,?,?,?,?,?)',
    args: [
      'commercial',
      identity.tenantId,
      identity.userId,
      'wallet',
      'execution',
      'private-key',
      status,
      JSON.stringify(payload),
    ],
  });
  await connection.client.execute({
    sql: 'INSERT INTO commercial_calls(id,tenant_id,user_id,execution_id,call_id,status,payload_json) VALUES(?,?,?,?,?,?,?)',
    args: ['call', identity.tenantId, identity.userId, 'execution', 'private-call', callStatus, JSON.stringify(call)],
  });
  return connection;
}

it.each(['SETTLED', 'UNCERTAIN'])(
  'minimiza finanças comerciais terminais preservando valor e incerteza: %s',
  async (status) => {
    const c = await fixture('COMPLETED', status);
    await new AccountClosureBillingRetention(c.client).minimize(identity);
    const budgets = (await c.client.execute('SELECT * FROM commercial_executions')).rows;
    const calls = (await c.client.execute('SELECT * FROM commercial_calls')).rows;
    expect(budgets[0]).toMatchObject({ tenant_id: identity.tenantPseudonym, user_id: identity.userPseudonym });
    expect(calls[0]).toMatchObject({ tenant_id: identity.tenantPseudonym, user_id: identity.userPseudonym });
    expect(JSON.parse(String(budgets[0].payload_json))).toMatchObject({
      reservedCents: 500,
      chargedCents: 50,
      releasedCents: 450,
      measuredMicroUsd: 10000,
    });
    expect(JSON.parse(String(calls[0].payload_json))).toMatchObject({
      status,
      actualMicroUsd: status === 'UNCERTAIN' ? null : 10000,
    });
    expect(JSON.parse(String(budgets[0].payload_json)).policy).toEqual({
      inputMicroUsdPerMillion: 2000000,
      outputMicroUsdPerMillion: 10000000,
    });
    expect(JSON.parse(String(calls[0].payload_json)).usage).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 0,
    });
    expect(JSON.stringify([budgets, calls])).not.toContain('private-');
    expect(JSON.stringify([budgets, calls])).not.toContain('private legal content');
  },
);

it.each([
  ['ACTIVE', 'SETTLED'],
  ['COMPLETED', 'AUTHORIZED'],
])('impede minimização de finanças comerciais pendentes: %s/%s', async (execution, call) => {
  const c = await fixture(execution, call);
  await expect(new AccountClosureBillingRetention(c.client).minimize(identity)).rejects.toThrow(
    'ACCOUNT_CLOSURE_INFERENCE_PENDING',
  );
  expect((await c.client.execute('SELECT tenant_id FROM commercial_executions')).rows[0].tenant_id).toBe(
    identity.tenantId,
  );
});

it('não apaga conteúdo privado antes de resolver reserva comercial ativa', async () => {
  const c = await fixture('ACTIVE');
  await expect(
    new AccountClosurePurgeService(c.client).purgePrivateContent({ tenantId: identity.tenantId, closureId: 'closure' }),
  ).rejects.toThrow('ACCOUNT_CLOSURE_INFERENCE_PENDING');
  expect((await c.client.execute('SELECT closed FROM agentic_tenant_guards')).rows).toHaveLength(0);
});
