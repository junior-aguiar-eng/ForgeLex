import type { AnalysisItem, CaseAiOwner } from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { LegalIssueRepository } from './legal-issue-repository.js';

/** Caller validates authorization, sources and decisions inside a guarded matter transaction. */
export async function adoptAnalysisItem(
  db: ForgeLexDatabase,
  o: CaseAiOwner,
  matterId: string,
  id: string,
  item: AnalysisItem,
  text: string,
  relatedFactId?: string,
): Promise<string> {
  const facts = new FactsEvidenceRepository(db),
    issues = new LegalIssueRepository(db);
  const ctx = { tenantId: o.tenantId, matterId, createdBy: o.userId };
  let targetId: string;
  if (item.kind === 'FACT') {
    targetId = (
      await facts.createFact({
        ...ctx,
        statement: text,
        status: item.classification === 'DISPUTED' ? 'DISPUTED' : 'ASSERTED',
      })
    ).id;
    for (const ref of item.sources)
      await facts.linkFactToAnchor({
        ...ctx,
        factId: targetId,
        documentAnchorId: ref.anchorId,
        relation: ref.relation,
        note: `Análise ${id}: ${item.classification}`,
      });
  } else if (item.kind === 'EVIDENCE') {
    const factId = relatedFactId;
    if (item.factItemId && !factId) throw new Error('ANALYSIS_FACT_REQUIRED');
    targetId = (await facts.createEvidenceItem({ ...ctx, title: text, evidenceType: 'DOCUMENT' })).id;
    for (const ref of item.sources)
      await facts.linkEvidenceToAnchor({
        ...ctx,
        evidenceItemId: targetId,
        documentAnchorId: ref.anchorId,
        relation: ref.relation === 'SUPPORTS' ? 'PROVES' : ref.relation === 'CONTRADICTS' ? 'REFUTES' : 'CONTEXT',
      });
    if (factId) await facts.linkEvidenceToFact({ ...ctx, factId, evidenceItemId: targetId, relation: item.relation! });
  } else if (item.kind === 'TIMELINE')
    targetId = (
      await facts.createTimelineEvent({
        ...ctx,
        title: text,
        eventDate: item.eventDate!,
        sourceAnchorId: item.sources[0]?.anchorId,
      })
    ).id;
  else targetId = (await issues.createIssue({ ...ctx, statement: item.kind === 'GAP' ? `Lacuna: ${text}` : text })).id;
  return targetId;
}
