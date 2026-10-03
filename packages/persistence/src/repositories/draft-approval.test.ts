import { describe, expect, it } from 'vitest';
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
    } finally {
      client.close();
    }
  });
});
