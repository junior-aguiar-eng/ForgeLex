import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { structureItemsSource, type AgenticTaskDelivery } from '@forgelex/domain';
import { createEvidenceFixture } from '../testing/native-evidence-review-fixture.js';
import { NativeCaseTaskRepository } from './native-case-task-repository.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const run of cleanup.splice(0)) run();
});

async function setup() {
  const f = await createEvidenceFixture();
  cleanup.push(() => f.client.close());
  const conversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: 'Ajustar',
    context: { origin: 'USER', text: 'Tire a lacuna.', documents: [] },
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
    objective: 'Ajustar',
    actionId: 'adjust_structure' as const,
  };
  const review = await f.reviews.preview(f.owner, f.saved.id);
  const source = structureItemsSource(f.saved.id, review.items, new Set());
  return { native: new NativeCaseTaskRepository(f.db, async () => {}), binding, source, conversation };
}

it('binds server-assembled sources to every load and save of one run', async () => {
  const { native, binding, source, conversation } = await setup();
  const port = native.withTrustedSources([source]);
  const packet = await port.load(binding);
  expect(packet.sources.find((s) => s.id === source.id)).toEqual(source);
  await port.assert(binding);
  const delivery: AgenticTaskDelivery = {
    action: 'adjust_structure',
    contextId: conversation.id,
    contextRevision: 1,
    status: 'CANDIDATE',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    issues: [],
    claims: [],
    requirements: [],
    findings: [],
    sources: packet.sources.map(({ text: _text, ...s }) => s),
    structureAdjustment: { commands: [], caseSummary: 'Resumo sintético.' },
  };
  // Without the same trusted sources the delivery cites a source the run never had.
  await expect(native.save(binding, delivery)).rejects.toThrow('SOURCE_REFERENCE_INVALID');
  await expect(port.save(binding, delivery)).resolves.toMatchObject({ id: `delivery:${binding.executionId}` });
});

it('refuses a trusted source whose content does not match its hash', async () => {
  const { native, binding, source } = await setup();
  await expect(native.withTrustedSources([{ ...source, text: `${source.text} ` }]).load(binding)).rejects.toThrow(
    'SOURCE_REFERENCE_INVALID',
  );
});
