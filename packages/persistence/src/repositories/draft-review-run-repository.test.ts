import { describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '../index.js';
import { DraftRepository } from './draft-repository.js';
import { MatterRepository } from './matter-repository.js';
import { DraftReviewRunRepository } from './draft-review-run-repository.js';

async function fixture() {
  const connection = await createDatabase();
  await runPersistenceMigrations(connection.client);
  const matter = await new MatterRepository(connection.db).createMatter({
    tenantId: 'review',
    createdBy: 'author',
    title: 'Caso de teste',
  });
  const context = { tenantId: 'review', userId: 'author', matterId: matter.id };
  const drafts = new DraftRepository(connection.db);
  const draft = await drafts.createDraft({ ...context, createdBy: 'author', title: 'Minuta de teste' });
  const bundle = await drafts.createVersion({
    ...context,
    draftId: draft.id,
    title: draft.title,
    createdBy: 'author',
    source: 'HUMAN',
    contentHash: 'a'.repeat(64),
    sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto' }],
  });
  return { ...connection, context, drafts, bundle, runs: new DraftReviewRunRepository(connection.db) };
}

describe('Execuções de revisão', () => {
  it('mantém uma execução completa sem achados e não expõe outro tenant', async () => {
    const f = await fixture();
    try {
      const run = await f.runs.start(f.context, f.bundle.version, 'ALL', 'b'.repeat(64));
      const result = await f.runs.finish(f.context, run.id, {
        state: 'COMPLETE',
        status: 'PASSED',
        checks: [],
        findings: [],
      });
      expect(result.run).toMatchObject({
        state: 'COMPLETE',
        contentHash: 'a'.repeat(64),
        contextHash: 'b'.repeat(64),
        runNumber: 1,
      });
      expect(
        await f.runs.getLatest({ ...f.context, tenantId: 'other' }, run.draftId, run.draftVersionId),
      ).toBeUndefined();
      expect(await f.runs.list(f.context, run.draftId, run.draftVersionId)).toHaveLength(1);
      await expect(
        f.runs.start({ ...f.context, tenantId: 'other' }, f.bundle.version, 'ALL', 'b'.repeat(64)),
      ).rejects.toThrow('NOT_FOUND');
    } finally {
      f.client.close();
    }
  });

  it('ordena pela abertura e não pelo término; execuções específicas não substituem ALL', async () => {
    const f = await fixture();
    try {
      const first = await f.runs.start(f.context, f.bundle.version, 'ALL', 'b'.repeat(64));
      const second = await f.runs.start(f.context, f.bundle.version, 'ALL', 'b'.repeat(64));
      await f.runs.finish(f.context, second.id, { state: 'COMPLETE', status: 'PASSED', checks: [], findings: [] });
      await f.runs.finish(f.context, first.id, { state: 'COMPLETE', status: 'PASSED', checks: [], findings: [] });
      await f.runs.start(f.context, f.bundle.version, 'CITATION', 'b'.repeat(64));
      expect((await f.runs.getLatest(f.context, first.draftId, first.draftVersionId))?.id).toBe(second.id);
      await expect(
        f.runs.finish(f.context, first.id, { state: 'COMPLETE', status: 'PASSED', checks: [], findings: [] }),
      ).rejects.toThrow('TERMINAL');
    } finally {
      f.client.close();
    }
  });

  it('não publica resultados parciais se o achado for inválido', async () => {
    const f = await fixture();
    try {
      const run = await f.runs.start(f.context, f.bundle.version, 'ALL', 'b'.repeat(64));
      await expect(
        f.runs.finish(f.context, run.id, {
          state: 'COMPLETE',
          status: 'BLOCKED',
          checks: [],
          findings: [
            {
              ...f.context,
              draftId: run.draftId,
              draftVersionId: run.draftVersionId,
              reviewType: 'CITATION',
              severity: 'BLOCKING',
              code: '',
              message: '',
            },
          ],
        }),
      ).rejects.toThrow();
      expect((await f.runs.getLatest(f.context, run.draftId, run.draftVersionId))?.state).toBe('RUNNING');
      expect(await f.drafts.listReviewFindings(f.context.tenantId, f.context.matterId, run.draftId)).toEqual([]);
    } finally {
      f.client.close();
    }
  });
});
