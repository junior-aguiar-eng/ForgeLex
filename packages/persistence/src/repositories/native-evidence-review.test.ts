import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { evidenceHash } from './evidence-review-items.js';
import { createDatabase } from '../db.js';
import { createEvidenceFixture } from '../testing/native-evidence-review-fixture.js';
import type { EvidenceReview, EvidenceReviewCommand } from '@forgelex/domain';

const connections: Awaited<ReturnType<typeof createDatabase>>[] = [];
afterEach(() => {
  for (const c of connections.splice(0)) c.client.close();
});
async function evidenceFixture() {
  const f = await createEvidenceFixture();
  connections.push(f);
  return f;
}
function command(review: EvidenceReview, decisions: EvidenceReviewCommand['decisions']): EvidenceReviewCommand {
  return {
    approved: true,
    commandId: randomUUID(),
    reviewToken: review.reviewToken,
    expectedRevision: review.revision,
    decisions,
  };
}
it('preview é somente proposta; incorpora subconjunto editado com âncoras, decisão e repetição sem duplicar', async () => {
  const f = await evidenceFixture();
  const before = (await f.client.execute('SELECT payload_json,content_hash FROM agentic_task_deliveries')).rows;
  const review = await f.reviews.preview(f.owner, f.saved.id);
  expect(review.decisions).toEqual({});
  expect((await f.client.execute('SELECT * FROM facts')).rows).toHaveLength(0);
  const fact = review.items.find((i) => i.kind === 'FACT')!;
  const evidence = review.items.find((i) => i.kind === 'EVIDENCE')!;
  expect(fact.sources).toHaveLength(2);
  expect(fact.blockedReasons).toEqual([]);
  const input = command(review, [
    { itemId: evidence.id, action: 'ADOPT', text: 'Relato controvertido' },
    { itemId: fact.id, action: 'ADOPT', text: 'Alegação revisada por Boni.' },
  ]);
  const result = await f.reviews.decide(f.owner, f.saved.id, input);
  expect(result.revision).toBe(2);
  expect(result.decisions[fact.id]).toMatchObject({
    text: 'Alegação revisada por Boni.',
    decidedBy: f.owner.userId,
    action: 'ADOPT',
  });
  expect((await f.client.execute('SELECT statement,status FROM facts')).rows).toEqual([
    { statement: 'Alegação revisada por Boni.', status: 'DISPUTED' },
  ]);
  expect((await f.client.execute('SELECT * FROM evidence_items')).rows).toHaveLength(1);
  expect((await f.reviews.decide(f.owner, f.saved.id, input)).isReplay).toBe(true);
  expect((await f.client.execute('SELECT * FROM facts')).rows).toHaveLength(1);
  expect((await f.client.execute('SELECT payload_json,content_hash FROM agentic_task_deliveries')).rows).toEqual(
    before,
  );
  await expect(
    f.reviews.decide(f.owner, f.saved.id, { ...input, decisions: [{ itemId: fact.id, action: 'DISCARD' }] }),
  ).rejects.toThrow('EVIDENCE_COMMAND_CONFLICT');
  await expect(f.reviews.preview({ ...f.owner, userId: 'other' }, f.saved.id)).rejects.toThrow('DELIVERY_NOT_FOUND');
  f.revoke();
  await expect(f.reviews.decide(f.owner, f.saved.id, input)).rejects.toThrow('ACCESS_REVOKED');
});
it('exige aprovação, revisão atual e fato selecionado; reverte lote inválido', async () => {
  const f = await evidenceFixture();
  const review = await f.reviews.preview(f.owner, f.saved.id);
  const fact = review.items.find((i) => i.kind === 'FACT')!,
    evidence = review.items.find((i) => i.kind === 'EVIDENCE')!;
  await expect(
    f.reviews.decide(f.owner, f.saved.id, {
      ...command(review, [{ itemId: fact.id, action: 'ADOPT' }]),
      approved: false,
    } as never),
  ).rejects.toThrow();
  await expect(
    f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: evidence.id, action: 'ADOPT' }])),
  ).rejects.toThrow('ANALYSIS_FACT_REQUIRED');
  await expect(
    f.reviews.decide(
      f.owner,
      f.saved.id,
      command(review, [
        { itemId: fact.id, action: 'ADOPT' },
        { itemId: 'a'.repeat(64), action: 'ADOPT' },
      ]),
    ),
  ).rejects.toThrow('EVIDENCE_ITEM_INVALID');
  expect((await f.client.execute('SELECT * FROM facts')).rows).toHaveLength(0);
  await f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: fact.id, action: 'DISCARD' }]));
  await expect(
    f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: evidence.id, action: 'ADOPT' }])),
  ).rejects.toThrow('EVIDENCE_REVIEW_CONFLICT');
});
it('mudança de documento invalida preview e bloqueia incorporação; descarte continua possível', async () => {
  const f = await evidenceFixture(),
    review = await f.reviews.preview(f.owner, f.saved.id);
  const fact = review.items.find((i) => i.kind === 'FACT')!;
  await f.client.execute({
    sql: "UPDATE legal_documents SET lifecycle_state='ARCHIVED',lifecycle_revision=lifecycle_revision+1 WHERE id=?",
    args: [f.doc.document.id],
  });
  await expect(
    f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: fact.id, action: 'ADOPT' }])),
  ).rejects.toThrow('EVIDENCE_REVIEW_CONFLICT');
  const current = await f.reviews.preview(f.owner, f.saved.id);
  expect(current.items.find((i) => i.id === fact.id)!.blockedReasons).not.toHaveLength(0);
  await expect(
    f.reviews.decide(f.owner, f.saved.id, command(current, [{ itemId: fact.id, action: 'ADOPT' }])),
  ).rejects.toThrow('EVIDENCE_SOURCE_UNAVAILABLE');
  expect(
    (await f.reviews.decide(f.owner, f.saved.id, command(current, [{ itemId: fact.id, action: 'DISCARD' }]))).decisions[
      fact.id
    ].action,
  ).toBe('DISCARD');
});

async function replaceDelivery(f: Awaited<ReturnType<typeof evidenceFixture>>) {
  const payload = JSON.stringify(f.delivery);
  await f.client.execute({
    sql: 'UPDATE agentic_task_deliveries SET payload_json=?, content_hash=? WHERE id=?',
    args: [payload, evidenceHash(payload), f.saved.id],
  });
}
it('relato vira alegação com proveniência, nunca prova; data incerta exige revisão humana', async () => {
  const f = await evidenceFixture();
  const source = f.delivery.sources.find((s) => s.kind === 'USER_TEXT')!;
  const ref = {
    sourceId: source.id,
    sourceContentHash: source.contentHash,
    quote: 'Relato da parte.',
    start: 0,
    quoteStatus: 'MATCHED' as const,
    relation: 'CONTEXT' as const,
  };
  f.delivery.claims[0].classification = 'ALLEGATION';
  f.delivery.claims[0].sourceIds = [source.id];
  f.delivery.evidenceMatrix!.rows[0].references = [ref];
  f.delivery.evidenceMatrix!.rows[0].coverage = 'CONTEXT_ONLY';
  Object.assign(f.delivery.evidenceMatrix!.chronology[0], {
    reference: ref,
    sortDate: null,
    dateText: 'Data a esclarecer',
    dateStatus: 'UNCERTAIN',
  });
  await replaceDelivery(f);
  const review = await f.reviews.preview(f.owner, f.saved.id);
  expect(review.items.some((i) => i.kind === 'EVIDENCE')).toBe(false);
  const fact = review.items.find((i) => i.kind === 'FACT')!,
    event = review.items.find((i) => i.kind === 'TIMELINE')!;
  expect(fact.sources).toEqual([]);
  await expect(
    f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: event.id, action: 'ADOPT' }])),
  ).rejects.toThrow('EVIDENCE_DATE_REQUIRED');
  await expect(
    f.reviews.decide(
      f.owner,
      f.saved.id,
      command(review, [{ itemId: event.id, action: 'ADOPT', eventDate: '2026-02-30' }]),
    ),
  ).rejects.toThrow();
  const result = await f.reviews.decide(
    f.owner,
    f.saved.id,
    command(review, [
      { itemId: fact.id, action: 'ADOPT' },
      { itemId: event.id, action: 'ADOPT', eventDate: '2026-02-28' },
    ]),
  );
  expect(result.decisions[event.id].eventDate).toBe('2026-02-28');
  expect(result.decisions[fact.id].proposal.references[0].sourceId).toBe(source.id);
  expect((await f.client.execute('SELECT status FROM facts')).rows[0].status).toBe('ASSERTED');
  expect((await f.client.execute('SELECT source_anchor_id FROM timeline_events')).rows[0].source_anchor_id).toBeNull();
});
it.each(['offset', 'hash', 'anchor', 'case', 'version'])(
  'recusa referência documental divergente: %s',
  async (kind) => {
    const f = await evidenceFixture();
    if (kind === 'offset') f.delivery.evidenceMatrix!.rows[0].references[0].start = 1;
    if (kind === 'hash') f.delivery.sources.find((s) => s.kind === 'DOCUMENT')!.contentHash = '0'.repeat(64);
    if (kind === 'anchor')
      await f.client.execute({
        sql: 'UPDATE document_anchors SET text=? WHERE id=?',
        args: ['Texto divergente', f.doc.anchors[0].id],
      });
    if (kind === 'case')
      await f.client.execute({
        sql: "UPDATE legal_documents SET tenant_id='outro' WHERE id=?",
        args: [f.doc.document.id],
      });
    if (kind === 'version') {
      await f.client.execute({
        sql: 'INSERT INTO document_versions (id,document_id,version_number,content_hash,content,created_at) VALUES (?,?,2,?,?,?)',
        args: [randomUUID(), f.doc.document.id, evidenceHash('Nova versão'), 'Nova versão', new Date().toISOString()],
      });
    }
    await replaceDelivery(f);
    const review = await f.reviews.preview(f.owner, f.saved.id),
      fact = review.items.find((i) => i.kind === 'FACT')!;
    expect(fact.blockedReasons.length).toBeGreaterThan(0);
    await expect(
      f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: fact.id, action: 'ADOPT' }])),
    ).rejects.toThrow('EVIDENCE_SOURCE_UNAVAILABLE');
  },
);
it('revalida acesso antes do commit e reverte itens e decisões se revogado', async () => {
  const f = await evidenceFixture();
  const { NativeEvidenceReviewRepository } = await import('./native-evidence-review-repository.js');
  const review = await f.reviews.preview(f.owner, f.saved.id);
  const guarded = new NativeEvidenceReviewRepository(f.db, async (_owner, _matter, db) => {
    const { FactsEvidenceRepository } = await import('./facts-evidence-repository.js');
    if ((await new FactsEvidenceRepository(db).listFacts(f.owner.tenantId, f.matter.id)).length)
      throw new Error('ACCESS_REVOKED');
  });
  await expect(
    guarded.decide(f.owner, f.saved.id, command(review, [{ itemId: review.items[0].id, action: 'ADOPT' }])),
  ).rejects.toThrow('ACCESS_REVOKED');
  expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(0);
  expect((await f.reviews.preview(f.owner, f.saved.id)).revision).toBe(1);
});
it.each(['context', 'execution', 'matter', 'tenant', 'payload'])(
  'bloqueia alteração ou encerramento: %s',
  async (kind) => {
    const f = await evidenceFixture(),
      review = await f.reviews.preview(f.owner, f.saved.id);
    if (kind === 'context') await f.client.execute('UPDATE agentic_conversations SET context_revision=2');
    if (kind === 'execution') {
      const execution = await f.workspace.getExecution(f.owner, f.execution.id);
      await f.client.execute({
        sql: 'UPDATE agentic_executions SET payload_json=? WHERE id=?',
        args: [JSON.stringify({ ...execution, status: 'FAILED' }), f.execution.id],
      });
    }
    if (kind === 'matter') await f.client.execute("UPDATE matters SET lifecycle_state='ARCHIVED'");
    if (kind === 'tenant') await f.client.execute('UPDATE agentic_tenant_guards SET closed=1');
    if (kind === 'payload') await f.client.execute("UPDATE agentic_task_deliveries SET content_hash='alterado'");
    await expect(
      f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: review.items[0].id, action: 'ADOPT' }])),
    ).rejects.toThrow();
    expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(0);
  },
);

it.each(['items', 'bytes'])('limite de revisão %s falha sem truncar ou gravar', async (kind) => {
  const f = await evidenceFixture();
  const row = f.delivery.evidenceMatrix!.rows[0];
  f.delivery.claims[0].statement = kind === 'bytes' ? 'a'.repeat(16000) : 'Alegação sintética.';
  f.delivery.evidenceMatrix!.rows = Array.from({ length: 100 }, (_, i) => ({
    ...row,
    id: `row-${i}`,
    gaps: kind === 'items' ? Array.from({ length: 10 }, () => 'Documento necessário.') : [],
  }));
  await replaceDelivery(f);
  await expect(f.reviews.preview(f.owner, f.saved.id)).rejects.toThrow('EVIDENCE_REVIEW_LIMIT');
  expect(
    (await f.client.execute('SELECT evidence_review_json FROM agentic_task_deliveries')).rows[0].evidence_review_json,
  ).toBeNull();
});
it('recusa identificador reservado e recibo alterado sem criar itens', async () => {
  const f = await evidenceFixture(),
    review = await f.reviews.preview(f.owner, f.saved.id);
  await expect(
    f.reviews.decide(f.owner, f.saved.id, command(review, [{ itemId: '__proto__', action: 'ADOPT' }])),
  ).rejects.toThrow();
  await f.client.execute({
    sql: 'UPDATE agentic_task_deliveries SET evidence_review_json=?',
    args: [
      JSON.stringify({
        version: 1,
        revision: 2,
        commands: {},
        decisions: { ['a'.repeat(64)]: { targetId: 'inventado' } },
      }),
    ],
  });
  await expect(f.reviews.preview(f.owner, f.saved.id)).rejects.toThrow('DELIVERY_INTEGRITY_FAILED');
  expect((await f.client.execute('SELECT id FROM facts')).rows).toHaveLength(0);
});
