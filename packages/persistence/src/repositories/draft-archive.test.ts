import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { DraftRepository } from './draft-repository.js';
import { MatterRepository } from './matter-repository.js';

async function setup(tenantId: string) {
  const { db, client } = await createDatabase();
  await runPersistenceMigrations(client);
  const context = { tenantId, userId: 'author' };
  const matter = await new MatterRepository(db).createMatter({ ...context, createdBy: context.userId, title: 'Caso' });
  const repository = new DraftRepository(db);
  const draft = await repository.createDraft({ ...context, matterId: matter.id, createdBy: 'author', title: 'Minuta' });
  const scope = { tenantId, matterId: matter.id, draftId: draft.id };
  const save = (title = 'Minuta') =>
    repository.createVersion({
      ...context,
      matterId: matter.id,
      draftId: draft.id,
      createdBy: 'author',
      source: 'HUMAN',
      title,
      contentHash: 'a'.repeat(64),
      sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto' }],
    });
  return { db, client, repository, matter, draft, scope, save, context };
}

describe('arquivar e restaurar rascunho (U4)', () => {
  it('arquiva sem apagar nada: sai da lista padrão, aparece na lixeira e volta com o status da versão', async () => {
    const { client, repository, matter, scope, save, draft, context } = await setup('archive-a');
    try {
      const bundle = await save();
      await repository.setArchived(scope, true);
      expect((await repository.getDraft(context.tenantId, matter.id, draft.id))?.status).toBe('ARCHIVED');
      expect(await repository.listDrafts(context.tenantId, matter.id)).toEqual([]);
      const trash = await repository.listDrafts(context.tenantId, matter.id, { archived: true });
      expect(trash.map(({ id }) => id)).toEqual([draft.id]);
      // Versão, seções e conteúdo seguem intactos.
      expect((await repository.getCurrentVersion(context.tenantId, matter.id, draft.id))?.version.id).toBe(
        bundle.version.id,
      );
      const restored = await repository.setArchived(scope, false);
      expect(restored.status).toBe(bundle.version.status);
      expect((await repository.listDrafts(context.tenantId, matter.id)).map(({ id }) => id)).toEqual([draft.id]);
      expect(await repository.listDrafts(context.tenantId, matter.id, { archived: true })).toEqual([]);
    } finally {
      client.close();
    }
  });

  it('é idempotente: arquivar duas vezes e restaurar quem não está arquivado não muda nada', async () => {
    const { client, repository, scope, save } = await setup('archive-b');
    try {
      await save();
      const first = await repository.setArchived(scope, true);
      expect((await repository.setArchived(scope, true)).status).toBe('ARCHIVED');
      expect(first.status).toBe('ARCHIVED');
      await repository.setArchived(scope, false);
      const again = await repository.setArchived(scope, false);
      expect(again.status).not.toBe('ARCHIVED');
    } finally {
      client.close();
    }
  });

  it('rascunho sem versão volta como rascunho', async () => {
    const { client, repository, scope } = await setup('archive-c');
    try {
      await repository.setArchived(scope, true);
      expect((await repository.setArchived(scope, false)).status).toBe('DRAFT');
    } finally {
      client.close();
    }
  });

  it('rascunho arquivado não recebe versão nem pedido de aprovação até ser restaurado', async () => {
    const { client, repository, scope, save, matter, draft, context } = await setup('archive-d');
    try {
      const bundle = await save();
      await repository.setArchived(scope, true);
      await expect(save('Outra')).rejects.toThrow('DRAFT_ARCHIVED');
      await expect(
        repository.createApprovalRequest({
          ...scope,
          draftVersionId: bundle.version.id,
          requestedBy: 'author',
          proposedAction: 'Aprovar',
        }),
      ).rejects.toThrow('DRAFT_ARCHIVED');
      await repository.setArchived(scope, false);
      await expect(save('Outra')).resolves.toBeTruthy();
      expect((await repository.listVersions(context.tenantId, matter.id, draft.id)).length).toBe(2);
    } finally {
      client.close();
    }
  });

  it('aprovação pendente impede o arquivamento', async () => {
    const { client, repository, scope, save, db } = await setup('archive-e');
    try {
      const bundle = await save();
      // A aprovação exige revisão concluída; aqui basta o estado que a deixa pendente.
      await db.$client.execute({
        sql: "UPDATE drafts SET status='APPROVAL_PENDING' WHERE id = ?",
        args: [scope.draftId],
      });
      expect(bundle.version.id).toBeTruthy();
      await expect(repository.setArchived(scope, true)).rejects.toThrow('DRAFT_APPROVAL_PENDING');
    } finally {
      client.close();
    }
  });

  it('não alcança rascunho de outro tenant nem de outro caso', async () => {
    const { client, repository, scope } = await setup('archive-f');
    try {
      await expect(repository.setArchived({ ...scope, tenantId: 'outro' }, true)).rejects.toThrow();
      await expect(repository.setArchived({ ...scope, draftId: crypto.randomUUID() }, true)).rejects.toThrow(
        'DRAFT_NOT_FOUND',
      );
    } finally {
      client.close();
    }
  });
});
