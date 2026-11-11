import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { createDraftSaveTestStorage } from '../testing/draft-save-command-fixture.js';
import { DraftRepository } from './draft-repository.js';
import { MatterRepository } from './matter-repository.js';

it('mantém um único resultado para o comando, inclusive após uma versão posterior', async () => {
  const postgresUrl = process.env.FORGELEX_DRAFT_SAVE_TEST_POSTGRES_URL;
  if (postgresUrl) {
    const target = new URL(postgresUrl);
    if (target.hostname !== '127.0.0.1' || target.pathname !== '/forgelex_draft_save_test' || target.search)
      throw new Error('DRAFT_SAVE_TEST_REQUIRES_DISPOSABLE_POSTGRES');
  }
  const a = await createDatabase({ url: postgresUrl ?? 'file::memory:' });
  const b = postgresUrl ? await createDatabase({ url: postgresUrl }) : a;
  try {
    await runPersistenceMigrations(a.client);
    await createDraftSaveTestStorage(a.client);
    const owner = { tenantId: 'manual-save', userId: 'editor' };
    const matters = new MatterRepository(a.db);
    const matter = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso' });
    const other = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Outro caso' });
    const scope = { ...owner, matterId: matter.id };
    const input = {
      tenantId: owner.tenantId,
      matterId: matter.id,
      createdBy: owner.userId,
      title: 'Minuta',
      contentHash: createHash('sha256').update('versão original').digest('hex'),
      sections: [
        { ordinal: 1, title: 'Pedidos', content: 'Segundo' },
        { ordinal: 0, title: 'Fatos', content: 'Primeiro' },
      ],
    };
    const one = new DraftRepository(a.db),
      two = new DraftRepository(b.db),
      commandId = randomUUID();
    const outcomes = postgresUrl
      ? await Promise.all([one.saveManualCommand(input, commandId), two.saveManualCommand(input, commandId)])
      : [await one.saveManualCommand(input, commandId), await two.saveManualCommand(input, commandId)];
    expect(outcomes.map((value) => value.replayed).sort()).toEqual([false, true]);
    expect(outcomes[0].result).toEqual(outcomes[1].result);
    const original = outcomes[0].result;
    expect(await one.listDrafts(owner.tenantId, matter.id)).toHaveLength(1);
    await expect(two.saveManualCommand({ ...input, title: 'Outro texto' }, commandId)).rejects.toThrow(
      'DRAFT_SAVE_COMMAND_CONFLICT',
    );
    await expect(two.saveManualCommand({ ...input, matterId: other.id }, commandId)).rejects.toThrow(
      'DRAFT_SAVE_COMMAND_CONFLICT',
    );
    expect(await two.recoverManualSave({ ...scope, userId: 'outro-usuário', commandId })).toBeUndefined();
    expect(await two.recoverManualSave({ ...scope, matterId: other.id, commandId })).toBeUndefined();
    expect(await two.recoverManualSave({ ...scope, tenantId: 'outro-tenant', commandId })).toBeUndefined();
    const updateId = randomUUID();
    const update = {
      ...input,
      draftId: original.draft.id,
      title: 'Minuta atualizada',
      baseVersionId: original.version.id,
      expectedCurrentVersionId: original.version.id,
    };
    const updated = await one.saveManualCommand(update, updateId);
    const later = await one.saveManual({
      ...update,
      title: 'Versão posterior',
      baseVersionId: updated.result.version.id,
      expectedCurrentVersionId: updated.result.version.id,
    });
    expect(await two.recoverManualSave({ ...scope, commandId })).toEqual(original);
    expect(await two.saveManualCommand(update, updateId)).toEqual({ ...updated, replayed: true });
    expect((await one.getCurrentVersion(owner.tenantId, matter.id, original.draft.id))?.version.id).toBe(
      later.version.id,
    );
    expect(await one.listVersions(owner.tenantId, matter.id, original.draft.id)).toHaveLength(3);

    const rejected = randomUUID();
    await expect(
      one.saveManualCommand(
        {
          ...input,
          sections: [{ ...input.sections[0], linkedThesisIds: [randomUUID()] }],
        },
        rejected,
      ),
    ).rejects.toThrow('DRAFT_THESIS_NOT_FOUND');
    expect(await two.recoverManualSave({ ...scope, commandId: rejected })).toBeUndefined();
    expect(await one.listDrafts(owner.tenantId, matter.id)).toHaveLength(1);
  } finally {
    a.client.close();
    if (b !== a) b.client.close();
  }
});
