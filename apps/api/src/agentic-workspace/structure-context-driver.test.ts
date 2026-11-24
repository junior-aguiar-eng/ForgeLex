import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import {
  STRUCTURE_CONTEXT_SOURCE_PREFIX,
  buildAttachmentHeader,
  type EvidenceReview,
  type EvidenceReviewCommand,
} from '@forgelex/domain';
import { NativeCaseTaskRepository } from '@forgelex/persistence';
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

it('caso sem análise viva: nenhuma fonte e a execução segue como hoje', async () => {
  const { f, firstStep } = await setup('create_document');
  // A única análise do caso deixa de estar concluída.
  await f.client.execute({
    sql: "UPDATE agentic_executions SET payload_json = json_set(payload_json, '$.status', 'FAILED') WHERE id = ?",
    args: [f.execution.id],
  });
  const sources = await firstStep();
  expect(sources).toBeDefined();
  expect(structureOf(sources)).toBeUndefined();
});

it('análise escondida do histórico continua sendo contexto da redação (E4)', async () => {
  const { f, firstStep } = await setup('create_document', { hideAnalysis: true });
  expect(structureOf(await firstStep())).toBeDefined();
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

/** E4: uma segunda análise do caso (um trecho de PDF) com o tipo da peça e as partes identificados. */
async function addPdfPart(f: Awaited<ReturnType<typeof createEvidenceFixture>>, index: number) {
  const native = new NativeCaseTaskRepository(f.db, async () => {});
  await new Promise((resolve) => setTimeout(resolve, 5));
  const text = `${buildAttachmentHeader({
    name: 'processo.pdf',
    ocr: false,
    part: { index, total: 2, pageFrom: index * 10 - 9, pageTo: index * 10, documentCode: 'a1b2c3d4e5f6' },
  })}
Página ${index * 10 - 9}
Texto do trecho ${index}.`;
  const conversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: 'Dissecar o processo',
    context: {
      origin: 'MIXED',
      text,
      documents: [{ documentId: f.doc.document.id, versionId: f.doc.version.id }],
    },
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
  const binding = {
    ...f.owner,
    conversationId: conversation.id,
    executionId: execution.id,
    contextRevision: 1,
    matterId: f.matter.id,
    objective: 'Dissecar o processo',
    actionId: 'analyze_evidence' as const,
  };
  const packet = await native.load(binding);
  const doc = packet.sources.find((source) => source.kind === 'DOCUMENT')!;
  const saved = await native.save(binding, {
    ...f.delivery,
    contextId: conversation.id,
    sources: packet.sources.map(({ text: _text, ...source }) => source),
    documentProfile: {
      ...(index === 2 ? { pieceType: 'Petição inicial' } : {}),
      pieceTypeCertainty: index === 2 ? 'IDENTIFICADA' : 'INCERTA',
      parties:
        index === 2 ? [{ name: 'Maria', role: 'autor', sourceId: doc.id, start: 0, quote: doc.text.slice(0, 10) }] : [],
    },
  });
  await f.workspace.compareAndSetStatus(f.owner, execution.id, 'RUNNING', 'COMPLETED');
  return saved;
}

it('E4: a redação recebe a soma das análises: itens de todas, uma linha por documento e o mesmo PDF numa linha só', async () => {
  const { f, firstStep } = await setup('create_document');
  const second = await addPdfPart(f, 1);
  const third = await addPdfPart(f, 2);
  const source = structureOf(await firstStep());
  expect(source.id).toBe(`${STRUCTURE_CONTEXT_SOURCE_PREFIX}case:${f.matter.id}`);
  const body = JSON.parse(source.text);
  const ids = new Set(body.items.map((item: { id: string }) => item.id));
  // Itens das três análises (a do fixture e os dois trechos), todos a confirmar.
  for (const deliveryId of [f.saved.id, second.id, third.id]) {
    const review = await f.reviews.preview(f.owner, deliveryId);
    expect(review.items.some((item) => ids.has(item.id))).toBe(true);
  }
  // O PDF dividido em dois trechos é um documento só, com o tipo da peça e as partes do trecho que as identificou.
  expect(body.documents).toHaveLength(2);
  expect(body.documents[1]).toBe('Documento 2: Petição inicial; partes: Maria (autor); lido em 2 partes');
});
