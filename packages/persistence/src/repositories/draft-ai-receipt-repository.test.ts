import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { caseAccessFixture } from './case-ai-access-repository.test.js';
import { DraftRepository } from './draft-repository.js';
import { DraftAiReceiptRepository } from './draft-ai-receipt-repository.js';

async function fixture(existing = false) {
  const f = await caseAccessFixture();
  const drafts = new DraftRepository(f.db);
  const draft = existing
    ? await drafts.createDraft({ ...f.owner, matterId: f.matter.id, title: 'Edição atual', createdBy: f.owner.userId })
    : undefined;
  if (draft)
    await drafts.createVersion({
      ...f.owner,
      matterId: f.matter.id,
      draftId: draft.id,
      title: draft.title,
      createdBy: f.owner.userId,
      source: 'HUMAN',
      contentHash: 'a'.repeat(64),
      sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto atual' }],
    });
  await f.repo.replace(f.owner, f.matter.id, {
    ...f.input,
    receivePermission: {
      enabled: true,
      destination: draft ? { mode: 'EXISTING', draftId: draft.id } : { mode: 'NEW' },
    },
  });
  const input = {
    matterId: f.matter.id,
    expectedGrantRevision: 1,
    idempotencyKey: 'chave-do-envio-0001',
    title: 'Texto recebido',
    sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto da IA' }],
    references: [],
  };
  return { ...f, grantInput: f.input, drafts, draft, input, receipts: new DraftAiReceiptRepository(f.db) };
}
describe('Recebimento atômico', () => {
  it('falha ao inserir recibo reverte também versão e rascunho', async () => {
    const f = await fixture();
    try {
      await f.client.execute(
        "CREATE TRIGGER fail_receipt BEFORE INSERT ON draft_ai_receipts BEGIN SELECT RAISE(ABORT, 'receipt failure'); END",
      );
      await expect(f.receipts.receive(f.reader, f.input)).rejects.toThrow('Failed query');
      expect(await f.drafts.listDrafts(f.owner.tenantId, f.matter.id)).toEqual([]);
      expect(
        (await f.client.execute({ sql: 'SELECT id FROM draft_versions WHERE matter_id = ?', args: [f.matter.id] }))
          .rows,
      ).toEqual([]);
    } finally {
      await f.client.execute('DROP TRIGGER IF EXISTS fail_receipt');
      f.client.close();
    }
  });
  it('recusa revisão antiga ou recebimento desabilitado, inclusive replay', async () => {
    const f = await fixture();
    try {
      await f.receipts.receive(f.reader, f.input);
      await f.repo.replace(f.owner, f.matter.id, { ...f.grantInput, expectedRevision: 1 });
      await expect(f.receipts.receive(f.reader, f.input)).rejects.toThrow('DRAFT_PERMISSION_STALE');
      await expect(f.receipts.receive(f.reader, { ...f.input, expectedGrantRevision: 2 })).rejects.toThrow(
        'DRAFT_RECEIVING_NOT_AUTHORIZED',
      );
    } finally {
      f.client.close();
    }
  });
  it('conserva fontes ao editar e rejeita pai de outro rascunho', async () => {
    const f = await fixture();
    try {
      const references = [
        {
          sectionOrdinal: 0,
          kind: 'DOCUMENT' as const,
          itemId: f.doc.document.id,
          documentVersionId: f.doc.version.id,
        },
      ];
      const saved = await f.receipts.receive(f.reader, { ...f.input, references });
      const edited = await f.drafts.createVersion({
        ...f.owner,
        matterId: f.matter.id,
        draftId: saved.draftId,
        title: f.input.title,
        createdBy: f.owner.userId,
        source: 'HUMAN',
        contentHash: 'b'.repeat(64),
        sections: f.input.sections,
        baseVersionId: saved.versionId,
      });
      expect(await f.receipts.getReferences(f.owner, f.matter.id, saved.draftId, edited.version.id)).toEqual(
        references,
      );
      const other = await f.drafts.createDraft({
        ...f.owner,
        matterId: f.matter.id,
        title: 'Outro rascunho',
        createdBy: f.owner.userId,
      });
      await expect(
        f.drafts.createVersion({
          ...f.owner,
          matterId: f.matter.id,
          draftId: other.id,
          title: other.title,
          createdBy: f.owner.userId,
          source: 'HUMAN',
          contentHash: 'c'.repeat(64),
          sections: f.input.sections,
          baseVersionId: saved.versionId,
        }),
      ).rejects.toThrow('DRAFT_PARENT_INVALID');
    } finally {
      f.client.close();
    }
  });
  it('repete o recibo sem duplicar e recusa conteúdo diferente com mesma chave', async () => {
    const f = await fixture();
    try {
      const first = await f.receipts.receive(f.reader, f.input);
      expect(await f.receipts.receive(f.reader, f.input)).toMatchObject({
        id: first.id,
        versionId: first.versionId,
        isReplay: true,
      });
      await expect(f.receipts.receive(f.reader, { ...f.input, title: 'Outra peça' })).rejects.toThrow(
        'DRAFT_RECEIPT_CONFLICT',
      );
      expect(await f.drafts.listDrafts(f.owner.tenantId, f.matter.id)).toHaveLength(1);
      const grants = await f.repo.listForOwner(f.owner, f.matter.id);
      await f.repo.revoke(f.owner, f.matter.id, grants[0].id, 1);
      await expect(f.receipts.receive(f.reader, f.input)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
    } finally {
      f.client.close();
    }
  });
  it('preserva a edição existente até adoção explícita com comparação de versão', async () => {
    const f = await fixture(true);
    try {
      const before = await f.drafts.getDraft(f.owner.tenantId, f.matter.id, f.draft!.id);
      const receipt = await f.receipts.receive(f.reader, f.input);
      expect(await f.drafts.getDraft(f.owner.tenantId, f.matter.id, f.draft!.id)).toEqual(before);
      await expect(
        f.receipts.adopt(f.owner, f.matter.id, f.draft!.id, receipt.versionId, randomUUID()),
      ).rejects.toThrow('DRAFT_ADOPTION_CONFLICT');
      const adopted = await f.receipts.adopt(
        f.owner,
        f.matter.id,
        f.draft!.id,
        receipt.versionId,
        before!.currentVersionId!,
      );
      expect(adopted.draft.currentVersionId).toBe(receipt.versionId);
      expect(adopted.draft.status).toBe('DRAFT');
      expect(await f.receipts.listForOwner({ ...f.owner, userId: 'intruso' }, f.matter.id, f.draft!.id)).toEqual([]);
    } finally {
      f.client.close();
    }
  });
  it('recusa referência inválida e cancelamento sem deixar rascunhos', async () => {
    const f = await fixture();
    try {
      await expect(
        f.receipts.receive(f.reader, {
          ...f.input,
          references: [
            { sectionOrdinal: 0, kind: 'DOCUMENT', itemId: f.doc.document.id, documentVersionId: randomUUID() },
          ],
        }),
      ).rejects.toThrow('DRAFT_REFERENCE_INVALID');
      const controller = new AbortController();
      controller.abort();
      await expect(f.receipts.receive(f.reader, f.input, { signal: controller.signal })).rejects.toThrow();
      expect(await f.drafts.listDrafts(f.owner.tenantId, f.matter.id)).toEqual([]);
    } finally {
      f.client.close();
    }
  });
  it('aceita a versão documental selecionada e conserva referências', async () => {
    const f = await fixture();
    try {
      const references = [
        {
          sectionOrdinal: 0,
          kind: 'DOCUMENT' as const,
          itemId: f.doc.document.id,
          documentVersionId: f.doc.version.id,
        },
      ];
      const saved = await f.receipts.receive(f.reader, { ...f.input, references });
      expect(await f.receipts.getReferences(f.owner, f.matter.id, saved.draftId, saved.versionId)).toEqual(references);
      const bundle = await f.drafts.getVersion(f.owner.tenantId, f.matter.id, saved.draftId, saved.versionId);
      expect(bundle!.version.source).toBe('SYSTEM');
      expect(bundle!.version.status).toBe('DRAFT');
    } finally {
      f.client.close();
    }
  });
});
