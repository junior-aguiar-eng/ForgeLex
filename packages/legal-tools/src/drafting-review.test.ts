import { describe, expect, it } from 'vitest';
import { createDatabase, DraftRepository, FactsEvidenceRepository, MatterRepository, runPersistenceMigrations } from '@forgelex/persistence';
import { FactsEvidenceService } from './facts-evidence/facts-evidence-service.js';
import { DraftingService } from './drafting/draft-service.js';
import { DraftReviewService } from './review/review-service.js';

const authorityId = '22222222-2222-4222-8222-222222222222';

describe('Draft Studio e Review', () => {
  it('versiona a minuta, persiste achados e exige aprovação sem armazenar o token bruto', async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    try {
      await runPersistenceMigrations(connection.client);
      const matterRepository = new MatterRepository(connection.db);
      const matter = await matterRepository.createMatter({
        tenantId: 'tenant_drafting',
        createdBy: 'user_drafting',
        title: 'Matter de revisão',
      });
      const factsEvidenceService = new FactsEvidenceService(new FactsEvidenceRepository(connection.db));
      const context = { tenantId: 'tenant_drafting', userId: 'user_drafting', matterId: matter.id };
      const fact = await factsEvidenceService.createFact(context, { statement: 'O contrato foi assinado.' });
      const evidence = await factsEvidenceService.createEvidence(context, { title: 'Contrato assinado' });
      await factsEvidenceService.linkEvidenceToFact(context, {
        factId: fact.id,
        evidenceItemId: evidence.id,
        relation: 'SUPPORTS',
      });

      const draftingService = new DraftingService(new DraftRepository(connection.db));
      const initial = await draftingService.createDraft(context, {
        title: 'Minuta de revisão contratual',
        sections: [{
          ordinal: 0,
          title: 'Síntese dos fatos',
          content: 'O contrato foi assinado pelas partes.',
          linkedFactIds: [fact.id],
          linkedEvidenceIds: [evidence.id],
          linkedAuthorityIds: [authorityId],
        }],
        citations: [{
          sectionOrdinal: 0,
          targetType: 'AUTHORITY',
          targetId: authorityId,
          citationText: 'Autoridade a conferir',
          verified: false,
        }],
      });
      expect(initial.version.versionNumber).toBe(1);

      const repository = new DraftRepository(connection.db);
      const reviewService = new DraftReviewService(repository, factsEvidenceService);
      const blocked = await reviewService.runAll(context, initial.draft.id);
      expect(blocked.status).toBe('BLOCKED');
      expect(blocked.findings.some((finding) => finding.code === 'CITATION_NOT_VERIFIED')).toBe(true);
      await expect(draftingService.requestApproval(context, initial.draft.id)).rejects.toThrow('DRAFT_REVIEW_BLOCKED');

      const updated = await draftingService.updateDraft(context, initial.draft.id, {
        title: 'Minuta de revisão contratual - v2',
        sections: [{
          ordinal: 0,
          title: 'Síntese dos fatos',
          content: 'O contrato foi assinado pelas partes.',
          linkedFactIds: [fact.id],
          linkedEvidenceIds: [evidence.id],
          linkedAuthorityIds: [authorityId],
        }, {
          ordinal: 1,
          title: 'Fundamentação a revisar',
          content: 'A fundamentação será conferida antes da aprovação.',
          linkedFactIds: [fact.id],
          linkedEvidenceIds: [evidence.id],
          linkedAuthorityIds: [authorityId],
        }],
        citations: [{
          sectionOrdinal: 1,
          targetType: 'AUTHORITY',
          targetId: authorityId,
          citationText: 'Autoridade conferida',
          verified: true,
        }],
      });
      expect(updated.version.versionNumber).toBe(2);
      const passed = await reviewService.runAll(context, initial.draft.id, updated.version.id);
      expect(passed.blockingCount).toBe(0);
      expect(passed.status).toBe('PASSED');

      const approval = await draftingService.requestApproval(context, initial.draft.id, updated.version.id);
      expect(approval.token).toBeTruthy();
      const tokenRows = await connection.client.execute('SELECT token_hash FROM draft_approval_tokens');
      expect(tokenRows.rows[0]?.token_hash).not.toBe(approval.token);

      const resolved = await draftingService.resolveApproval(
        { tenantId: context.tenantId, userId: 'reviewer_drafting' },
        approval.token,
        'APPROVED',
        'Conferência humana concluída.',
      );
      expect(resolved.request.status).toBe('APPROVED');
      const details = await draftingService.getDraft(context, initial.draft.id);
      expect(details.draft.status).toBe('APPROVED');
      expect(details.draft.title).toBe('Minuta de revisão contratual - v2');
      expect(details.versions).toHaveLength(2);
      expect(await repository.getDraft('tenant_outro', matter.id, initial.draft.id)).toBeUndefined();
    } finally {
      connection.client.close();
    }
  });
});
