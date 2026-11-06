import { afterEach, expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { MatterRepository } from './matter-repository.js';
import { DraftRepository } from './draft-repository.js';
import { NativeCaseTaskRepository } from './native-case-task-repository.js';
const closers: (() => void)[] = [];
afterEach(() => closers.splice(0).forEach((close) => close()));
async function fixture() {
  const c = await createDatabase({ url: 'file::memory:' });
  closers.push(() => c.client.close());
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: 'tenant', userId: 'user' };
  const matter = await new MatterRepository(c.db).createMatter({
    tenantId: owner.tenantId,
    title: 'Sintético',
    createdBy: owner.userId,
  });
  const repo = new DraftRepository(c.db);
  const draft = await repo.createDraft({
    tenantId: owner.tenantId,
    matterId: matter.id,
    title: 'Peça',
    createdBy: owner.userId,
  });
  const input = {
    tenantId: owner.tenantId,
    matterId: matter.id,
    draftId: draft.id,
    title: 'Peça',
    createdBy: owner.userId,
    source: 'HUMAN' as const,
    contentHash: 'a'.repeat(64),
    sections: [
      {
        ordinal: 1,
        title: 'Fatos',
        content: '  As parte apresenta o pedido.  ',
        linkedFactIds: [],
        linkedEvidenceIds: [],
        linkedAuthorityIds: [],
        linkedThesisIds: [],
      },
    ],
  };
  const bundle = await repo.createVersion(input);
  let allowed = true;
  const native = new NativeCaseTaskRepository(c.db, async () => {
    if (!allowed) throw new Error('ACCESS_REVOKED');
  });
  return {
    ...c,
    owner,
    repo,
    input,
    native,
    id: `desk:${matter.id}`,
    target: { draftId: draft.id, versionId: bundle.version.id },
    revoke: () => {
      allowed = false;
    },
  };
}
it('revisa peça humana sem fabricar entrega, preserva texto e isola histórico por usuário', async () => {
  const f = await fixture();
  const first = await f.native.loadEditorialSnapshot(f.owner, f.id, f.target);
  expect(first.origin).toBe('DESK_VERSION');
  expect(first.delivery.supportAudit).toEqual([]);
  expect(first.delivery.findings[0].code).toBe('LEGAL_SUPPORT_NOT_EVALUATED');
  expect(first.delivery.document?.sections[0].content).toBe(f.input.sections[0].content);
  expect(await f.native.loadEditorialSnapshot(f.owner, f.id, f.target)).toEqual(first);
  await f.native.editorialReview(f.owner, f.id, f.target, () => ({ result: true, record: 'review' }));
  expect(await f.native.readEditorialHistory(f.owner, f.id, f.target)).toBe('review');
  expect(await f.native.readEditorialHistory({ ...f.owner, userId: 'other' }, f.id, f.target)).toBeNull();
  expect((await f.client.execute('SELECT count(*) AS n FROM agentic_task_deliveries')).rows[0].n).toBe(0);
  expect(
    (await f.repo.getVersion(f.owner.tenantId, f.input.matterId, f.target.draftId, f.target.versionId))?.sections[0]
      .content,
  ).toBe(f.input.sections[0].content);
  await expect(f.native.loadEditorialSnapshot({ ...f.owner, tenantId: 'other' }, f.id, f.target)).rejects.toThrow(
    'MATTER_NOT_FOUND',
  );
  f.revoke();
  await expect(f.native.readEditorialHistory(f.owner, f.id, f.target)).rejects.toThrow('ACCESS_REVOKED');
});
it('aceita nova versão editada, bloqueia a antiga e mantém seu histórico', async () => {
  const f = await fixture();
  await f.native.editorialReview(f.owner, f.id, f.target, () => ({ result: true, record: 'old' }));
  const edited = await f.repo.createVersion({
    ...f.input,
    title: 'Editada',
    baseVersionId: f.target.versionId,
    expectedCurrentVersionId: f.target.versionId,
    sections: [{ ...f.input.sections[0], content: 'Texto editado.' }],
  });
  await expect(f.native.loadEditorialSnapshot(f.owner, f.id, f.target)).rejects.toThrow('EDITORIAL_VERSION_CONFLICT');
  expect(await f.native.readEditorialHistory(f.owner, f.id, f.target)).toBe('old');
  const loaded = await f.native.loadEditorialSnapshot(f.owner, f.id, { ...f.target, versionId: edited.version.id });
  expect(loaded.delivery.document?.title).toBe('Editada');
  expect(loaded.delivery.document?.sections[0].content).toBe('Texto editado.');
});
it('aplica somente por comando explícito e recupera a mesma aplicação sem criar outra versão', async () => {
  const f = await fixture();
  await f.native.loadEditorialSnapshot(f.owner, f.id, f.target);
  let prepares = 0;
  const prepare = (snapshot: Awaited<ReturnType<typeof f.native.loadEditorialSnapshot>>) => {
    prepares++;
    return {
      document: {
        ...snapshot.delivery.document!,
        sections: [{ ...snapshot.delivery.document!.sections[0], content: 'As partes apresentam o pedido.' }],
      },
      complete: (v: { id: string }) => ({ result: v.id, record: JSON.stringify({ versionId: v.id }) }),
    };
  };
  const replay = (record: string | null) => (record ? (JSON.parse(record).versionId as string) : undefined);
  const id = await f.native.applyEditorialChanges(f.owner, f.id, f.target, prepare, replay);
  expect(await f.native.applyEditorialChanges(f.owner, f.id, f.target, prepare, replay)).toBe(id);
  expect(prepares).toBe(1);
  expect((await f.client.execute('SELECT count(*) AS n FROM draft_versions')).rows[0].n).toBe(2);
  expect(
    (await f.repo.getVersion(f.owner.tenantId, f.input.matterId, f.target.draftId, f.target.versionId))?.sections[0]
      .content,
  ).toBe(f.input.sections[0].content);
});
