import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  CaseAiAccessRepository,
  DraftRepository,
  DraftAiReceiptRepository,
  DraftReviewRunRepository,
  reviewContextHash,
} from '../packages/persistence/dist/index.js';
import { matters as matterTable } from '../packages/persistence/dist/schema/schema.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';
import { AccountClosurePurgeService } from '../apps/api/dist/account/account-closure-purge-service.js';

const url = process.env.FORGELEX_LOCAL_POSTGRES_URL;
let isolatedUrl = false;
try {
  const parsed = new URL(url);
  isolatedUrl =
    ['postgres:', 'postgresql:'].includes(parsed.protocol) &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
    !parsed.searchParams.has('host');
} catch {
  /* Invalid or absent test URL is blocked before connecting. */
}
if (!isolatedUrl) {
  console.error('BLOCKED_TEST_DATABASE: defina FORGELEX_LOCAL_POSTGRES_URL para um PostgreSQL de testes isolado.');
  process.exit(2);
}
const { db, client } = await createDatabase({ url });
const owner = { tenantId: `draft_ai_${randomUUID().replaceAll('-', '')}`, userId: randomUUID() };
const checks = [];
let currentCheck = 'migrations';
const check = (name) => {
  currentCheck = name;
};
const passed = () => {
  checks.push(currentCheck);
  console.log(`PASS ${currentCheck}`);
};
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('BARRIER_TIMEOUT')), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
// Signals the actual UPDATE attempt and acquisition of PostgreSQL's matter row lock.
function lockGate(hold = false) {
  const attempted = deferred(),
    locked = deferred(),
    release = deferred();
  let used = false;
  const proxy = new Proxy(db, {
    get(target, key) {
      if (key !== 'transaction') {
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      }
      return (body) =>
        target.transaction((tx) =>
          body(
            new Proxy(tx, {
              get(transaction, method) {
                if (method !== 'update') {
                  const value = Reflect.get(transaction, method);
                  return typeof value === 'function' ? value.bind(transaction) : value;
                }
                return (table) => {
                  const builder = transaction.update(table);
                  if (table !== matterTable || used) return builder;
                  used = true;
                  return {
                    set: (values) => ({
                      where: (predicate) => {
                        const query = builder.set(values).where(predicate);
                        return {
                          then: (resolve, reject) => {
                            attempted.resolve();
                            return query
                              .then(async (result) => {
                                locked.resolve();
                                if (hold) await bounded(release.promise);
                                return result;
                              })
                              .then(resolve, reject);
                          },
                        };
                      },
                    }),
                  };
                };
              },
            }),
          ),
        );
    },
  });
  return { db: proxy, attempted: attempted.promise, locked: locked.promise, release: release.resolve };
}
const count = async (table) =>
  Number(
    (
      await client.execute({
        sql: `SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`,
        args: [owner.tenantId],
      })
    ).rows[0].count,
  );
const access = new CaseAiAccessRepository(db),
  drafts = new DraftRepository(db),
  receipts = new DraftAiReceiptRepository(db),
  matters = new MatterRepository(db);
const purge = new AccountClosurePurgeService(client);
async function fixture(existing = false) {
  const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso sintético PostgreSQL' });
  const doc = await matters.ingestTextDocument({
    ...owner,
    matterId: matter.id,
    createdBy: owner.userId,
    title: 'Fonte fixada',
    originalFilename: 'fonte.txt',
    mimeType: 'text/plain',
    content: 'Conteúdo original selecionado.',
  });
  const draft = existing
    ? await drafts.createDraft({ ...owner, matterId: matter.id, createdBy: owner.userId, title: 'Edição humana' })
    : undefined;
  const versionInput = draft && {
    ...owner,
    matterId: matter.id,
    draftId: draft.id,
    createdBy: owner.userId,
    title: draft.title,
    source: 'HUMAN',
    contentHash: 'a'.repeat(64),
    sections: [{ ordinal: 0, title: 'Fatos', content: 'Edição humana preservada.' }],
  };
  if (versionInput) await drafts.createVersion(versionInput);
  const permission = {
    oauthClientId: randomUUID(),
    oauthGrantedAt: '2026-10-06T10:00:00.000Z',
    expectedRevision: 0,
    selection: {
      documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
      factIds: [],
      evidenceIds: [],
      thesisIds: [],
      authorityIds: [],
    },
    receivePermission: {
      enabled: true,
      destination: draft ? { mode: 'EXISTING', draftId: draft.id } : { mode: 'NEW' },
    },
  };
  const grant = await access.replace(owner, matter.id, permission);
  const reader = {
    ...owner,
    oauthConnection: { clientId: permission.oauthClientId, grantedAt: permission.oauthGrantedAt },
  };
  const input = {
    matterId: matter.id,
    expectedGrantRevision: grant.revision,
    idempotencyKey: randomUUID(),
    title: 'Texto recebido',
    sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto externo ainda não conferido.' }],
    references: [
      {
        sectionOrdinal: 0,
        kind: 'DOCUMENT',
        itemId: doc.document.id,
        documentVersionId: doc.version.id,
        anchorId: doc.anchors[0].id,
      },
    ],
  };
  return { matter, doc, draft, versionInput, permission, grant, reader, input };
}
try {
  await runPersistenceMigrations(client);
  await runPersistenceMigrations(client);
  await new LedgerService(db, client).runMigrations();
  passed();
  check('legacy_receiving_disabled');
  const legacy = await fixture();
  await access.replace(owner, legacy.matter.id, {
    ...legacy.permission,
    expectedRevision: 1,
    receivePermission: undefined,
  });
  assert.deepEqual((await access.listForOwner(owner, legacy.matter.id))[0].receivePermission, { enabled: false });
  passed();

  check('same_key_concurrent_one_receipt_one_new_draft');
  const f = await fixture();
  const beforeDrafts = await count('drafts'),
    beforeReceipts = await count('draft_ai_receipts');
  const [a, b] = await Promise.all([receipts.receive(f.reader, f.input), receipts.receive(f.reader, f.input)]);
  assert.equal(a.id, b.id);
  assert.equal(a.versionId, b.versionId);
  assert.notEqual(a.isReplay, b.isReplay);
  assert.equal(await count('drafts'), beforeDrafts + 1);
  assert.equal(await count('draft_ai_receipts'), beforeReceipts + 1);
  passed();
  check('same_key_changed_payload_conflicts');
  await assert.rejects(
    () => receipts.receive(f.reader, { ...f.input, title: 'Outro conteúdo' }),
    /DRAFT_RECEIPT_CONFLICT/,
  );
  passed();

  check('pinned_document_version_and_human_derivation');
  await client.execute({
    sql: 'INSERT INTO document_versions (id, document_id, version_number, content_hash, content, created_at) VALUES (?, ?, 2, ?, ?, ?)',
    args: [randomUUID(), f.doc.document.id, 'b'.repeat(64), 'Conteúdo posterior diferente.', new Date().toISOString()],
  });
  assert.equal((await matters.getDocumentVersion(owner.tenantId, f.doc.document.id)).version.versionNumber, 2);
  const bundle = await drafts.getVersion(owner.tenantId, f.matter.id, a.draftId, a.versionId);
  const snapshot = await drafts.reviewContext({ ...owner, matterId: f.matter.id }, bundle);
  assert.equal(snapshot.documentReferences[0].versionNumber, 1);
  assert.equal(snapshot.documentReferences[0].contentHash, f.doc.version.contentHash);
  assert.deepEqual(
    (await drafts.reviewContext({ ...owner, userId: randomUUID(), matterId: f.matter.id }, bundle)).documentReferences,
    snapshot.documentReferences,
  );
  const derived = await drafts.createVersion({
    ...owner,
    matterId: f.matter.id,
    draftId: a.draftId,
    createdBy: owner.userId,
    title: f.input.title,
    source: 'HUMAN',
    contentHash: 'c'.repeat(64),
    sections: f.input.sections,
    baseVersionId: a.versionId,
  });
  assert.deepEqual(await receipts.getReferences(owner, f.matter.id, a.draftId, derived.version.id), f.input.references);
  passed();

  check('approved_current_and_history_preserved');
  const existing = await fixture(true);
  const initial = await drafts.getDraft(owner.tenantId, existing.matter.id, existing.draft.id);
  const initialBundle = await drafts.getCurrentVersion(owner.tenantId, existing.matter.id, existing.draft.id);
  const reviewContext = { ...owner, matterId: existing.matter.id };
  const runs = new DraftReviewRunRepository(db);
  const run = await runs.start(
    reviewContext,
    initialBundle.version,
    'ALL',
    reviewContextHash(await drafts.reviewContext(reviewContext, initialBundle)),
  );
  await runs.finish(reviewContext, run.id, { state: 'COMPLETE', status: 'PASSED', checks: [], findings: [] });
  const approval = await drafts.createApprovalRequest({
    ...owner,
    matterId: existing.matter.id,
    draftId: existing.draft.id,
    draftVersionId: initial.currentVersionId,
    requestedBy: owner.userId,
    proposedAction: 'Aprovar versão sintética',
  });
  await drafts.resolveApproval({
    tenantId: owner.tenantId,
    token: approval.token,
    decision: 'APPROVED',
    decidedBy: owner.userId,
  });
  const approved = await drafts.getDraft(owner.tenantId, existing.matter.id, existing.draft.id);
  assert.equal(approved.status, 'APPROVED');
  const received = await receipts.receive(existing.reader, existing.input);
  assert.deepEqual(await drafts.getDraft(owner.tenantId, existing.matter.id, existing.draft.id), approved);
  passed();

  check('human_external_concurrent_unique_numbering');
  await Promise.all([
    drafts.createVersion(existing.versionInput),
    receipts.receive(existing.reader, { ...existing.input, idempotencyKey: randomUUID() }),
  ]);
  const versions = await drafts.listVersions(owner.tenantId, existing.matter.id, existing.draft.id);
  assert.equal(new Set(versions.map((v) => v.versionNumber)).size, versions.length);
  assert.deepEqual(
    versions.map((v) => v.versionNumber).sort((x, y) => x - y),
    [1, 2, 3, 4],
  );
  passed();
  check('adoption_compare_and_update_preserves_history');
  await assert.rejects(
    () => receipts.adopt(owner, existing.matter.id, existing.draft.id, received.versionId, approved.currentVersionId),
    /DRAFT_ADOPTION_CONFLICT/,
  );
  const current = await drafts.getDraft(owner.tenantId, existing.matter.id, existing.draft.id);
  const adopted = await receipts.adopt(
    owner,
    existing.matter.id,
    existing.draft.id,
    received.versionId,
    current.currentVersionId,
  );
  assert.equal(adopted.draft.status, 'DRAFT');
  assert.equal(adopted.draft.currentVersionId, received.versionId);
  assert.equal((await drafts.listVersions(owner.tenantId, existing.matter.id, existing.draft.id)).length, 4);
  assert.equal(
    (
      await client.execute({
        sql: 'SELECT status FROM draft_approval_requests WHERE id = ? AND tenant_id = ?',
        args: [approval.request.id, owner.tenantId],
      })
    ).rows[0].status,
    'APPROVED',
  );
  passed();

  check('failed_receipt_insert_rolls_back_all_rows');
  const rollback = await fixture(),
    counts = await Promise.all(['drafts', 'draft_versions', 'draft_ai_receipts'].map(count));
  const trigger = `fail_${randomUUID().replaceAll('-', '')}`;
  await client.execute(
    `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id = '${owner.tenantId}' THEN RAISE EXCEPTION 'synthetic receipt insert failure'; END IF; RETURN NEW; END; $$`,
  );
  try {
    await client.execute(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON draft_ai_receipts FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    await assert.rejects(() => receipts.receive(rollback.reader, rollback.input));
    assert.deepEqual(await Promise.all(['drafts', 'draft_versions', 'draft_ai_receipts'].map(count)), counts);
  } finally {
    await client.execute(`DROP TRIGGER IF EXISTS ${trigger} ON draft_ai_receipts`);
    await client.execute(`DROP FUNCTION IF EXISTS ${trigger}()`);
  }
  passed();

  check('cancel_waiting_for_actual_row_lock');
  const cancel = await fixture(),
    holder = lockGate(true),
    waiter = lockGate(),
    controller = new AbortController();
  const holding = new CaseAiAccessRepository(holder.db).replace(owner, cancel.matter.id, {
    ...cancel.permission,
    expectedRevision: 1,
  });
  await bounded(holder.locked);
  const waiting = new DraftAiReceiptRepository(waiter.db).receive(cancel.reader, cancel.input, {
    signal: controller.signal,
  });
  const rejected = assert.rejects(waiting, /abort/i);
  await bounded(waiter.attempted);
  controller.abort();
  holder.release();
  await holding;
  await rejected;
  assert.equal((await drafts.listDrafts(owner.tenantId, cancel.matter.id)).length, 0);
  passed();

  check('revocation_before_commit_denies_send');
  const revoked = await fixture(),
    revokeGate = lockGate(true),
    receiveGate = lockGate();
  const revoking = new CaseAiAccessRepository(revokeGate.db).revoke(
    owner,
    revoked.matter.id,
    revoked.grant.id,
    revoked.grant.revision,
  );
  await bounded(revokeGate.locked);
  const denied = new DraftAiReceiptRepository(receiveGate.db).receive(revoked.reader, revoked.input);
  const deniedAssertion = assert.rejects(denied, /CASE_CONTEXT_NOT_AUTHORIZED/);
  await bounded(receiveGate.attempted);
  revokeGate.release();
  await revoking;
  await deniedAssertion;
  assert.equal((await drafts.listDrafts(owner.tenantId, revoked.matter.id)).length, 0);
  passed();

  check('commit_before_revocation_keeps_history_denies_replay');
  const committed = await fixture(),
    commitGate = lockGate(true),
    laterRevoke = lockGate();
  const sending = new DraftAiReceiptRepository(commitGate.db).receive(committed.reader, committed.input);
  await bounded(commitGate.locked);
  const later = new CaseAiAccessRepository(laterRevoke.db).revoke(
    owner,
    committed.matter.id,
    committed.grant.id,
    committed.grant.revision,
  );
  await bounded(laterRevoke.attempted);
  commitGate.release();
  const saved = await sending;
  await later;
  assert.equal((await receipts.listForOwner(owner, committed.matter.id, saved.draftId)).length, 1);
  await assert.rejects(() => receipts.receive(committed.reader, committed.input), /CASE_CONTEXT_NOT_AUTHORIZED/);
  passed();

  check('receipt_cleanup_restore_residual_detection');
  const stored = (await client.execute({ sql: 'SELECT * FROM draft_ai_receipts WHERE id = ?', args: [saved.id] }))
    .rows[0];
  const backupTables = [
    'matters',
    'legal_documents',
    'document_versions',
    'document_anchors',
    'drafts',
    'draft_versions',
    'draft_sections',
    'citation_anchors',
    'case_ai_access_grants',
    'draft_ai_receipts',
  ];
  const backup = [];
  for (const table of backupTables) {
    const predicate =
      table === 'document_versions'
        ? 'document_id IN (SELECT id FROM legal_documents WHERE tenant_id = ?)'
        : table === 'document_anchors'
          ? 'document_version_id IN (SELECT id FROM document_versions WHERE document_id IN (SELECT id FROM legal_documents WHERE tenant_id = ?))'
          : 'tenant_id = ?';
    backup.push({
      table,
      rows: (await client.execute({ sql: `SELECT * FROM ${table} WHERE ${predicate}`, args: [owner.tenantId] })).rows,
    });
  }
  await purge.purgePrivateContent({ tenantId: owner.tenantId, closureId: randomUUID() });
  assert.equal(await count('draft_ai_receipts'), 0);
  // Replay the synthetic pre-purge rows in dependency order, like a backup restore.
  for (const { table, rows } of backup)
    for (const row of rows) {
      const columns = Object.keys(row);
      assert.ok(columns.every((column) => /^[a-z_]+$/.test(column)));
      await client.execute({
        sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        args: columns.map((column) => row[column]),
      });
    }
  assert.equal((await receipts.listForOwner(owner, committed.matter.id, saved.draftId))[0].versionId, saved.versionId);
  const residualInput = {
    tenantId: owner.tenantId,
    userId: owner.userId,
    tenantPseudonym: 'synthetic_closed_tenant',
    closureId: randomUUID(),
  };
  await assert.rejects(() => purge.verifyResiduals(residualInput), /ACCOUNT_CLOSURE_RESIDUAL_DATA/);
  assert.ok(stored.key_hash); // No raw idempotency key was persisted.
  await purge.purgePrivateContent({ tenantId: owner.tenantId, closureId: randomUUID() });
  assert.equal((await purge.verifyResiduals(residualInput)).privateRows, 0);
  passed();
  console.log(JSON.stringify({ status: 'passed', driver: 'postgres', checks }));
} catch (error) {
  console.error(`DRAFT_AI_POSTGRES_FAILED: ${currentCheck} (${error instanceof Error ? error.name : 'Error'})`);
  process.exitCode = 1;
} finally {
  await purge.purgePrivateContent({ tenantId: owner.tenantId, closureId: randomUUID() });
  await client.close();
}
