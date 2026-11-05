import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createEvidenceFixture } from '../testing/native-evidence-review-fixture.js';
import { ApprovedCaseContextRepository } from './approved-case-context-repository.js';
import { NativeCaseTaskRepository } from './native-case-task-repository.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
async function fixture() {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  const review = await f.reviews.preview(f.owner, f.saved.id);
  const fact = review.items.find((i) => i.kind === 'FACT')!,
    proof = review.items.find((i) => i.kind === 'EVIDENCE')!;
  const adopted = await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: [
      { itemId: fact.id, action: 'ADOPT', text: 'Alegação revisada por Boni.' },
      { itemId: proof.id, action: 'ADOPT', text: 'Recebimento contestado.' },
      { itemId: review.items.find((i) => i.kind === 'GAP')!.id, action: 'DISCARD' },
    ],
  });
  return { ...f, adopted, fact, proof, repo: new ApprovedCaseContextRepository(f.db) };
}
it('recupera automaticamente só fatos e provas aprovados do proprietário e do caso, com trechos e controvérsia', async () => {
  const f = await fixture(),
    refs = await f.repo.capture(f.owner, f.matter.id);
  expect(refs).toHaveLength(2);
  expect(await f.repo.capture({ ...f.owner, userId: 'outro' }, f.matter.id)).toEqual([]);
  const sources = await f.repo.load(f.owner, f.matter.id, refs);
  expect(sources.find((s) => s.kind === 'CASE_FACT')?.approvedItem).toMatchObject({
    text: 'Alegação revisada por Boni.',
    status: 'DISPUTED',
  });
  const proof = sources.find((s) => s.kind === 'CASE_EVIDENCE')!;
  expect(proof.approvedItem).toMatchObject({ relation: 'CONTRADICTS', text: 'Recebimento contestado.' });
  expect(proof.approvedItem!.sources).toHaveLength(2);
  await expect(f.repo.load({ ...f.owner, userId: 'outro' }, f.matter.id, refs)).rejects.toThrow();
  await expect(f.repo.load(f.owner, randomUUID(), refs)).rejects.toThrow();
});
it.each(['text', 'status', 'relation', 'anchor', 'document', 'receipt', 'delivery'])(
  'bloqueia alteração de %s antes do uso',
  async (kind) => {
    const f = await fixture(),
      refs = await f.repo.capture(f.owner, f.matter.id);
    if (kind === 'text') await f.client.execute("UPDATE facts SET statement='Outro relato'");
    if (kind === 'status') await f.client.execute("UPDATE facts SET status='CONFIRMED'");
    if (kind === 'relation') await f.client.execute("UPDATE evidence_links SET relation='SUPPORTS'");
    if (kind === 'anchor') await f.client.execute("UPDATE document_anchors SET text='Alterado'");
    if (kind === 'document') await f.client.execute("UPDATE legal_documents SET lifecycle_state='ARCHIVED'");
    if (kind === 'receipt') await f.client.execute('UPDATE agentic_task_deliveries SET evidence_review_json=NULL');
    if (kind === 'delivery') await f.client.execute("UPDATE agentic_task_deliveries SET content_hash='alterado'");
    await expect(f.repo.load(f.owner, f.matter.id, refs)).rejects.toThrow();
  },
);
it('leva trechos aprovados ao packet e vincula fatos e provas às seções sem aprovar a minuta', async () => {
  const f = await fixture(),
    refs = await f.repo.capture(f.owner, f.matter.id);
  const conversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: 'Elaborar peça',
    context: { origin: 'USER', text: '', documents: [], approvedItems: refs },
  });
  const run = await f.workspace.createExecution(f.owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: randomUUID(),
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await f.workspace.compareAndSetStatus(f.owner, run.id, 'QUEUED', 'RUNNING');
  const native = new NativeCaseTaskRepository(f.db, async () => {});
  const binding = {
    ...f.owner,
    executionId: run.id,
    conversationId: conversation.id,
    contextRevision: 1,
    matterId: f.matter.id,
    objective: 'Elaborar peça',
  };
  const packet = await native.load(binding);
  expect(packet.sources.map((s) => s.kind).sort()).toEqual(['CASE_EVIDENCE', 'CASE_FACT']);
  const saved = await native.save(binding, {
    ...f.delivery,
    action: 'create_document',
    evidenceMatrix: undefined,
    contextId: conversation.id,
    claims: [],
    issues: [],
    sources: packet.sources.map(({ text: _, ...s }) => s),
    document: {
      title: 'Minuta',
      documentType: 'Peça preliminar',
      sections: [{ title: 'Fatos', content: 'Alegação controvertida.', sourceIds: packet.sources.map((s) => s.id) }],
    },
  });
  expect(saved.draftId).toBeTruthy();
  const section = (await f.client.execute('SELECT linked_fact_ids, linked_evidence_ids FROM draft_sections')).rows[0];
  expect(JSON.parse(String(section.linked_fact_ids))).toEqual([f.adopted.decisions[f.fact.id].targetId]);
  expect(JSON.parse(String(section.linked_evidence_ids))).toEqual([f.adopted.decisions[f.proof.id].targetId]);
  expect((await f.client.execute('SELECT status FROM draft_versions')).rows[0].status).toBe('DRAFT');
  for (const kind of ['AUTHORITY', 'USER_TEXT'] as const) {
    await expect(
      native.save(binding, {
        ...f.delivery,
        contextId: conversation.id,
        sources: packet.sources.map(({ text: _, approvedItem: _item, ...s }) => ({ ...s, kind })),
      }),
    ).rejects.toThrow('SOURCE_REFERENCE_INVALID');
  }
  await f.client.execute("UPDATE facts SET statement='Alteração posterior'");
  await expect(native.assert(binding)).rejects.toThrow();
  expect((await native.getDelivery(f.owner, saved.id)).delivery.document?.sections[0].content).toBe(
    'Alegação controvertida.',
  );
  await f.client.execute("UPDATE legal_documents SET lifecycle_state='ARCHIVED'");
  await expect(native.getDelivery(f.owner, saved.id)).rejects.toThrow();
});

it('nova aprovação só entra em novo pedido; consulta histórica conserva a versão original', async () => {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  const repo = new ApprovedCaseContextRepository(f.db);
  let review = await f.reviews.preview(f.owner, f.saved.id);
  const fact = review.items.find((i) => i.kind === 'FACT')!,
    proof = review.items.find((i) => i.kind === 'EVIDENCE')!;
  review = await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: [{ itemId: fact.id, action: 'ADOPT' }],
  });
  const frozen = await repo.capture(f.owner, f.matter.id);
  expect(frozen).toHaveLength(1);
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: [{ itemId: proof.id, action: 'ADOPT' }],
  });
  expect(await repo.load(f.owner, f.matter.id, frozen)).toHaveLength(1);
  expect(await repo.capture(f.owner, f.matter.id)).toHaveLength(2);
  await f.client.execute({
    sql: 'INSERT INTO document_versions(id,document_id,version_number,content_hash,content,created_at) VALUES(?,?,2,?,?,?)',
    args: [randomUUID(), f.doc.document.id, 'c'.repeat(64), 'Versão nova', new Date().toISOString()],
  });
  await expect(repo.load(f.owner, f.matter.id, frozen)).rejects.toThrow();
  expect(await repo.load(f.owner, f.matter.id, frozen, true)).toHaveLength(1);
});
