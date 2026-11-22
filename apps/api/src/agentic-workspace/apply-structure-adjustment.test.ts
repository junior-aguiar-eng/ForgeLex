import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { NativeCaseTaskRepository } from '@forgelex/persistence';
import { structureItemsSource, type AgenticTaskDelivery, type StructureCommand } from '@forgelex/domain';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { applyStructureAdjustment } from './apply-structure-adjustment.js';
import { findCurrentStructure } from './current-structure.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const run of cleanup.splice(0)) run();
});
const pedido = 'Tire a lacuna sobre o recibo. O cliente também pagou abril em dinheiro.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

async function setup() {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  // The correction runs in its own conversation of the case (the tab sends no conversationId).
  const conversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: pedido,
    context: { origin: 'USER', text: pedido, documents: [] },
  });
  const execution = await f.workspace.createExecution(f.owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: randomUUID(),
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await f.workspace.compareAndSetStatus(f.owner, execution.id, 'QUEUED', 'RUNNING');
  const native = new NativeCaseTaskRepository(f.db, async () => {});
  const deps = { store: { workspace: f.workspace }, native, reviews: f.reviews };
  const items = (await f.reviews.preview(f.owner, f.saved.id)).items;
  const byKind = (kind: string) => items.find((i) => i.kind === kind)!;
  /** The adjust delivery as saved by the run: the structure source pins what the agent saw. */
  const adjustment = async (commands: StructureCommand[], caseSummary = 'Caso sintético: nada está provado.') => {
    const review = await f.reviews.preview(f.owner, f.saved.id);
    const structure = structureItemsSource(f.saved.id, review.items, new Set(Object.keys(review.decisions)));
    const delivery: AgenticTaskDelivery = {
      action: 'adjust_structure',
      contextId: conversation.id,
      contextRevision: 1,
      status: 'CANDIDATE',
      humanReviewRequired: true,
      legalAssessment: 'NOT_EVALUATED',
      sources: [
        { id: `user:${sha(pedido)}`, kind: 'USER_TEXT', contentHash: sha(pedido) },
        { id: structure.id, kind: structure.kind, contentHash: structure.contentHash, extent: 'SELECTED_TEXT' },
      ],
      requirements: [],
      findings: [],
      claims: [],
      issues: [{ id: 'issue', statement: 'Ajustar a estrutura', sourceIds: [`user:${sha(pedido)}`] }],
      structureAdjustment: { commands, caseSummary },
    };
    return { id: `delivery:${execution.id}`, delivery };
  };
  const apply = (saved: Awaited<ReturnType<typeof adjustment>>) =>
    applyStructureAdjustment(deps, f.owner, f.matter.id, saved);
  const rows = async (table: string) => (await f.client.execute(`SELECT * FROM ${table}`)).rows;
  return { f, deps, items, byKind, adjustment, apply, rows, execution, native };
}

it('ALTERAR e REMOVER viram decisões e o fato alterado aparece no caso', async () => {
  const { f, byKind, adjustment, apply, rows } = await setup();
  const fact = byKind('FACT'),
    gap = byKind('GAP');
  const result = await apply(
    await adjustment([
      { op: 'ALTERAR', itemId: fact.id, texto: 'A parte alega pagamento em dinheiro.' },
      { op: 'REMOVER', itemId: gap.id },
    ]),
  );
  expect(result).toEqual({ applied: 2, questions: [] });
  const review = await f.reviews.preview(f.owner, f.saved.id);
  expect(review.decisions[fact.id]).toMatchObject({ action: 'ADOPT', text: 'A parte alega pagamento em dinheiro.' });
  expect(review.decisions[gap.id]).toMatchObject({ action: 'DISCARD' });
  expect((await f.client.execute('SELECT statement FROM facts')).rows).toEqual([
    { statement: 'A parte alega pagamento em dinheiro.' },
  ]);
  expect(await rows('facts')).toHaveLength(1);
});

it('ACRESCENTAR cria item com selo e não cria fato no caso', async () => {
  const { f, adjustment, apply, rows } = await setup();
  const result = await apply(
    await adjustment([
      { op: 'ACRESCENTAR', texto: 'O cliente pagou abril em dinheiro.', frase: 'pagou abril em dinheiro' },
    ]),
  );
  expect(result).toEqual({ applied: 1, questions: [] });
  const review = await f.reviews.preview(f.owner, f.saved.id);
  const added = review.items.filter((i) => i.userAdded);
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({
    text: 'O cliente pagou abril em dinheiro.',
    classification: 'ALLEGATION',
    sources: [],
    userAdded: { frase: 'pagou abril em dinheiro' },
  });
  expect(review.decisions[added[0]!.id]).toBeUndefined();
  expect(await rows('facts')).toHaveLength(0);
  expect(await rows('evidence_items')).toHaveLength(0);
  expect(await rows('timeline_events')).toHaveLength(0);
});

it('reaplicar o mesmo trabalho não duplica nada e devolve o mesmo resultado', async () => {
  const { f, byKind, adjustment, apply, rows } = await setup();
  const saved = await adjustment([
    { op: 'ALTERAR', itemId: byKind('FACT').id, texto: 'A parte alega pagamento em dinheiro.' },
    { op: 'ACRESCENTAR', texto: 'O cliente pagou abril em dinheiro.', frase: 'pagou abril' },
  ]);
  const first = await apply(saved);
  const revision = (await f.reviews.preview(f.owner, f.saved.id)).revision;
  const again = await apply(saved);
  expect(again).toEqual(first);
  const review = await f.reviews.preview(f.owner, f.saved.id);
  expect(review.revision).toBe(revision);
  expect(review.items.filter((i) => i.userAdded)).toHaveLength(1);
  expect(await rows('facts')).toHaveLength(1);
});

it('item já decidido devolve JA_DECIDIDO sem lançar e aplica o resto', async () => {
  const { f, byKind, adjustment, apply } = await setup();
  const gap = byKind('GAP'),
    fact = byKind('FACT');
  const before = await f.reviews.preview(f.owner, f.saved.id);
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: before.revision,
    reviewToken: before.reviewToken,
    decisions: [{ itemId: gap.id, action: 'DISCARD' }],
  });
  const result = await apply(
    await adjustment([
      { op: 'REMOVER', itemId: gap.id },
      { op: 'REMOVER', itemId: fact.id },
    ]),
  );
  expect(result).toEqual({ applied: 1, questions: [{ itemId: gap.id, reason: 'JA_DECIDIDO' }] });
  expect((await f.reviews.preview(f.owner, f.saved.id)).decisions[fact.id]).toMatchObject({ action: 'DISCARD' });
});

it('análise vigente trocada entre o pedido e a aplicação: nada se aplica e volta pergunta', async () => {
  const { f, byKind, adjustment, apply, rows } = await setup();
  const saved = await adjustment([
    { op: 'ALTERAR', itemId: byKind('FACT').id, texto: 'A parte alega pagamento em dinheiro.' },
    { op: 'ACRESCENTAR', texto: 'O cliente pagou abril em dinheiro.', frase: 'pagou abril' },
  ]);
  // The user changed the analysis after the agent read it.
  await f.reviews.addUserItems(f.owner, f.saved.id, [{ texto: 'Outro fato informado.', frase: 'outro' }]);
  const changed = await f.reviews.preview(f.owner, f.saved.id);
  expect(await apply(saved)).toEqual({ applied: 0, questions: [{ reason: 'ANALISE_ALTERADA' }] });
  const after = await f.reviews.preview(f.owner, f.saved.id);
  expect(after.revision).toBe(changed.revision);
  expect(after.items.filter((i) => i.userAdded)).toHaveLength(1);
  expect(await rows('facts')).toHaveLength(0);
});

it('fonte de estrutura de outra análise: nada se aplica e volta pergunta', async () => {
  const { f, byKind, adjustment, apply, rows } = await setup();
  const saved = await adjustment([{ op: 'REMOVER', itemId: byKind('GAP').id }]);
  saved.delivery.sources = saved.delivery.sources.map((s) =>
    s.kind === 'PREVIOUS_DELIVERY' ? { ...s, id: 'structure:delivery:outra-analise' } : s,
  );
  expect(await apply(saved)).toEqual({ applied: 0, questions: [{ reason: 'ANALISE_ALTERADA' }] });
  expect(Object.keys((await f.reviews.preview(f.owner, f.saved.id)).decisions)).toHaveLength(0);
  expect(await rows('facts')).toHaveLength(0);
});

it('frase que não está no pedido do usuário não é acrescentada', async () => {
  const { f, adjustment, apply } = await setup();
  const result = await apply(
    await adjustment([{ op: 'ACRESCENTAR', texto: 'O cliente pagou maio em cheque.', frase: 'pagou maio em cheque' }]),
  );
  expect(result).toEqual({
    applied: 0,
    questions: [{ reason: 'FRASE_NAO_ENCONTRADA', texto: 'O cliente pagou maio em cheque.' }],
  });
  expect((await f.reviews.preview(f.owner, f.saved.id)).items.filter((i) => i.userAdded)).toHaveLength(0);
});

it('lista vazia de comandos só guarda o resumo do caso', async () => {
  const { f, adjustment, apply, execution } = await setup();
  const before = await f.reviews.preview(f.owner, f.saved.id);
  expect(await apply(await adjustment([], 'Resumo sintético do caso.'))).toEqual({ applied: 0, questions: [] });
  const after = await f.reviews.preview(f.owner, f.saved.id);
  expect(after.revision).toBe(before.revision);
  expect(after.reviewToken).toBe(before.reviewToken);
  expect(Object.values(after.adjustments ?? {})).toEqual([
    expect.objectContaining({
      executionId: execution.id,
      applied: 0,
      questions: [],
      caseSummary: 'Resumo sintético do caso.',
    }),
  ]);
});

it('o resumo e as perguntas ficam guardados com a revisão da análise', async () => {
  const { f, byKind, adjustment, apply, execution } = await setup();
  const gap = byKind('GAP');
  await apply(
    await adjustment([
      { op: 'REMOVER', itemId: gap.id },
      { op: 'ACRESCENTAR', texto: 'O cliente pagou maio em cheque.', frase: 'pagou maio' },
    ]),
  );
  const record = Object.values((await f.reviews.preview(f.owner, f.saved.id)).adjustments ?? {})[0];
  expect(record).toMatchObject({
    executionId: execution.id,
    applied: 1,
    caseSummary: 'Caso sintético: nada está provado.',
    questions: [{ reason: 'FRASE_NAO_ENCONTRADA', texto: 'O cliente pagou maio em cheque.' }],
  });
});

it('acréscimo que passaria do limite de 50 itens não entra e volta pergunta', async () => {
  const { f, byKind, adjustment, apply } = await setup();
  await f.reviews.addUserItems(
    f.owner,
    f.saved.id,
    Array.from({ length: 50 }, (_, i) => ({ texto: `Fato sintético número ${i}.`, frase: 'sintético' })),
  );
  const result = await apply(
    await adjustment([
      { op: 'ACRESCENTAR', texto: 'O cliente pagou abril em dinheiro.', frase: 'pagou abril' },
      { op: 'REMOVER', itemId: byKind('GAP').id },
    ]),
  );
  expect(result).toEqual({ applied: 1, questions: [{ reason: 'LIMITE_DE_ITENS' }] });
  expect((await f.reviews.preview(f.owner, f.saved.id)).items.filter((i) => i.userAdded)).toHaveLength(50);
});
