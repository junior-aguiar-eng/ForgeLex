import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createEvidenceFixture } from '../testing/native-evidence-review-fixture.js';
import { NativeCaseTaskRepository } from './native-case-task-repository.js';
import { DraftRepository } from './draft-repository.js';
import { LegalThesisRepository } from './legal-thesis-repository.js';
import type { AgenticTaskDelivery } from '@forgelex/domain';
const connections: Awaited<ReturnType<typeof createEvidenceFixture>>[] = [];
afterEach(() => {
  for (const f of connections.splice(0)) f.client.close();
});
async function fixture(withLinks = false, scoped = false) {
  const f = await createEvidenceFixture();
  connections.push(f);
  const native = new NativeCaseTaskRepository(f.db, async () => {});
  const drafts = new DraftRepository(f.db);
  const factId = randomUUID();
  const thesis = withLinks
    ? await new LegalThesisRepository(f.db).createThesis({
        ...f.owner,
        matterId: f.matter.id,
        createdBy: f.owner.userId,
        title: 'Tese original',
        statement: 'Tese de teste.',
      })
    : undefined;
  const retained = {
    title: 'Fundamentos',
    content: 'Citação mantida.',
    ordinal: 2,
    linkedFactIds: [factId],
    linkedEvidenceIds: [randomUUID()],
    linkedAuthorityIds: [randomUUID()],
    linkedThesisIds: thesis ? [thesis.id] : [],
  };
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
        content: scoped ? '  Texto original preservado.\r\n' : 'Texto original preservado.',
        ordinal: scoped ? 0 : 1,
        linkedFactIds: [],
        linkedEvidenceIds: [],
        linkedThesisIds: [],
      },
      ...(withLinks ? [retained] : []),
    ],
    ...(withLinks
      ? {
          citations: [
            {
              sectionOrdinal: 2,
              targetType: 'FACT' as const,
              targetId: factId,
              citationText: 'Citação mantida.',
              verified: true,
            },
            ...(scoped
              ? [
                  {
                    sectionOrdinal: 0,
                    targetType: 'FACT' as const,
                    targetId: factId,
                    citationText: 'preservado.',
                    verified: true,
                  },
                ]
              : []),
          ],
        }
      : {}),
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
      ...(scoped
        ? {
            deskEdit: {
              sectionId: original.sections[0].id,
              versionId: original.version.id,
              start: 8,
              end: 16,
              before: 'original',
            },
          }
        : {}),
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
  return { ...f, native, drafts, draft, original, binding, delivery, versionInput, packet };
}
it('preserva vínculos e citações da seção idêntica quando muda de posição', async () => {
  const f = await fixture(true);
  const retained = f.original.sections[1];
  const saved = await f.native.save(f.binding, {
    ...f.delivery,
    document: {
      ...f.delivery.document!,
      sections: [{ title: retained.title, content: retained.content, sourceIds: [] }, ...f.delivery.document!.sections],
    },
  });
  const derived = await f.drafts.getVersion(f.owner.tenantId, f.matter.id, f.draft.id, saved.versionId!);
  expect(derived?.sections[0]).toMatchObject({
    linkedFactIds: retained.linkedFactIds,
    linkedEvidenceIds: retained.linkedEvidenceIds,
    linkedAuthorityIds: retained.linkedAuthorityIds,
    linkedThesisIds: retained.linkedThesisIds,
  });
  expect(derived?.citations).toMatchObject([
    { sectionId: derived?.sections[0].id, targetId: retained.linkedFactIds[0], verified: true },
  ]);
});
it('recusa associação ambígua de metadados em reescrita de protocolo anterior', async () => {
  const f = await fixture(true);
  const { title, content } = f.original.sections[1];
  const same = { title, content, sourceIds: [] };
  await expect(
    f.native.save(f.binding, {
      ...f.delivery,
      document: { ...f.delivery.document!, sections: [same, same] },
    }),
  ).rejects.toThrow('DRAFT_EDIT_METADATA_CONFLICT');
  expect((await f.client.execute('select id from draft_versions')).rows).toHaveLength(1);
});
it('grava o patch na versão correta, conserva a seção e responde ao replay com a mesma versão', async () => {
  const f = await fixture(true, true);
  const { target, scope } = f.packet.deskEdit!;
  const proposal = { target, changes: [{ ...scope, id: 'substituição', after: 'revisto' }] };
  const delivery = {
    ...f.delivery,
    document: {
      ...f.delivery.document!,
      sections: [
        { title: 'Relato', content: '  Texto revisto preservado.\r\n', sourceIds: [f.original.version.id] },
        { title: 'Fundamentos', content: 'Citação mantida.', sourceIds: [f.original.version.id] },
      ],
    },
  };
  await expect(f.native.save(f.binding, delivery)).rejects.toThrow('DESK_EDIT_REQUIRED');
  await expect(
    f.native.save(
      f.binding,
      {
        ...delivery,
        document: { ...delivery.document, sections: [delivery.document.sections[0]] },
      },
      proposal,
    ),
  ).rejects.toThrow('DESK_EDIT_DOCUMENT_MISMATCH');
  await expect(
    f.native.save(f.binding, delivery, {
      ...proposal,
      changes: [{ ...proposal.changes[0], start: 0 }],
    }),
  ).rejects.toThrow('DESK_EDIT_OUT_OF_SCOPE');
  const saved = await f.native.save(f.binding, delivery, proposal);
  expect(await f.native.save(f.binding, delivery, proposal)).toEqual(saved);
  const derived = await f.drafts.getVersion(f.owner.tenantId, f.matter.id, f.draft.id, saved.versionId!);
  expect(derived?.sections.map((s) => s.content)).toEqual(['  Texto revisto preservado.\r\n', 'Citação mantida.']);
  expect(derived?.sections[1].linkedThesisIds).toEqual(f.original.sections[1].linkedThesisIds);
  expect(derived?.citations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ citationText: 'Citação mantida.', verified: true, sectionId: derived?.sections[1].id }),
      expect.objectContaining({ citationText: 'preservado.', verified: true, sectionId: derived?.sections[0].id }),
    ]),
  );
  expect((await f.client.execute('select id from draft_versions')).rows).toHaveLength(2);
  const ancestor = await f.client.execute({
    sql: 'select derived_from_version_id from draft_versions where id = ?',
    args: [saved.versionId!],
  });
  expect(ancestor.rows[0].derived_from_version_id).toBe(f.original.version.id);
  await f.drafts.createVersion({
    ...f.versionInput,
    expectedCurrentVersionId: saved.versionId,
    baseVersionId: saved.versionId,
  });
  await expect(f.native.save(f.binding, delivery, proposal)).rejects.toThrow('SOURCE_VERSION_CONFLICT');
});
it('abre o resultado v12 com os ordinais e o texto exato da versão derivada', async () => {
  const f = await fixture(false, true);
  const { target, scope } = f.packet.deskEdit!;
  const exact = '  Texto revisto preservado.\r\n';
  const delivery = {
    ...f.delivery,
    supportAudit: [],
    document: {
      ...f.delivery.document!,
      sections: [{ title: 'Relato', content: exact, sourceIds: [f.original.version.id] }],
    },
  };
  const saved = await f.native.save(f.binding, delivery, {
    target,
    changes: [{ ...scope, id: 'p', after: 'revisto' }],
  });
  await f.workspace.saveProgress(f.owner, f.binding.executionId, { caseTask: { version: 12, evidence: [] } }, [
    saved.id,
  ]);
  await f.workspace.compareAndSetStatus(f.owner, f.binding.executionId, 'RUNNING', 'COMPLETED');
  const snapshot = await f.native.loadEditorialSnapshot(f.owner, saved.id, {
    draftId: saved.draftId!,
    versionId: saved.versionId!,
  });
  expect(snapshot.origin).toBe('SCOPED_DELIVERY');
  expect(snapshot.delivery.document?.sections[0].content).toBe(exact);
});
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
