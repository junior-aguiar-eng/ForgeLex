import assert from 'node:assert/strict';
import { AgenticWorkspaceRepository } from '../packages/persistence/dist/index.js';
export async function seedAgenticRetention(db, client, owner) {
  await new AgenticWorkspaceRepository(db).createConversation(owner, {
    objective: 'Objetivo privado sintético',
    context: { text: 'Conteúdo privado sintético', origin: 'USER', documents: [] },
  });
  await client.execute({
    sql: 'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)',
    args: [
      'retention-budget',
      owner.tenantId,
      owner.userId,
      'retention-execution',
      'private-retention-key',
      JSON.stringify({
        ...owner,
        status: 'RELEASED',
        remainingPaidCents: 0,
        remainingPromoCents: 0,
        consumedCents: 12,
      }),
    ],
  });
  await client.execute({
    sql: 'INSERT INTO inference_calls(id,tenant_id,execution_id,call_id,operation_key,payload_json) VALUES(?,?,?,?,?,?)',
    args: [
      'retention-call',
      owner.tenantId,
      'retention-execution',
      'private-call-key',
      'private-operation-key',
      JSON.stringify({
        ...owner,
        status: 'SETTLED',
        reason: 'Conteúdo privado sintético',
        settlement: { actualCostCents: 12 },
      }),
    ],
  });
}
export async function assertAgenticRetention(db, client, owner) {
  assert.equal((await client.execute('SELECT id FROM agentic_conversations')).rows.length, 0);
  assert.equal((await client.execute('SELECT id FROM agentic_contexts')).rows.length, 0);
  const budget = (await client.execute("SELECT * FROM inference_budgets WHERE id='retention-budget'")).rows[0];
  const call = (await client.execute("SELECT * FROM inference_calls WHERE id='retention-call'")).rows[0];
  assert.notEqual(budget.tenant_id, owner.tenantId);
  assert.notEqual(budget.user_id, owner.userId);
  assert.notEqual(call.tenant_id, owner.tenantId);
  assert.equal(JSON.parse(budget.payload_json).consumedCents, 12);
  assert.equal(JSON.parse(call.payload_json).settlement.actualCostCents, 12);
  assert.ok(!JSON.stringify([budget, call]).includes('private-'));
  assert.ok(!JSON.stringify([budget, call]).includes('Conteúdo privado'));
  await assert.rejects(
    new AgenticWorkspaceRepository(db).createConversation(owner, {
      objective: 'antiga',
      context: { text: '', origin: 'USER', documents: [] },
    }),
    /AGENTIC_TENANT_CLOSED/,
  );
}
