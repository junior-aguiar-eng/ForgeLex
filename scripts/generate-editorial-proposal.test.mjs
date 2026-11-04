import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { runEditorialCommand, parseEditorialArgs } from './generate-editorial-proposal.mjs';
import {
  createDatabase,
  runPersistenceMigrations,
  AccountRepository,
  MatterRepository,
  AgenticWorkspaceRepository,
  NativeCaseTaskRepository,
} from '../packages/persistence/dist/index.js';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture() {
  const document = {
    title: 'Minuta',
    documentType: 'Manifestação',
    sections: [{ title: 'Pedido', content: 'Pedido condicionado.', sourceIds: [] }],
  };
  const context = {
    contractVersion: '1.0.0',
    contextId: 'context',
    contextRevision: 1,
    deliveryId: 'delivery',
    draftId: 'draft',
    versionId: 'version',
    documentHash: digest(document),
    document,
    sources: [],
    claims: [],
    supportAudit: [],
    requirements: [],
    findings: [],
  };
  const command = {
    commandId: randomUUID(),
    databaseFile: join(tmpdir(), 'unused-test.sqlite'),
    owner: { tenantId: 'editorial', userId: 'boni' },
    deliveryId: 'delivery',
    draftId: 'draft',
    versionId: 'version',
    contextHash: digest(context),
  };
  const directory = mkdtempSync(join(tmpdir(), 'forgelex-editorial-command-'));
  const editor = { load: async () => structuredClone(context) };
  return { command, directory, editor, context };
}

test('host provisions persistent isolated budget and replays without another SDK request', async () => {
  const f = fixture();
  const first = await runEditorialCommand(f);
  assert.equal(first.mode, 'SIMULATED_TRANSPORT');
  assert.equal(first.paidModelCalls, 0);
  assert.equal(first.budget.calls, 1);
  assert.equal(first.budget.unresolved, 0);
  assert.equal(first.proposal.legalAssessment, 'NOT_EVALUATED');
  const before = readFileSync(join(f.directory, 'budget.jsonl'));
  const replay = await runEditorialCommand({
    ...f,
    transport: () => {
      throw new Error('MUST_NOT_REPEAT');
    },
  });
  assert.deepEqual(replay, first);
  assert.deepEqual(readFileSync(join(f.directory, 'budget.jsonl')), before);
  const last = JSON.parse(before.toString().trim().split('\n').at(-1));
  assert.equal(last.state.identity.cap, 250000);
  assert.equal(last.state.runs[f.command.commandId].status, 'completed');
});

test('lost response stays uncertain across a fresh host invocation', async () => {
  const f = fixture();
  let calls = 0;
  await assert.rejects(
    runEditorialCommand({
      ...f,
      transport: async () => {
        calls++;
        throw new Error('LOST');
      },
    }),
  );
  await assert.rejects(runEditorialCommand(f), /RECONCILIATION_REQUIRED/);
  assert.equal(calls, 1);
  const last = JSON.parse(readFileSync(join(f.directory, 'budget.jsonl'), 'utf8').trim().split('\n').at(-1));
  assert.equal(Object.values(last.state.runs[f.command.commandId].calls)[0].status, 'UNCERTAIN');
});

test('host refuses changed context, missing approval, and switching simulation to paid mode', async () => {
  const f = fixture();
  await assert.rejects(runEditorialCommand({ ...f, real: true, apiKey: 'synthetic' }), /APPROVAL/);
  await runEditorialCommand(f);
  await assert.rejects(runEditorialCommand({ ...f, real: true, approved: true, apiKey: 'synthetic' }), /FINGERPRINT/);
  f.context.document.sections[0].content = 'Changed';
  await assert.rejects(runEditorialCommand(f), /CONTEXT_CHANGED/);
});

test('CLI defaults to simulation and requires explicit paid cap and a local command', () => {
  assert.deepEqual(parseEditorialArgs(['--command=command.json']), {
    commandPath: 'command.json',
    real: false,
    approved: false,
  });
  assert.throws(() => parseEditorialArgs(['--command=x', '--real']), /APPROVAL/);
  assert.throws(() => parseEditorialArgs(['--command=x', '--approve-editorial-usd=0.25']), /APPROVAL/);
  assert.throws(() => parseEditorialArgs(['--command=x', '--command=y']));
  assert.throws(() => parseEditorialArgs(['--command=x', '--approve-editorial-usd=1.50']));
});

test('CLI prepares and generates from an authorized local draft, preserves DB, then refuses revoked access', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'forgelex-editorial-cli-'));
  const databaseFile = join(directory, 'synthetic.sqlite');
  const c = await createDatabase({ url: pathToFileURL(databaseFile).toString() });
  try {
    await runPersistenceMigrations(c.client);
    const account = await new AccountRepository(c.db).bootstrap({
      supabaseUserId: randomUUID(),
      email: 'synthetic@forgelex.test',
      displayName: 'Boni sintético',
    });
    const owner = { tenantId: account.tenant.id, userId: account.user.id };
    const matter = await new MatterRepository(c.db).createMatter({
      ...owner,
      createdBy: owner.userId,
      title: 'Teste local',
    });
    const workspace = new AgenticWorkspaceRepository(c.db);
    const conversation = await workspace.createConversation(owner, {
      matterId: matter.id,
      objective: 'Minuta',
      context: { origin: 'USER', text: 'Relato sintético.', documents: [] },
    });
    const execution = await workspace.createExecution(owner, {
      conversationId: conversation.id,
      contextRevision: 1,
      idempotencyKey: randomUUID(),
      authorizationId: null,
      budgetReservationId: null,
      provider: null,
      model: null,
    });
    await workspace.compareAndSetStatus(owner, execution.id, 'QUEUED', 'RUNNING');
    const native = new NativeCaseTaskRepository(c.db, async () => {});
    const binding = {
      ...owner,
      conversationId: conversation.id,
      executionId: execution.id,
      contextRevision: 1,
      matterId: matter.id,
      objective: 'Minuta',
    };
    const packet = await native.load(binding);
    const saved = await native.save(binding, {
      action: 'create_document',
      contextId: conversation.id,
      contextRevision: 1,
      status: 'LIMITED',
      humanReviewRequired: true,
      legalAssessment: 'NOT_EVALUATED',
      issues: [],
      claims: [],
      requirements: [],
      findings: [],
      supportAudit: [],
      sources: packet.sources.map(({ text: _t, ...source }) => source),
      document: {
        title: 'Minuta',
        documentType: 'Manifestação',
        sections: [{ title: 'Pedido', content: 'Pedido condicionado.', sourceIds: packet.sources.map((s) => s.id) }],
      },
    });
    await workspace.saveProgress(owner, execution.id, { caseTask: { version: 8, evidence: [] } }, [saved.id]);
    await workspace.compareAndSetStatus(owner, execution.id, 'RUNNING', 'COMPLETED');
    const snapshot = async () =>
      Promise.all(
        ['drafts', 'draft_versions', 'draft_sections', 'agentic_task_deliveries', 'agentic_executions'].map(
          async (table) => (await c.client.execute(`SELECT * FROM ${table}`)).rows,
        ),
      );
    const before = await snapshot();
    const commandFile = join(directory, 'command.json');
    writeFileSync(
      commandFile,
      JSON.stringify({
        commandId: randomUUID(),
        databaseFile,
        owner,
        deliveryId: saved.id,
        draftId: saved.draftId,
        versionId: saved.versionId,
      }),
    );
    const cli = fileURLToPath(new URL('./generate-editorial-proposal.mjs', import.meta.url));
    const prepared = JSON.parse(
      execFileSync(process.execPath, [cli, `--command=${commandFile}`, '--prepare'], { encoding: 'utf8' }),
    );
    assert.equal(prepared.paidModelCalls, 0);
    const result = JSON.parse(
      execFileSync(process.execPath, [cli, `--command=${prepared.preparedCommand}`], { encoding: 'utf8' }),
    );
    assert.equal(result.mode, 'SIMULATED_TRANSPORT');
    assert.equal(result.budget.calls, 1);
    assert.equal(result.budget.unresolved, 0);
    const trace = readFileSync(join(result.directory, 'call-trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(
      trace.map((event) => event.phase),
      ['RESERVED', 'RESPONSE', 'USAGE', 'SETTLED'],
    );
    assert.ok(trace.every((event) => event.executionId === JSON.parse(readFileSync(commandFile, 'utf8')).commandId));
    assert.deepEqual(await snapshot(), before);
    assert.ok(JSON.parse(readFileSync(join(result.directory, 'proposal-import.json'), 'utf8')).humanReviewRequired);
    await c.client.execute({
      sql: 'UPDATE forgelex_user_profiles SET status=? WHERE id=?',
      args: ['DISABLED', owner.userId],
    });
    const revoked = spawnSync(process.execPath, [cli, `--command=${prepared.preparedCommand}`], { encoding: 'utf8' });
    assert.equal(revoked.status, 1);
    assert.match(revoked.stderr, /ACCESS_REVOKED/);
  } finally {
    c.client.close();
  }
});
