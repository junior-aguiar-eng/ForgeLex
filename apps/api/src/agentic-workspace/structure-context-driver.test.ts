import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { STRUCTURE_CONTEXT_SOURCE_PREFIX, type EvidenceReview, type EvidenceReviewCommand } from '@forgelex/domain';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { createCaseTaskDriver } from './case-task-driver.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const run of cleanup.splice(0)) run();
});
const pedido = 'Redija a petição inicial de cobrança dos aluguéis.';
const command = (review: EvidenceReview, decisions: EvidenceReviewCommand['decisions']): EvidenceReviewCommand => ({
  approved: true,
  commandId: randomUUID(),
  reviewToken: review.reviewToken,
  expectedRevision: review.revision,
  decisions,
});

async function setup(actionId: string | undefined, { hideAnalysis = false } = {}) {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  if (hideAnalysis)
    await f.client.execute({
      sql: 'UPDATE agentic_conversations SET history_hidden_at = ? WHERE id = ?',
      args: [new Date().toISOString(), f.conversation.id],
    });
  const conversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: pedido,
    context: { origin: 'USER', text: pedido, documents: [] },
  });
  const created = await f.workspace.createExecution(f.owner, {
    conversationId: conversation.id,
    contextRevision: 1,
    idempotencyKey: randomUUID(),
    authorizationId: null,
    budgetReservationId: null,
    provider: null,
    model: null,
  });
  await f.workspace.compareAndSetStatus(f.owner, created.id, 'QUEUED', 'RUNNING');
  const execution = (await f.workspace.getExecution(f.owner, created.id))!;
  const packets: Record<string, any> = {};
  const { driver } = createCaseTaskDriver(f.db, f.client, {
    authorizeNative: async () => {},
    guidedWorkflow: true,
    createProvider: ({ role, registry, packet }: any) => {
      packets[role] = packet;
      // Only the first step matters here: what the orchestrator receives. Any plan is fine; it may be refused.
      return new FakeAgentProvider(registry, undefined, [
        { toolCall: { name: 'task.submit', input: { action: 'create_document' } } },
      ]);
    },
  });
  const firstStep = async () => {
    const context = { execution: { ...execution, checkpoint: undefined }, job: { objective: pedido, actionId } };
    await driver
      .next(context as any)!
      .run({ ...(context as any), signal: new AbortController().signal })
      .catch(() => undefined);
    return packets['legal-orchestrator']?.sources as any[] | undefined;
  };
  return { f, firstStep };
}
const structureOf = (sources: any[] | undefined) =>
  sources?.find((s: any) => s.id.startsWith(STRUCTURE_CONTEXT_SOURCE_PREFIX));

it.each(['create_document', undefined])(
  'com análise vigente, a redação (%s) recebe a estrutura: confirmados, a confirmar e sem retirados',
  async (actionId) => {
    const { f, firstStep } = await setup(actionId);
    const review = await f.reviews.preview(f.owner, f.saved.id);
    const [adopted, discarded] = [
      review.items.find((i) => i.kind === 'FACT')!,
      review.items.find((i) => i.kind === 'GAP')!,
    ];
    await f.reviews.decide(
      f.owner,
      f.saved.id,
      command(review, [
        { itemId: adopted.id, action: 'ADOPT', text: 'Pagamento alegado pelo locatário.' },
        { itemId: discarded.id, action: 'DISCARD' },
      ]),
    );
    const source = structureOf(await firstStep());
    expect(source).toMatchObject({ id: `${STRUCTURE_CONTEXT_SOURCE_PREFIX}${f.saved.id}`, kind: 'PREVIOUS_DELIVERY' });
    const items = JSON.parse(source.text).items as { id: string; state: string }[];
    expect(items.find((i) => i.id === adopted.id)?.state).toBe('CONFIRMADO');
    expect(items.some((i) => i.id === discarded.id)).toBe(false);
    expect(items.filter((i) => i.state === 'A_CONFIRMAR').length).toBeGreaterThan(0);
  },
);

it('caso sem análise vigente: nenhuma fonte e a execução segue como hoje', async () => {
  const { firstStep } = await setup('create_document', { hideAnalysis: true });
  const sources = await firstStep();
  expect(sources).toBeDefined();
  expect(structureOf(sources)).toBeUndefined();
});

it.each(['analyze_evidence', 'adjust_structure', 'research_question', 'review_text'])(
  'com a ação %s a redação não recebe a fonte da estrutura',
  async (actionId) => {
    const { firstStep } = await setup(actionId);
    const sources = await firstStep();
    expect(sources).toBeDefined();
    expect(structureOf(sources)).toBeUndefined();
  },
);
