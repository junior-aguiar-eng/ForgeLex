import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createEvidenceFixture } from '../testing/native-evidence-review-fixture.js';
import { ApprovedCaseContextRepository } from './approved-case-context-repository.js';
import { EvidenceReapprovalRepository } from './evidence-reapproval-repository.js';
import { evidenceHash } from './evidence-review-items.js';
import { MatterRepository } from './matter-repository.js';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((close) => close()));
async function fixture() {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  const review = await f.reviews.preview(f.owner, f.saved.id);
  const items = review.items.filter((i) => ['FACT', 'EVIDENCE'].includes(i.kind));
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: items.map((i) => ({ itemId: i.id, action: 'ADOPT' as const })),
  });
  const repo = new ApprovedCaseContextRepository(f.db);
  const refs = await repo.capture(f.owner, f.matter.id);
  return { ...f, repo, refs, changes: new EvidenceReapprovalRepository(f.db, async () => {}) };
}
it('exige nova aprovação, preserva histórico e reutiliza a nova versão sem duplicar itens', async () => {
  const f = await fixture();
  const original = await f.repo.load(f.owner, f.matter.id, f.refs, true);
  await f.client.execute("UPDATE facts SET statement='Relato corrigido pelo responsável.'");
  await expect(f.repo.capture(f.owner, f.matter.id)).rejects.toThrow('APPROVED_CONTEXT_CHANGED');
  const review = await f.changes.preview(f.owner, f.matter.id);
  expect(review.items).toHaveLength(1);
  expect(review.items[0].current?.text).toBe('Relato corrigido pelo responsável.');
  expect(review.items[0].previous.text).toBe(original.find((s) => s.kind === 'CASE_FACT')!.approvedItem!.text);
  const command = {
    approved: true as const,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    items: review.items.map((i) => ({ deliveryId: i.deliveryId, itemId: i.itemId })),
  };
  await f.changes.approve(f.owner, f.matter.id, command);
  expect((await f.changes.approve(f.owner, f.matter.id, command)).isReplay).toBe(true);
  const fresh = await f.repo.capture(f.owner, f.matter.id);
  expect(fresh).not.toEqual(f.refs);
  expect((await f.repo.load(f.owner, f.matter.id, fresh)).find((s) => s.kind === 'CASE_FACT')!.approvedItem!.text).toBe(
    'Relato corrigido pelo responsável.',
  );
  await expect(f.repo.load(f.owner, f.matter.id, f.refs)).rejects.toThrow('APPROVED_CONTEXT_CHANGED');
  expect(await f.repo.load(f.owner, f.matter.id, f.refs, true)).toEqual(original);
  expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(1);
  expect((await f.client.execute('SELECT id FROM evidence_items')).rows).toHaveLength(1);
  expect((await f.changes.preview(f.owner, f.matter.id)).items).toEqual([]);
});
it('recusa prévia vencida, comando alterado, seleção vazia e aprovação implícita', async () => {
  const f = await fixture();
  await f.client.execute("UPDATE facts SET statement='Primeira edição.'");
  const review = await f.changes.preview(f.owner, f.matter.id);
  const command = {
    approved: true as const,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    items: review.items.map((i) => ({ deliveryId: i.deliveryId, itemId: i.itemId })),
  };
  await f.client.execute("UPDATE facts SET statement='Segunda edição.'");
  await expect(f.changes.approve(f.owner, f.matter.id, command)).rejects.toThrow('EVIDENCE_REVIEW_CONFLICT');
  await expect(f.changes.approve(f.owner, f.matter.id, { ...command, approved: false } as any)).rejects.toThrow();
  await expect(f.changes.approve(f.owner, f.matter.id, { ...command, items: [] })).rejects.toThrow();
  const fresh = await f.changes.preview(f.owner, f.matter.id);
  await f.changes.approve(f.owner, f.matter.id, { ...command, reviewToken: fresh.reviewToken });
  await expect(f.changes.approve(f.owner, f.matter.id, command)).rejects.toThrow('EVIDENCE_COMMAND_CONFLICT');
});

it('revisa texto, condição, fonte e relação; exige seleção explícita do fato alterado junto da prova', async () => {
  const f = await fixture();
  expect((await f.changes.preview(f.owner, f.matter.id)).items).toHaveLength(0);
  await f.client.execute("UPDATE facts SET statement='Novo relato alegado.', status='ASSERTED'");
  await f.client.execute("UPDATE evidence_items SET title='Comprovante conferido.'");
  await f.client.execute("UPDATE evidence_links SET relation='CONTEXT'");
  await f.client.execute("UPDATE evidence_source_links SET relation='CONTEXT'");
  const review = await f.changes.preview(f.owner, f.matter.id);
  expect(review.items).toHaveLength(2);
  const proof = review.items.find((i) => i.current?.kind === 'EVIDENCE')!;
  expect(proof.current).toMatchObject({ text: 'Comprovante conferido.', relation: 'CONTEXT' });
  expect(proof.relatedFactText).toBe('Novo relato alegado.');
  const command = {
    approved: true as const,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    items: [{ deliveryId: proof.deliveryId, itemId: proof.itemId }],
  };
  await expect(f.changes.approve(f.owner, f.matter.id, command)).rejects.toThrow('APPROVED_FACT_REQUIRED');
  await f.changes.approve(f.owner, f.matter.id, {
    ...command,
    items: review.items.map(({ deliveryId, itemId }) => ({ deliveryId, itemId })),
  });
  expect(
    (await f.repo.load(f.owner, f.matter.id, await f.repo.capture(f.owner, f.matter.id))).find(
      (s) => s.kind === 'CASE_FACT',
    )!.approvedItem!.status,
  ).toBe('ASSERTED');
});

it.each(['confirmed', 'missing', 'foreign-anchor', 'invalid-anchor', 'unavailable-proof'])(
  'não aprova condição inválida: %s',
  async (kind) => {
    const f = await fixture();
    if (kind === 'confirmed') await f.client.execute("UPDATE facts SET status='CONFIRMED'");
    if (kind === 'missing') await f.client.execute('DELETE FROM evidence_links');
    if (kind === 'foreign-anchor') await f.client.execute("UPDATE fact_source_links SET tenant_id='other'");
    if (kind === 'invalid-anchor') await f.client.execute("UPDATE document_anchors SET text='Alterado'");
    if (kind === 'unavailable-proof') await f.client.execute("UPDATE evidence_items SET status='UNAVAILABLE'");
    const review = await f.changes.preview(f.owner, f.matter.id);
    if (kind === 'foreign-anchor') {
      // Removal of all links from an allegation is explicitly shown, never silently accepted.
      expect(review.items.find((i) => i.current?.kind === 'FACT')!.current!.sources).toEqual([]);
    } else expect(review.items.some((i) => i.blocked)).toBe(true);
    await expect(f.repo.capture(f.owner, f.matter.id)).rejects.toThrow();
  },
);

it('preserva todas as versões aprovadas, mesmo após editar de novo e mudar a conversa original', async () => {
  const f = await fixture();
  const snapshots = [f.refs];
  for (const text of ['Segunda descrição.', 'Terceira descrição.']) {
    await f.client.execute({ sql: 'UPDATE facts SET statement=?', args: [text] });
    const review = await f.changes.preview(f.owner, f.matter.id);
    await f.changes.approve(f.owner, f.matter.id, {
      approved: true,
      commandId: randomUUID(),
      reviewToken: review.reviewToken,
      items: review.items.map(({ deliveryId, itemId }) => ({ deliveryId, itemId })),
    });
    snapshots.push(await f.repo.capture(f.owner, f.matter.id));
  }
  await f.client.execute('UPDATE agentic_conversations SET context_revision=9');
  expect((await f.changes.preview(f.owner, f.matter.id)).items).toHaveLength(0);
  for (const refs of snapshots) expect(await f.repo.load(f.owner, f.matter.id, refs, true)).toHaveLength(2);
  await f.client.execute("UPDATE facts SET statement='Quarta descrição ainda pendente.'");
  await expect(f.repo.capture(f.owner, f.matter.id)).rejects.toThrow();
});

it('aprova fontes de nova versão somente com âncoras atuais válidas e mantém histórico antigo', async () => {
  const f = await fixture(),
    versionId = randomUUID(),
    anchorId = randomUUID(),
    content = 'Novo documento conferido.';
  await f.client.execute({
    sql: 'INSERT INTO document_versions(id,document_id,version_number,content_hash,content,created_at) VALUES(?,?,2,?,?,?)',
    args: [versionId, f.doc.document.id, evidenceHash(content), content, new Date().toISOString()],
  });
  expect((await f.changes.preview(f.owner, f.matter.id)).items.every((i) => i.blocked)).toBe(true);
  await f.client.execute({
    sql: 'INSERT INTO document_anchors(id,document_version_id,anchor_key,anchor_type,ordinal,start_offset,end_offset,text,content_hash,created_at) VALUES(?,?,?, ?,1,0,?,?,?,?)',
    args: [
      anchorId,
      versionId,
      'novo',
      'PARAGRAPH',
      content.length,
      content,
      evidenceHash(content),
      new Date().toISOString(),
    ],
  });
  // Use one link per target, as the new document has a single anchor.
  await f.client.execute('DELETE FROM fact_source_links');
  await f.client.execute('DELETE FROM evidence_source_links');
  const approved = await f.repo.load(f.owner, f.matter.id, f.refs, true);
  const factId = approved.find((s) => s.kind === 'CASE_FACT')!.approvedItem!.targetId;
  const proofId = approved.find((s) => s.kind === 'CASE_EVIDENCE')!.approvedItem!.targetId;
  await f.client.execute({
    sql: 'INSERT INTO fact_source_links(id,tenant_id,matter_id,fact_id,document_anchor_id,relation,created_at) VALUES(?,?,?,?,?,?,?)',
    args: [randomUUID(), f.owner.tenantId, f.matter.id, factId, anchorId, 'CONTRADICTS', new Date().toISOString()],
  });
  await f.client.execute({
    sql: 'INSERT INTO evidence_source_links(id,tenant_id,matter_id,evidence_item_id,document_anchor_id,relation,created_at) VALUES(?,?,?,?,?,?,?)',
    args: [randomUUID(), f.owner.tenantId, f.matter.id, proofId, anchorId, 'REFUTES', new Date().toISOString()],
  });
  const review = await f.changes.preview(f.owner, f.matter.id);
  expect(review.items.every((i) => i.current?.sources[0].versionId === versionId)).toBe(true);
  await f.changes.approve(f.owner, f.matter.id, {
    approved: true,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    items: review.items.map(({ deliveryId, itemId }) => ({ deliveryId, itemId })),
  });
  expect(await f.repo.load(f.owner, f.matter.id, await f.repo.capture(f.owner, f.matter.id))).toHaveLength(2);
  expect(await f.repo.load(f.owner, f.matter.id, f.refs, true)).toEqual(approved);
});

it('isola proprietário e caso e revalida autorização antes de confirmar', async () => {
  const f = await fixture();
  expect((await f.changes.preview({ ...f.owner, userId: 'other' }, f.matter.id)).items).toEqual([]);
  await expect(f.changes.preview(f.owner, randomUUID())).rejects.toThrow();
  await f.client.execute("UPDATE facts SET statement='Edição que não será aprovada.'");
  const review = await f.changes.preview(f.owner, f.matter.id);
  let calls = 0;
  const revoked = new EvidenceReapprovalRepository(f.db, async () => {
    if (++calls === 3) throw new Error('ACCESS_REVOKED');
  });
  await expect(
    revoked.approve(f.owner, f.matter.id, {
      approved: true,
      commandId: randomUUID(),
      reviewToken: review.reviewToken,
      items: review.items.map(({ deliveryId, itemId }) => ({ deliveryId, itemId })),
    }),
  ).rejects.toThrow('ACCESS_REVOKED');
  await expect(f.repo.capture(f.owner, f.matter.id)).rejects.toThrow();
});

it('permite substituir fonte arquivada sem expor trechos indisponíveis nem liberar histórico revogado', async () => {
  const f = await fixture();
  const original = await f.repo.load(f.owner, f.matter.id, f.refs);
  const doc = await new MatterRepository(f.db).ingestTextDocument({
    ...f.owner,
    createdBy: f.owner.userId,
    matterId: f.matter.id,
    title: 'Fonte substituta',
    originalFilename: 'nova.txt',
    mimeType: 'text/plain',
    content: 'Trecho atual disponível.',
  });
  await f.client.execute({
    sql: "UPDATE legal_documents SET lifecycle_state='ARCHIVED' WHERE id=?",
    args: [f.doc.document.id],
  });
  await f.client.execute('DELETE FROM fact_source_links');
  await f.client.execute('DELETE FROM evidence_source_links');
  const factId = original.find((s) => s.kind === 'CASE_FACT')!.approvedItem!.targetId;
  const proofId = original.find((s) => s.kind === 'CASE_EVIDENCE')!.approvedItem!.targetId;
  await f.client.execute({
    sql: 'INSERT INTO fact_source_links(id,tenant_id,matter_id,fact_id,document_anchor_id,relation,created_at) VALUES(?,?,?,?,?,?,?)',
    args: [
      randomUUID(),
      f.owner.tenantId,
      f.matter.id,
      factId,
      doc.anchors[0].id,
      'CONTRADICTS',
      new Date().toISOString(),
    ],
  });
  await f.client.execute({
    sql: 'INSERT INTO evidence_source_links(id,tenant_id,matter_id,evidence_item_id,document_anchor_id,relation,created_at) VALUES(?,?,?,?,?,?,?)',
    args: [
      randomUUID(),
      f.owner.tenantId,
      f.matter.id,
      proofId,
      doc.anchors[0].id,
      'REFUTES',
      new Date().toISOString(),
    ],
  });
  const review = await f.changes.preview(f.owner, f.matter.id);
  expect(review.items).toHaveLength(2);
  expect(review.items.every((i) => i.previous.sources.length === 0 && i.previousSourcesUnavailable)).toBe(true);
  expect(review.items.every((i) => i.current?.sources[0].quote === 'Trecho atual disponível.' && !i.blocked)).toBe(
    true,
  );
  await f.changes.approve(f.owner, f.matter.id, {
    approved: true,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    items: review.items.map(({ deliveryId, itemId }) => ({ deliveryId, itemId })),
  });
  expect(await f.repo.load(f.owner, f.matter.id, await f.repo.capture(f.owner, f.matter.id))).toHaveLength(2);
  await expect(f.repo.load(f.owner, f.matter.id, f.refs, true)).rejects.toThrow('ACCESS_REVOKED');
});
