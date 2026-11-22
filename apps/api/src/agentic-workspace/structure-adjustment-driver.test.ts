import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { FakeAgentProvider } from '@forgelex/agent-core';
import { STRUCTURE_ITEMS_SOURCE_PREFIX } from '@forgelex/domain';
import { createEvidenceFixture } from '../../../../packages/persistence/src/testing/native-evidence-review-fixture.js';
import { createCaseTaskDriver } from './case-task-driver.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const run of cleanup.splice(0)) run();
});
const pedido = 'Tire a lacuna sobre o recibo. O cliente também pagou abril em dinheiro.';

async function setup() {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  // The correction runs in its own conversation of the same case; the analysis stays the current one.
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
  const items = (await f.reviews.preview(f.owner, f.saved.id)).items;
  const gap = items.find((i) => i.kind === 'GAP')!;
  const packets: Record<string, any> = {};
  const { driver, native } = createCaseTaskDriver(f.db, f.client, {
    authorizeNative: async () => {},
    createProvider: ({ role, registry, packet }: any) => {
      packets[role] = packet;
      const user = packet.sources.find((s: any) => s.kind === 'USER_TEXT');
      const input =
        role === 'legal-orchestrator'
          ? {
              action: 'adjust_structure',
              requiresCaseLaw: false,
              requiresNorms: false,
              requiresProcedure: false,
              issues: [{ id: 'issue', statement: 'Ajustar a estrutura', sourceIds: [user.id] }],
              gaps: [],
            }
          : {
              coveredIssueIds: ['issue'],
              claims: [],
              requirements: [],
              findings: [],
              supportChecks: [],
              ...(role === 'matter-analyst'
                ? {
                    structureAdjustment: {
                      commands: [
                        { op: 'REMOVER', itemId: gap.id },
                        { op: 'ACRESCENTAR', texto: 'O cliente pagou abril em dinheiro.', frase: 'pagou abril' },
                      ],
                      caseSummary: 'Caso sintético: pagamento alegado e contestado; nada está provado.',
                    },
                  }
                : {}),
            };
      return new FakeAgentProvider(registry, undefined, [{ toolCall: { name: 'task.submit', input } }]);
    },
  });
  const run = async () => {
    let checkpoint: any;
    for (let i = 0; i < 8; i++) {
      const context = {
        execution: { ...execution, checkpoint },
        job: { objective: pedido, actionId: 'adjust_structure' },
      };
      const step = driver.next(context as any)!;
      const outcome: any = await step.run({ ...(context as any), signal: new AbortController().signal });
      checkpoint = outcome.checkpoint;
      if (outcome.kind !== 'checkpoint') return outcome;
    }
    throw new Error('LOOP');
  };
  return { f, conversation, execution, items, packets, run, native };
}

it('gives the agent the items of the current analysis and saves the adjustment with that source', async () => {
  const { f, execution, items, packets, run, native } = await setup();
  const outcome = await run();
  expect(outcome.kind).toBe('completed');
  const structure = packets['matter-analyst'].sources.find((s: any) => s.id.startsWith(STRUCTURE_ITEMS_SOURCE_PREFIX));
  expect(structure).toMatchObject({ id: `${STRUCTURE_ITEMS_SOURCE_PREFIX}${f.saved.id}`, kind: 'PREVIOUS_DELIVERY' });
  expect(JSON.parse(structure.text).items.map((i: any) => [i.id, i.text])).toEqual(items.map((i) => [i.id, i.text]));
  expect(JSON.parse(structure.text).items.find((i: any) => i.kind === 'FACT').label).toBe('F1');
  const saved = await f.workspace.getExecution(f.owner, execution.id);
  const { delivery } = await native.getDelivery(f.owner, saved!.deliveryIds.at(-1)!);
  expect(delivery.action).toBe('adjust_structure');
  expect(delivery.structureAdjustment?.commands).toHaveLength(2);
  expect(delivery.sources.map((s) => s.id)).toContain(structure.id);
});

it('does not run without a current analysis of the case', async () => {
  const { f, run, packets } = await setup();
  // The analysis conversation leaves the recent list, so the case has no current structure.
  await f.client.execute({
    sql: 'UPDATE agentic_conversations SET history_hidden_at = ? WHERE id = ?',
    args: [new Date().toISOString(), f.conversation.id],
  });
  await expect(run()).rejects.toThrow('STRUCTURE_NOT_AVAILABLE');
  expect(packets).toEqual({});
});
