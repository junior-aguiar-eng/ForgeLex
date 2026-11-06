import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createEvidenceFixture } from '../testing/native-evidence-review-fixture.js';
import { NativeCaseTaskRepository } from './native-case-task-repository.js';
import { DraftRepository } from './draft-repository.js';
import type { AgenticTaskDelivery } from '@forgelex/domain';
const connections: Awaited<ReturnType<typeof createEvidenceFixture>>[] = [];
afterEach(() => {
  for (const f of connections.splice(0)) f.client.close();
});
async function fixture() {
  const f = await createEvidenceFixture();
  connections.push(f);
  const native = new NativeCaseTaskRepository(f.db, async () => {});
  const drafts = new DraftRepository(f.db);
  const draft = await drafts.createDraft({
    ...f.owner,
    matterId: f.matter.id,
    title: 'Original',
    createdBy: f.owner.userId,
  });
  const versionInput = {
    ...f.owner,
    matterId: f.matter.id,
    draftId: draft.id,
    title: 'Original',
    createdBy: f.owner.userId,
    source: 'HUMAN' as const,
    status: 'DRAFT' as const,
    contentHash: 'a'.repeat(64),
    sections: [
      {
        title: 'Relato',
        content: 'Texto original preservado.',
        ordinal: 1,
        linkedFactIds: [],
        linkedEvidenceIds: [],
        linkedThesisIds: [],
      },
    ],
  };
  const original = await drafts.createVersion(versionInput);
  const conversation = await f.workspace.createConversation(f.owner, {
    matterId: f.matter.id,
    objective: 'Alterar a peça',
    context: {
      text: 'Alterar a peça',
      origin: 'USER',
      documents: [],
      draft: { draftId: draft.id, versionId: original.version.id },
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
    matterId: f.matter.id,
    conversationId: conversation.id,
    executionId: execution.id,
    contextRevision: 1,
    objective: 'Alterar a peça',
  };
  const packet = await native.load(binding);
  const delivery: AgenticTaskDelivery = {
    action: 'create_document',
    contextId: conversation.id,
    contextRevision: 1,
    status: 'CANDIDATE',
    humanReviewRequired: true,
    legalAssessment: 'NOT_EVALUATED',
    sources: packet.sources.map(({ text: _, ...s }) => s),
    issues: [],
    claims: [],
    findings: [],
    requirements: [],
    replacesVersionId: original.version.id,
    document: {
      title: 'Original',
      documentType: 'Relato',
      sections: [{ title: 'Relato', content: 'Texto alterado a pedido.', sourceIds: [original.version.id] }],
    },
  };
  return { ...f, native, drafts, draft, original, binding, delivery, versionInput };
}
it('altera a mesma peça, preserva a versão anterior e repete sem duplicar', async () => {
  const f = await fixture();
  const saved = await f.native.save(f.binding, f.delivery);
  expect(saved.draftId).toBe(f.draft.id);
  expect(saved.versionId).not.toBe(f.original.version.id);
  expect(
    (await f.drafts.getVersion(f.owner.tenantId, f.matter.id, f.draft.id, f.original.version.id))?.sections[0].content,
  ).toBe('Texto original preservado.');
  expect(await f.native.save(f.binding, f.delivery)).toEqual(saved);
  expect((await f.client.execute('select id from draft_versions')).rows).toHaveLength(2);
  await f.workspace.compareAndSetStatus(f.owner, f.binding.executionId, 'RUNNING', 'COMPLETED');
  expect((await f.native.getDelivery(f.owner, saved.id)).versionId).toBe(saved.versionId);
});
it('recusa alvo diferente e não grava documento num pedido de revisão', async () => {
  const f = await fixture();
  await expect(f.native.save(f.binding, { ...f.delivery, replacesVersionId: 'outra-versao' })).rejects.toThrow(
    'DRAFT_EDIT_TARGET_INVALID',
  );
  await expect(f.native.save(f.binding, { ...f.delivery, action: 'review_text' })).rejects.toThrow(
    'DOCUMENT_ACTION_INVALID',
  );
  expect((await f.client.execute('select id from draft_versions')).rows).toHaveLength(1);
  const { document: _, replacesVersionId: __, ...review } = f.delivery;
  await f.native.save(f.binding, { ...review, action: 'review_text' });
  expect((await f.client.execute('select id from draft_versions')).rows).toHaveLength(1);
});
it('preserva edição concorrente e impede replay após mudança posterior', async () => {
  const f = await fixture();
  const saved = await f.native.save(f.binding, f.delivery);
  await f.drafts.createVersion({
    ...f.versionInput,
    expectedCurrentVersionId: saved.versionId,
    baseVersionId: saved.versionId,
  });
  await expect(f.native.save(f.binding, f.delivery)).rejects.toThrow('SOURCE_VERSION_CONFLICT');
  expect((await f.client.execute('select id from draft_versions')).rows).toHaveLength(3);
});
it('um pedido de nova peça não substitui a peça vinculada', async () => {
  const f = await fixture();
  const { replacesVersionId: _, ...delivery } = f.delivery;
  const saved = await f.native.save(f.binding, delivery);
  expect(saved.draftId).not.toBe(f.draft.id);
  expect((await f.drafts.getDraft(f.owner.tenantId, f.matter.id, f.draft.id))?.currentVersionId).toBe(
    f.original.version.id,
  );
});

it('não sobrescreve uma versão salva durante a geração', async () => {
  const f = await fixture();
  const newer = await f.drafts.createVersion({
    ...f.versionInput,
    expectedCurrentVersionId: f.original.version.id,
    baseVersionId: f.original.version.id,
  });
  await expect(f.native.save(f.binding, f.delivery)).rejects.toThrow('SOURCE_VERSION_CONFLICT');
  expect((await f.drafts.getDraft(f.owner.tenantId, f.matter.id, f.draft.id))?.currentVersionId).toBe(newer.version.id);
  expect((await f.client.execute('select id from draft_versions')).rows).toHaveLength(2);
});
