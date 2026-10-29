import { expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations, MatterRepository, DraftRepository } from '@forgelex/persistence';
import { DraftingService } from './draft-service.js';
it('recusa save com revisão esperada antiga sob lock e preserva a versão concorrente', async () => {
  const c = await createDatabase({ url: 'file::memory:' });
  try {
    await runPersistenceMigrations(c.client);
    const matter = await new MatterRepository(c.db).createMatter({
      tenantId: 'edit',
      createdBy: 'author',
      title: 'Caso',
    });
    const ctx = { tenantId: 'edit', userId: 'author', matterId: matter.id },
      repo = new DraftRepository(c.db),
      service = new DraftingService(repo);
    const first = await service.createDraft(ctx, {
      title: 'Minuta',
      sections: [{ ordinal: 0, title: 'Texto', content: 'Original' }],
    });
    const second = await service.updateDraft(ctx, first.draft.id, {
      title: 'Minuta',
      sections: [{ ordinal: 0, title: 'Texto', content: 'Concorrente' }],
      baseVersionId: first.version.id,
    });
    await expect(
      service.updateDraft(ctx, first.draft.id, {
        title: 'Minuta',
        sections: [{ ordinal: 0, title: 'Texto', content: 'Não pode sobrescrever' }],
        baseVersionId: first.version.id,
        expectedCurrentVersionId: first.version.id,
      } as any),
    ).rejects.toThrow('DRAFT_VERSION_CONFLICT');
    expect((await repo.getDraft(ctx.tenantId, ctx.matterId, first.draft.id))?.currentVersionId).toBe(second.version.id);
    expect(await repo.listVersions(ctx.tenantId, ctx.matterId, first.draft.id)).toHaveLength(2);
    // Legacy baseVersionId remains ancestry and does not acquire an implicit optimistic-lock meaning.
    await expect(
      service.updateDraft(ctx, first.draft.id, {
        title: 'Minuta',
        sections: [{ ordinal: 0, title: 'Texto', content: 'Derivação explícita legada' }],
        baseVersionId: first.version.id,
      }),
    ).resolves.toBeDefined();
  } finally {
    c.client.close();
  }
});
