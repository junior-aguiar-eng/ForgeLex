import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { MatterRepository } from './matter-repository.js';
import { CaseAiAccessRepository } from './case-ai-access-repository.js';

export async function caseAccessFixture() {
  const c = await createDatabase();
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: 'case-owner', userId: 'author' };
  const matters = new MatterRepository(c.db);
  const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso autorizado' });
  const foreign = await matters.createMatter({ tenantId: 'foreign', createdBy: 'other', title: 'Caso sigiloso' });
  const doc = await matters.ingestTextDocument({
    ...owner,
    matterId: matter.id,
    createdBy: owner.userId,
    title: 'Contrato',
    originalFilename: 'contrato.txt',
    mimeType: 'text/plain',
    content: 'Texto do contrato autorizado.',
  });
  const repo = new CaseAiAccessRepository(c.db);
  const selection = {
    documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
    factIds: [],
    evidenceIds: [],
    thesisIds: [],
    authorityIds: [],
  };
  const input = {
    oauthClientId: 'app-one',
    oauthGrantedAt: '2026-10-05T10:00:00.000Z',
    expectedRevision: 0,
    selection,
  };
  const reader = { ...owner, oauthConnection: { clientId: input.oauthClientId, grantedAt: input.oauthGrantedAt } };
  return { ...c, owner, reader, matters, matter, foreign, doc, repo, selection, input };
}

describe('Permissão explícita de contexto', () => {
  it('foreign_selection_is_rejected_atomically', async () => {
    const f = await caseAccessFixture();
    try {
      const foreignDoc = await f.matters.ingestTextDocument({
        tenantId: 'foreign',
        matterId: f.foreign.id,
        createdBy: 'other',
        title: 'SEGREDO',
        originalFilename: 's.txt',
        mimeType: 'text/plain',
        content: 'SEGREDO de outra conta.',
      });
      await expect(
        f.repo.replace(f.owner, f.matter.id, {
          ...f.input,
          selection: {
            ...f.selection,
            documents: [
              ...f.selection.documents,
              { documentId: foreignDoc.document.id, versionId: foreignDoc.version.id },
            ],
          },
        }),
      ).rejects.toThrow('CASE_SELECTION_INVALID');
      expect(await f.repo.listForOwner(f.owner, f.matter.id)).toEqual([]);
    } finally {
      f.client.close();
    }
  });
  it('owner_and_client_are_isolated; reauthorized_client_needs_updated_permission', async () => {
    const f = await caseAccessFixture();
    try {
      await f.repo.replace(f.owner, f.matter.id, f.input);
      expect((await f.repo.assertActive(f.reader, f.matter.id)).revision).toBe(1);
      for (const reader of [
        { ...f.reader, userId: 'other' },
        { ...f.reader, tenantId: 'foreign' },
        { ...f.reader, oauthConnection: { ...f.reader.oauthConnection, clientId: 'app-two' } },
        { ...f.reader, oauthConnection: { ...f.reader.oauthConnection, grantedAt: '2026-10-06T10:00:00.000Z' } },
      ]) {
        await expect(f.repo.assertActive(reader, f.matter.id)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
      }
    } finally {
      f.client.close();
    }
  });
  it('stale_revision_does_not_overwrite; revoke_is_persistent', async () => {
    const f = await caseAccessFixture();
    try {
      const grant = await f.repo.replace(f.owner, f.matter.id, f.input);
      await expect(f.repo.replace(f.owner, f.matter.id, f.input)).rejects.toThrow('CASE_ACCESS_CONFLICT');
      await f.repo.revoke(f.owner, f.matter.id, grant.id, 1);
      await expect(f.repo.assertActive(f.reader, f.matter.id)).rejects.toThrow('CASE_CONTEXT_NOT_AUTHORIZED');
      expect((await f.repo.listForOwner(f.owner, f.matter.id))[0]).toMatchObject({ status: 'REVOKED', revision: 2 });
      await expect(f.repo.replace(f.owner, f.matter.id, { ...f.input, expectedRevision: 1 })).rejects.toThrow(
        'CASE_ACCESS_CONFLICT',
      );
    } finally {
      f.client.close();
    }
  });
  it('new_document_version_is_not_shared; preview_contains_only_selected_material', async () => {
    const f = await caseAccessFixture();
    try {
      const grant = await f.repo.replace(f.owner, f.matter.id, f.input);
      const nextVersionId = randomUUID();
      await f.client.execute({
        sql: 'INSERT INTO document_versions (id,document_id,version_number,content_hash,content,created_at) VALUES (?,?,2,?,?,?)',
        args: [nextVersionId, f.doc.document.id, 'new-content-hash', 'VERSÃO NÃO AUTORIZADA', new Date().toISOString()],
      });
      const extra = await f.matters.ingestTextDocument({
        ...f.owner,
        matterId: f.matter.id,
        createdBy: f.owner.userId,
        title: 'Não selecionado',
        originalFilename: 'novo.txt',
        mimeType: 'text/plain',
        content: 'OUTRO TEXTO',
      });
      const preview = await f.repo.preview(f.owner, f.matter.id, f.selection, {});
      expect(preview.items).toHaveLength(1);
      expect(preview.items[0].versionId).toBe(f.doc.version.id);
      expect(JSON.stringify(preview)).not.toContain('VERSÃO NÃO AUTORIZADA');
      expect(
        (await f.repo.catalog(f.owner, f.matter.id, 'DOCUMENT')).items.find((i) => i.id === f.doc.document.id)
          ?.versionId,
      ).toBe(nextVersionId);
      expect(JSON.stringify(preview)).not.toContain(extra.document.id);
      expect((await f.repo.assertActive(f.reader, f.matter.id)).selection).toEqual(grant.selection);
      expect(
        (await f.matters.getSpecificDocumentVersion(f.owner.tenantId, f.matter.id, f.doc.document.id, f.doc.version.id))
          ?.version.id,
      ).toBe(f.doc.version.id);
      expect(
        await f.matters.getSpecificDocumentVersion(f.owner.tenantId, f.foreign.id, f.doc.document.id, f.doc.version.id),
      ).toBeUndefined();
    } finally {
      f.client.close();
    }
  });
});
