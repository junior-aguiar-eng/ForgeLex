import { it, expect } from 'vitest';
import { caseAccessFixture } from './case-ai-access-repository.test.js';
import { MatterLifecycleRepository } from './matter-lifecycle-repository.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { LegalIssueRepository } from './legal-issue-repository.js';
import { DraftRepository } from './draft-repository.js';

it.each(['ARCHIVED', 'TRASHED'] as const)('blocks imports, facts, issues, drafts and IA grants in %s cases', async state => {
  const f = await caseAccessFixture();
  try {
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
    const base = { ...target, createdBy: f.owner.userId };
    await new MatterLifecycleRepository(f.db).transition(target, { userId: f.owner.userId, role: 'member', authType: 'web_session', scopes: ['matter:write'] }, state === 'ARCHIVED' ? 'archive' : 'trash', { expectedLifecycleRevision: 0 });
    const writes = [
      () => f.matters.ingestTextDocument({ ...base, title: 'New document', originalFilename: 'new.txt', mimeType: 'text/plain', content: 'Should not persist' }),
      () => new FactsEvidenceRepository(f.db).createFact({ ...base, statement: 'Should not persist', category: 'OTHER' }),
      () => new LegalIssueRepository(f.db).createIssue({ ...base, statement: 'Should not persist' }),
      () => new DraftRepository(f.db).createDraft({ ...base, title: 'Should not persist' }),
      () => f.repo.replace(f.owner, target.matterId, f.input),
    ];
    for (const write of writes) await expect(write()).rejects.toThrow(/MATTER_NOT_ACTIVE|CASE_SELECTION_INVALID/);
    for (const table of ['facts', 'legal_issues', 'drafts', 'case_ai_access_grants']) {
      expect((await f.client.execute({ sql: `SELECT COUNT(*) AS count FROM ${table} WHERE matter_id=?`, args: [target.matterId] })).rows[0].count).toBe(0);
    }
    expect((await f.matters.listDocuments(target.tenantId, target.matterId)).length).toBe(1);
  } finally { f.client.close(); }
});

it('rejects new links to archived documents', async () => {
  const f = await caseAccessFixture();
  try {
    const target = { tenantId: f.owner.tenantId, matterId: f.matter.id };
    const facts = new FactsEvidenceRepository(f.db);
    const fact = await facts.createFact({ ...target, createdBy: f.owner.userId, statement: 'Fact for linking', category: 'OTHER' });
    await new MatterLifecycleRepository(f.db).transition({ ...target, documentId: f.doc.document.id }, { userId: f.owner.userId, role: 'member', authType: 'web_session', scopes: ['matter:write'] }, 'archive', { expectedLifecycleRevision: 0 });
    await expect(facts.linkFactToAnchor({ ...target, factId: fact.id, documentAnchorId: f.doc.anchors[0].id, relation: 'SUPPORTS' })).rejects.toThrow('ANCHOR_NOT_FOUND');
  } finally { f.client.close(); }
});
