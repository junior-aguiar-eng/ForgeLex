import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { ExecutionService, StartExecutionSchema } from './execution-service.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});
it('o pedido captura os itens aprovados no servidor sem seletor e não publica referências internas no contexto', async () => {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  const review = await f.reviews.preview(f.owner, f.saved.id);
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: review.items
      .filter((i) => ['FACT', 'EVIDENCE'].includes(i.kind))
      .map((i) => ({ itemId: i.id, action: 'ADOPT', text: i.text })),
  });
  const service = new ExecutionService(f.db, f.client, { executorAvailable: true });
  const input = {
    objective: 'Elaborar peça',
    actionId: 'create_document' as const,
    matterId: f.matter.id,
    context: { text: '', origin: 'USER' as const, documents: [] },
  };
  const key = randomUUID(),
    run = await service.startExecution(f.owner, key, input);
  const conversation = await f.workspace.getConversation(f.owner, run.conversationId);
  const refs = conversation!.contexts.at(-1)!.approvedItems;
  expect(refs).toHaveLength(2);
  expect(run.context).not.toHaveProperty('approvedItems');
  expect(await service.startExecution(f.owner, key, input)).toMatchObject({ id: run.id });
  await f.workspace.compareAndSetStatus(f.owner, run.id, 'QUEUED', 'CANCELLED');
  const resumed = await service.continueFromCheckpoint(f.owner, run.id, randomUUID());
  expect(resumed.contextRevision).toBe(run.contextRevision);
  expect((await f.workspace.getConversation(f.owner, run.conversationId))!.contexts.at(-1)!.approvedItems).toEqual(
    refs,
  );
  // A fresh request may inherit the case/context even when the browser sends neither explicitly.
  const next = await service.startExecution(f.owner, randomUUID(), {
    conversationId: run.conversationId,
    objective: 'Revisar a peça',
  });
  expect(next.matterId).toBe(f.matter.id);
  expect((await f.workspace.getConversation(f.owner, run.conversationId))!.contexts.at(-1)!.approvedItems).toEqual(
    refs,
  );
});
it('não aceita referências de aprovação fornecidas pelo cliente, nem mesmo lista vazia', () => {
  expect(
    StartExecutionSchema.safeParse({
      objective: 'Criar peça',
      context: { text: '', origin: 'USER', documents: [], approvedItems: [] },
    }).success,
  ).toBe(false);
});

it('mudança entre admissão e início encerra o pedido, finaliza a reserva e não bloqueia a fila', async () => {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  const review = await f.reviews.preview(f.owner, f.saved.id);
  await f.reviews.decide(f.owner, f.saved.id, {
    approved: true,
    commandId: randomUUID(),
    expectedRevision: review.revision,
    reviewToken: review.reviewToken,
    decisions: [{ itemId: review.items.find((i) => i.kind === 'FACT')!.id, action: 'ADOPT' }],
  });
  const finalized: string[] = [];
  const service = new ExecutionService(f.db, f.client, {
    executorAvailable: true,
    finalizeExecution: async (_o, id) => {
      finalized.push(id);
    },
  });
  const run = await service.startExecution(f.owner, randomUUID(), { objective: 'Criar peça', matterId: f.matter.id });
  await f.client.execute("UPDATE facts SET statement='Alterado depois da admissão'");
  const unrelated = await service.startExecution(f.owner, randomUUID(), { objective: 'Outro pedido sem caso' });
  const lease = await service.claimNext('test-worker');
  expect(lease?.executionId).toBe(unrelated.id);
  expect((await f.workspace.getExecution(f.owner, run.id))?.status).toBe('FAILED');
  expect(finalized).toContain(run.id);
  expect((await service.getExecution(f.owner, run.id)).status).toBe('FAILED');
  expect((await service.listClientEvents(f.owner, run.id, 0)).events).toContainEqual(
    expect.objectContaining({ type: 'ERROR', payload: { code: 'CONTEXT_CHANGED' } }),
  );
});
