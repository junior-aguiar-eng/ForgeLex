import { createHash, randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { NativeCaseTaskRepository } from '@forgelex/persistence';
import {
  structureItemsSource,
  type AgenticTaskDelivery,
  type EvidenceReviewItem,
  type StructureCommand,
} from '@forgelex/domain';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { applyStructureAdjustment, structureSourceKey } from './apply-structure-adjustment.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const run of cleanup.splice(0)) run();
});
const pedido = 'Tire a lacuna sobre o recibo. O cliente também pagou abril em dinheiro.';
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Um caso com duas análises (E4): a do fixture e uma segunda, de outro texto, enviada depois. */
async function setup() {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  const native = new NativeCaseTaskRepository(f.db, async () => {});
  await pause();
  const second = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: 'Analisar o segundo relato',
    context: {
      origin: 'MIXED',
      text: 'Segundo relato da parte.',
      documents: [{ documentId: f.doc.document.id, versionId: f.doc.version.id }],
    },
  });
  const secondExecution = await f.workspace.createExecution(f.owner, {
    conversationId: second.id,
    contextRevision: 1,
    idempotencyKey: randomUUID(),
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await f.workspace.compareAndSetStatus(f.owner, secondExecution.id, 'QUEUED', 'RUNNING');
  const binding = {
    ...f.owner,
    conversationId: second.id,
    executionId: secondExecution.id,
    contextRevision: 1,
    matterId: f.matter.id,
    objective: 'Analisar o segundo relato',
    actionId: 'analyze_evidence' as const,
  };
  const packet = await native.load(binding);
  const secondSaved = await native.save(binding, {
    ...f.delivery,
    contextId: second.id,
    sources: packet.sources.map(({ text: _text, ...source }) => source),
  });
  await f.workspace.compareAndSetStatus(f.owner, secondExecution.id, 'RUNNING', 'COMPLETED');

  // A correção roda numa conversa própria do caso.
  await pause();
  const adjustConversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: pedido,
    context: { origin: 'USER', text: pedido, documents: [] },
  });
  const adjustExecution = await f.workspace.createExecution(f.owner, {
    conversationId: adjustConversation.id,
    contextRevision: 1,
    idempotencyKey: randomUUID(),
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await f.workspace.compareAndSetStatus(f.owner, adjustExecution.id, 'QUEUED', 'RUNNING');
  const deps = { store: { workspace: f.workspace }, native, reviews: f.reviews };
  const firstReview = () => f.reviews.preview(f.owner, f.saved.id);
  const secondReview = () => f.reviews.preview(f.owner, secondSaved.id);
  /** A entrega do ajuste como o trabalho a salvou: a fonte da estrutura fixa as duas análises que o agente viu. */
  const adjustment = async (commands: StructureCommand[]) => {
    const [a, b] = [await firstReview(), await secondReview()];
    const structure = structureItemsSource(
      structureSourceKey(f.matter.id, [f.saved.id, secondSaved.id]),
      [...a.items, ...b.items],
      new Set([...Object.keys(a.decisions), ...Object.keys(b.decisions)]),
    );
    const delivery: AgenticTaskDelivery = {
      action: 'adjust_structure',
      contextId: adjustConversation.id,
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
      structureAdjustment: { commands, caseSummary: 'Caso sintético com dois relatos.' },
    };
    return { id: `delivery:${adjustExecution.id}`, delivery };
  };
  const apply = (saved: Awaited<ReturnType<typeof adjustment>>) =>
    applyStructureAdjustment(deps, f.owner, f.matter.id, saved);
  const byKind = (items: EvidenceReviewItem[], kind: string) => items.find((i) => i.kind === kind)!;
  return { f, secondSaved, firstReview, secondReview, adjustment, apply, byKind };
}

it('cada comando vai para a análise dona do item; ACRESCENTAR entra na mais recente', async () => {
  const { secondSaved, f, firstReview, secondReview, adjustment, apply, byKind } = await setup();
  const gapOfFirst = byKind((await firstReview()).items, 'GAP');
  const factOfSecond = byKind((await secondReview()).items, 'FACT');
  const result = await apply(
    await adjustment([
      { op: 'REMOVER', itemId: gapOfFirst.id },
      { op: 'ALTERAR', itemId: factOfSecond.id, texto: 'A parte alega pagamento em dinheiro.' },
      { op: 'ACRESCENTAR', texto: 'O cliente pagou abril em dinheiro.', frase: 'pagou abril em dinheiro' },
    ]),
  );
  expect(result).toEqual({ applied: 3, questions: [] });
  const [first, second] = [await firstReview(), await secondReview()];
  expect(first.decisions[gapOfFirst.id]).toMatchObject({ action: 'DISCARD' });
  expect(Object.keys(first.decisions)).toEqual([gapOfFirst.id]);
  expect(second.decisions[factOfSecond.id]).toMatchObject({ action: 'ADOPT' });
  expect(second.items.filter((i) => i.userAdded)).toHaveLength(1);
  expect(first.items.filter((i) => i.userAdded)).toHaveLength(0);
  // Cada análise guarda o seu registro de ajuste.
  expect(Object.values(second.adjustments ?? {})).toEqual([expect.objectContaining({ applied: 2 })]);
  expect(Object.values(first.adjustments ?? {})).toEqual([expect.objectContaining({ applied: 1 })]);
  expect(secondSaved.id).not.toBe(f.saved.id);
});

it('reaplicar o mesmo trabalho não duplica nada em nenhuma das análises', async () => {
  const { firstReview, secondReview, adjustment, apply, byKind } = await setup();
  const gap = byKind((await firstReview()).items, 'GAP');
  const saved = await adjustment([
    { op: 'REMOVER', itemId: gap.id },
    { op: 'ACRESCENTAR', texto: 'O cliente pagou abril em dinheiro.', frase: 'pagou abril em dinheiro' },
  ]);
  const first = await apply(saved);
  const revisions = [(await firstReview()).revision, (await secondReview()).revision];
  expect(await apply(saved)).toEqual(first);
  expect([(await firstReview()).revision, (await secondReview()).revision]).toEqual(revisions);
  expect((await secondReview()).items.filter((i) => i.userAdded)).toHaveLength(1);
});

it('uma das análises mudou depois da leitura: nada se aplica em nenhuma e volta pergunta', async () => {
  const { firstReview, secondReview, adjustment, apply, byKind, f, secondSaved } = await setup();
  const gap = byKind((await firstReview()).items, 'GAP');
  const saved = await adjustment([{ op: 'REMOVER', itemId: gap.id }]);
  await f.reviews.addUserItems(f.owner, secondSaved.id, [{ texto: 'Outro fato informado.', frase: 'outro' }]);
  expect(await apply(saved)).toEqual({ applied: 0, questions: [{ reason: 'ANALISE_ALTERADA' }] });
  expect(Object.keys((await firstReview()).decisions)).toHaveLength(0);
  expect((await secondReview()).items.filter((i) => i.userAdded)).toHaveLength(1);
});

it('item que nenhuma análise tem vira pergunta e o resto se aplica', async () => {
  const { firstReview, adjustment, apply, byKind } = await setup();
  const gap = byKind((await firstReview()).items, 'GAP');
  const result = await apply(
    await adjustment([
      { op: 'REMOVER', itemId: gap.id },
      { op: 'REMOVER', itemId: 'f'.repeat(64) },
    ]),
  );
  expect(result.applied).toBe(1);
  expect(result.questions).toEqual([{ reason: 'ITEM_DESCONHECIDO', itemId: 'f'.repeat(64) }]);
});
