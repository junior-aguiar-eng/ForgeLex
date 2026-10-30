import assert from 'node:assert/strict';
import { createDatabase, runPersistenceMigrations, holdAgenticTenant, closeAgenticTenant, AgenticWorkspaceRepository, AccountClosureRepository, MatterRepository } from '../packages/persistence/dist/index.js';
import { runLedgerMigrations, InferenceBudgetService } from '../packages/billing-ledger/dist/index.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';
import { AccountClosureBillingRetention } from '../apps/api/dist/account/account-closure-billing-retention.js';
import { ExecutionService } from '../apps/api/dist/agentic-workspace/execution-service.js';
import { adminConnectionUrl, disposableName, createDisposableDatabase, databaseUrl, dropDisposableDatabase } from './account-closure-test-db.mjs';
const admin = adminConnectionUrl(), name = disposableName('forgelex_closure_smoke_');
let c, second;
const checks = [];
await createDisposableDatabase(admin, name);
try {
  c = await createDatabase({ url: databaseUrl(admin, name) });
  second = await createDatabase({ url: databaseUrl(admin, name) });
  await runPersistenceMigrations(c.client); await runLedgerMigrations(c.client); await runPersistenceMigrations(c.client);
  const owner = {tenantId:'retention-owner',userId:'user'};
  const input = {objective:'Solicitação sintética', context:{text:'privado',origin:'USER',documents:[]}};
  const service = new ExecutionService(second.db, second.client, {executorAvailable:true});
  const purge = new AccountClosurePurgeService(second.client);
  // Poll PostgreSQL's actual lock wait, not elapsed time, before advancing the race.
  async function blocked() {
    for (let n=0;n<300;n++) {
      const result = await c.client.execute("SELECT COUNT(*) AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
      if (Number(result.rows[0].count)>0) return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error('EXPECTED_POSTGRES_LOCK_WAIT');
  }
  const tx = await c.client.transaction();
  try {
    await holdAgenticTenant(tx, owner.tenantId);
    const removing = purge.purgePrivateContent({tenantId:owner.tenantId,closureId:'retention'});
    await blocked();
    await tx.execute({sql:'INSERT INTO agentic_conversations(id,tenant_id,user_id,objective,context_revision,created_at) VALUES(?,?,?,?,1,?)',args:['before-close',owner.tenantId,owner.userId,'privado','2026-10-29']});
    await tx.commit(); await removing;
  } catch(error) { await tx.rollback(); throw error; }
  assert.equal((await c.client.execute('SELECT id FROM agentic_conversations')).rows.length,0); checks.push('purge_waits_for_admitted_writer_and_erases_it');
  await assert.rejects(service.startExecution(owner,'late',input),/AGENTIC_TENANT_CLOSED/);
  await assert.rejects(new AgenticWorkspaceRepository(c.db).createConversation(owner,input),/AGENTIC_TENANT_CLOSED/);
  await assert.rejects(new InferenceBudgetService(c.db,c.client).inspectAccount(owner),/AGENTIC_TENANT_CLOSED/);
  checks.push('late_command_conversation_and_budget_blocked');
  const other = {...owner,tenantId:'other'};
  const closing = await c.client.transaction();
  try {
    await closeAgenticTenant(closing,other.tenantId);
    const late = service.startExecution(other,'queued',input).then(()=>{throw new Error('LATE_WRITE_ACCEPTED');},error=>assert.match(error.message,/AGENTIC_TENANT_CLOSED/));
    await blocked(); await closing.commit(); await late;
  } catch(error) { await closing.rollback(); throw error; }
  checks.push('request_queued_behind_close_is_rejected');
  await purge.purgePrivateContent({tenantId:owner.tenantId,closureId:'retention'});
  checks.push('idempotent_purge');
  // Released finance can be minimized without changing monetary amounts or another owner.
  await c.client.execute({sql:'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)',args:['b','finance','user','e','private-key',JSON.stringify({status:'RELEASED',remainingPaidCents:0,remainingPromoCents:0,consumedCents:12})]});
  await new AccountClosureBillingRetention(c.client).minimize({tenantId:'finance',userId:'user',tenantPseudonym:'closed_finance',userPseudonym:'closed_user'});
  const row=(await c.client.execute("SELECT * FROM inference_budgets WHERE id='b'")).rows[0];
  assert.equal(row.tenant_id,'closed_finance'); assert.equal(JSON.parse(row.payload_json).consumedCents,12); assert.ok(!JSON.stringify(row).includes('private-key'));
  checks.push('released_inference_minimized_on_postgres');
  const heldOwner={tenantId:'held-owner',userId:'held-user'};
  const matter=await new MatterRepository(c.db).createMatter({...heldOwner,createdBy:heldOwner.userId,title:'Conteúdo a eliminar'});
  await new AgenticWorkspaceRepository(c.db).createConversation(heldOwner,{...input,matterId:matter.id});
  await new AccountClosureRepository(c.client).create({id:'held-closure',subjectId:'held-subject',...heldOwner,subjectHash:'a'.repeat(64),userHash:'b'.repeat(64),tenantHash:'c'.repeat(64),statusTokenHash:'d'.repeat(64),idempotencyKeyHash:'e'.repeat(64),requestFingerprint:'f'.repeat(64),policyVersion:'test',requestedAt:'2026-10-29T00:00:00.000Z'});
  await c.client.execute("INSERT INTO retention_exceptions(id,closure_id,category,legal_basis_reference,authority_reference,responsible,starts_at,review_at,status) VALUES('held-exception','held-closure','SESSIONS','LEGAL_HOLD','case','Boni','2026-10-29T00:00:00.000Z','2026-10-29T00:00:00.000Z','ACTIVE')");
  await purge.purgePrivateContent({tenantId:heldOwner.tenantId,closureId:'held-closure'});
  const shell=(await c.client.execute({sql:'SELECT title,lifecycle_state,created_by FROM matters WHERE id=?',args:[matter.id]})).rows[0];
  assert.equal(shell.title,''); assert.equal(shell.lifecycle_state,'PURGED'); assert.equal(shell.created_by,'retained_session');
  await purge.verifyResiduals({tenantId:heldOwner.tenantId,closureId:'held-closure',tenantPseudonym:'closed_held'});
  checks.push('session_hold_preserves_only_minimal_case_shell');
  await c.client.execute("UPDATE retention_exceptions SET status='RELEASED' WHERE id='held-exception'");
  await purge.purgePrivateContent({tenantId:heldOwner.tenantId,closureId:'held-closure'});
  assert.equal((await c.client.execute({sql:'SELECT id FROM matters WHERE id=?',args:[matter.id]})).rows.length,0);
  checks.push('expired_hold_removes_shell_and_conversation');
  console.log(JSON.stringify({status:'passed',checks}));
} finally { c?.client.close(); second?.client.close(); await dropDisposableDatabase(admin,name); }
