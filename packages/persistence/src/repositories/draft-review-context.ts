import { createHash } from 'node:crypto';
import type { DraftVersionBundle } from './draft-repository.js';
import type { ForgeLexDatabase } from '../db.js';
import type { ReviewContext } from './draft-review-run-repository.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { MatterAuthorityRepository } from './matter-authority-repository.js';
import { MatterRepository } from './matter-repository.js';

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
  return { authorities, facts, supports, evidence, evidenceSourceLinks, anchors };
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
