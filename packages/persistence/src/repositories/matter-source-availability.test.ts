import { it, expect } from 'vitest';
import { caseAccessFixture } from './case-ai-access-repository.test.js';
import { MatterLifecycleRepository } from './matter-lifecycle-repository.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { DraftRepository } from './draft-repository.js';
import { reviewContextHash } from './draft-review-context.js';
import { DraftReviewService } from '../../../legal-tools/src/review/review-service.js';
import { FactsEvidenceService } from '../../../legal-tools/src/facts-evidence/facts-evidence-service.js';
import { createFixtureResearchService } from '../../../legal-tools/src/research/research-service.js';
import { MatterAuthorityRepository } from './matter-authority-repository.js';

it('keeps archived human sources, blocks trashed proof, and changes context after restoration', async () => {
  const f = await caseAccessFixture();
  try {
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
    const context = { ...target, userId: f.owner.userId };
    const actor = { ...f.owner, role: 'member' as const, authType: 'web_session' as const, scopes: ['matter:write'] };
    const facts = new FactsEvidenceRepository(f.db);
    const fact = await facts.createFact({ ...target, createdBy: actor.userId, statement: 'A supported fact', category: 'OTHER' });
    await facts.linkFactToAnchor({ ...target, factId: fact.id, documentAnchorId: f.doc.anchors[0].id, relation: 'SUPPORTS' });
    const drafts = new DraftRepository(f.db);
    const draft = await drafts.createDraft({ ...target, createdBy: actor.userId, title: 'Draft availability' });
    const bundle = await drafts.createVersion({ ...target, draftId: draft.id, createdBy: actor.userId, title: draft.title, source: 'HUMAN', contentHash: 'a'.repeat(64), sections: [{ ordinal: 0, title: 'Facts', content: 'Copied original stays here', linkedFactIds: [fact.id] }] });
    const before = reviewContextHash(await drafts.reviewContext(context, bundle));
    const repo = new MatterLifecycleRepository(f.db);
    const docTarget = { ...target, documentId: f.doc.document.id };
    await repo.transition(docTarget, actor, 'archive', { expectedLifecycleRevision: 0 });
    expect((await f.matters.getDocumentVersion(target.tenantId, docTarget.documentId))?.version.content).toBe(f.doc.version.content);
    await repo.transition(docTarget, actor, 'trash', { expectedLifecycleRevision: 1 });
    expect(await f.matters.getDocumentVersion(target.tenantId, docTarget.documentId)).toBeUndefined();
    expect((await facts.getEvidenceCoverage(target.tenantId, target.matterId))[0].coverage).toBe('UNSUPPORTED');
    expect((await drafts.reviewContext(context, bundle)).anchors).toEqual([]);
    const review = await new DraftReviewService({ drafts, runs: drafts.reviewRuns(), facts: new FactsEvidenceService(facts), authorities: new MatterAuthorityRepository(f.db), research: createFixtureResearchService(), evidence: facts, matters: f.matters, sourceMethod: 'PERSISTED_CORPUS' }).runAll(context, draft.id);
    expect(review.run.checks.some(check => check.targetType === 'DOCUMENT' && check.source?.method === 'CASE_DOCUMENT' && check.state === 'UNAVAILABLE')).toBe(true);
    expect(review.blockingCount).toBeGreaterThan(0);
    await repo.transition(docTarget, actor, 'restore', { expectedLifecycleRevision: 2 });
    expect(reviewContextHash(await drafts.reviewContext(context, bundle))).not.toBe(before);
    expect((await drafts.getVersion(target.tenantId, target.matterId, draft.id, bundle.version.id))?.sections[0].content).toBe('Copied original stays here');
  } finally { f.client.close(); }
});
