import { DraftReviewRunRepository } from './draft-review-run-repository.js';
import { reviewContextHash } from './draft-review-context.js';
import { describe, expect, it, vi } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { DraftRepository } from './draft-repository.js';
import { MatterRepository } from './matter-repository.js';

describe('Aprovação vinculada à versão do documento', () => {
  it('aprovar uma versão anterior não aprova a versão corrente e conserva o estado da versão decidida', async () => {
    const { db, client } = await createDatabase();
    try {
      await runPersistenceMigrations(client);
      const tenantId = 'approval-tenant';
      const matter = await new MatterRepository(db).createMatter({
        tenantId,
        createdBy: 'author',
        title: 'Caso fictício',
      });
      const repository = new DraftRepository(db);
      const draft = await repository.createDraft({
        tenantId,
        matterId: matter.id,
        createdBy: 'author',
        title: 'Minuta',
      });
      const input = {
        tenantId,
        matterId: matter.id,
        draftId: draft.id,
        createdBy: 'author',
        source: 'HUMAN' as const,
        title: 'Minuta',
        sections: [{ ordinal: 1, title: 'Fatos', content: 'Conteúdo fictício' }],
      };
      const v1 = await repository.createVersion({ ...input, contentHash: 'a'.repeat(64) });
      const runs = new DraftReviewRunRepository(db);
      const context = { tenantId, matterId: matter.id, userId: 'author' };
      const review = async (bundle: typeof v1) => {
        const run = await runs.start(context, bundle.version, 'ALL', reviewContextHash(await repository.reviewContext(context, bundle)));
        await runs.finish(context, run.id, { state: 'COMPLETE', status: 'PASSED', checks: [], findings: [] });
      };
      await review(v1);
      const approval = await repository.createApprovalRequest({
        tenantId,
        matterId: matter.id,
        draftId: draft.id,
        draftVersionId: v1.version.id,
        requestedBy: 'author',
        proposedAction: 'Conferir versão',
      });
      const v2 = await repository.createVersion({ ...input, contentHash: 'b'.repeat(64) });
      await repository.resolveApproval({
        tenantId,
        token: approval.token,
        decision: 'APPROVED',
        decidedBy: 'reviewer',
      });
      expect(await repository.getDraft(tenantId, matter.id, draft.id)).toMatchObject({
        currentVersionId: v2.version.id,
        status: 'DRAFT',
      });
      expect(await repository.getVersion(tenantId, matter.id, draft.id, v1.version.id)).toMatchObject({
        version: { status: 'APPROVED' },
      });
      expect(await repository.getVersion(tenantId, matter.id, draft.id, v2.version.id)).toMatchObject({
        version: { status: 'DRAFT' },
      });
      await review(v2);
      const currentApproval = await repository.createApprovalRequest({
        tenantId,
        matterId: matter.id,
        draftId: draft.id,
        draftVersionId: v2.version.id,
        requestedBy: 'author',
        proposedAction: 'Conferir versão',
      });
      await repository.resolveApproval({
        tenantId,
        token: currentApproval.token,
        decision: 'REJECTED',
        decidedBy: 'reviewer',
      });
      expect(await repository.getVersion(tenantId, matter.id, draft.id, v2.version.id)).toMatchObject({
        version: { status: 'REJECTED' },
      });
      expect(await repository.getDraft(tenantId, matter.id, draft.id)).toMatchObject({ status: 'REJECTED' });
      const v3 = await repository.createVersion({ ...input, contentHash: 'c'.repeat(64) });
      await review(v3);
      const raceApproval = await repository.createApprovalRequest({ ...context, draftId: draft.id, draftVersionId: v3.version.id, requestedBy: 'author', proposedAction: 'Conferir versão concorrente' });
      const decisions = await Promise.allSettled(['APPROVED', 'REJECTED'].map(decision => repository.resolveApproval({ tenantId, token: raceApproval.token, decision: decision as 'APPROVED' | 'REJECTED', decidedBy: 'reviewer' })));
      const winners = decisions.filter(r => r.status === 'fulfilled');
      expect(winners).toHaveLength(1);
      const loser = decisions.find(r => r.status === 'rejected') as PromiseRejectedResult;
      expect(String(loser.reason)).toMatch(/APPROVAL_NOT_PENDING|APPROVAL_TOKEN_USED/);
      const winner = winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof repository.resolveApproval>>>;
      expect((await repository.getVersion(tenantId, matter.id, draft.id, v3.version.id))?.version.status).toBe(winner.value.request.status);
      const v4 = await repository.createVersion({ ...input, contentHash: 'd'.repeat(64) });
      await review(v4);
      const finalApproval = await repository.createApprovalRequest({ ...context, draftId: draft.id, draftVersionId: v4.version.id, requestedBy: 'author', proposedAction: 'Conferir retorno da decisão' });
      const transaction = db.transaction.bind(db);
      let readsAfterCommit = 0;
      vi.spyOn(db, 'transaction').mockImplementationOnce(async callback => {
        const result = await transaction(callback);
        vi.spyOn(db, 'select').mockImplementation(() => {
          readsAfterCommit++;
          throw new Error('SQLITE_LOCKED: injected read after committed decision');
        });
        return result;
      });
      try {
        const resolution = await repository.resolveApproval({ tenantId, token: finalApproval.token, decision: 'APPROVED', decidedBy: 'reviewer' });
        expect(resolution.request.status).toBe('APPROVED');
        expect(resolution.token.usedAt).toBeTruthy();
        expect(readsAfterCommit).toBe(0);
      } finally {
        vi.restoreAllMocks();
      }
      expect((await repository.listApprovalRequests(tenantId, matter.id)).find(request => request.id === finalApproval.request.id)?.status).toBe('APPROVED');
    } finally {
      client.close();
    }
  });
});
