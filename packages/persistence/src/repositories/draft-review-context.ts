import { createHash } from 'node:crypto';
import type { DraftVersionBundle } from './draft-repository.js';
import type { ForgeLexDatabase } from '../db.js';
import type { ReviewContext } from './draft-review-run-repository.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { MatterAuthorityRepository } from './matter-authority-repository.js';
import { MatterRepository } from './matter-repository.js';
import { DraftAiReceiptRepository } from './draft-ai-receipt-repository.js';
import { and, eq, inArray } from 'drizzle-orm';
import { legalTheses } from '../schema/schema.js';

export async function readDraftReviewContext(db: ForgeLexDatabase, context: ReviewContext, bundle: DraftVersionBundle) {
  const ids = (
    kind: 'AUTHORITY' | 'FACT' | 'EVIDENCE',
    field: 'linkedAuthorityIds' | 'linkedFactIds' | 'linkedEvidenceIds',
  ) =>
    new Set(
      bundle.sections
        .flatMap((s) => s[field])
        .concat(bundle.citations.filter((c) => c.targetType === kind).map((c) => c.targetId)),
    );
  const authorityIds = ids('AUTHORITY', 'linkedAuthorityIds'),
    factIds = ids('FACT', 'linkedFactIds'),
    evidenceIds = ids('EVIDENCE', 'linkedEvidenceIds');
  const repo = new FactsEvidenceRepository(db);
  const authorities = (
    await new MatterAuthorityRepository(db).listAuthorities(context.tenantId, context.matterId)
  ).filter((a) => authorityIds.has(a.id));
  const facts = (await repo.listFacts(context.tenantId, context.matterId)).filter((f) => factIds.has(f.id));
  const supports = await Promise.all(facts.map((f) => repo.getFactSupport(context.tenantId, context.matterId, f.id)));
  for (const support of supports) for (const link of support.evidenceLinks) evidenceIds.add(link.evidenceItemId);
  const evidence = (await repo.listEvidenceItems(context.tenantId, context.matterId)).filter((e) =>
    evidenceIds.has(e.id),
  );
  const evidenceSourceLinks = (await repo.listEvidenceSourceLinks(context.tenantId, context.matterId)).filter((l) =>
    evidenceIds.has(l.evidenceItemId),
  );
  const anchorIds = new Set(
    supports
      .flatMap((s) => s.sourceLinks.map((l) => l.documentAnchorId))
      .concat(evidenceSourceLinks.map((l) => l.documentAnchorId)),
  );
  const matters = new MatterRepository(db);
  const details = await Promise.all(
    (await matters.listDocuments(context.tenantId, context.matterId)).map((d) =>
      matters.getDocumentVersion(context.tenantId, d.id),
    ),
  );
  const anchors = details.flatMap((d) => d?.anchors ?? []).filter((a) => anchorIds.has(a.id));
  const references = await new DraftAiReceiptRepository(db).getReferences(context, context.matterId, bundle.version.draftId, bundle.version.id);
  const documentReferences = await Promise.all(references.filter(r => r.kind === 'DOCUMENT').map(async (reference) => {
    const detail = await matters.getSpecificDocumentVersion(context.tenantId, context.matterId, reference.itemId, reference.documentVersionId!);
    const anchor = reference.anchorId ? detail?.anchors.find(a => a.id === reference.anchorId) : undefined;
    return { reference, available: Boolean(detail && (!reference.anchorId || anchor)), documentTitle: detail?.document.title, versionNumber: detail?.version.versionNumber, contentHash: detail?.version.contentHash, createdAt: detail?.version.createdAt, anchor };
  }));
  const thesisIds = [...new Set(bundle.sections.flatMap(s => s.linkedThesisIds))];
  const theses = thesisIds.length ? await db.select().from(legalTheses).where(and(eq(legalTheses.tenantId, context.tenantId), eq(legalTheses.matterId, context.matterId), inArray(legalTheses.id, thesisIds))) : [];
  return { authorities, facts, supports, evidence, evidenceSourceLinks, anchors, documentReferences, theses };
}
export type DraftReviewContextSnapshot = Awaited<ReturnType<typeof readDraftReviewContext>>;
function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function reviewContextHash(snapshot: DraftReviewContextSnapshot): string {
  const supports = snapshot.supports.map(({ coverage, ...s }) => ({
    ...s,
    coverage: {
      coverage: coverage.coverage,
      supportingEvidenceCount: coverage.supportingEvidenceCount,
      contradictingEvidenceCount: coverage.contradictingEvidenceCount,
      supportingAnchorCount: coverage.supportingAnchorCount,
      contradictingAnchorCount: coverage.contradictingAnchorCount,
    },
  }));
  return createHash('sha256')
    .update(JSON.stringify(canonical({ ...snapshot, supports })))
    .digest('hex');
}
