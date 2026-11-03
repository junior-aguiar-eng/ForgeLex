import { and, eq } from 'drizzle-orm';
import { ApprovedItemSnapshotSchema, type AgenticOwner, type ApprovedItemSnapshot } from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { MatterRepository } from './matter-repository.js';
import { evidenceHash as hash } from './evidence-review-items.js';

/** Read under the matter write lock. Returns a proposal, never an approval. */
export async function currentApprovedItem(
  db: ForgeLexDatabase,
  owner: AgenticOwner,
  matterId: string,
  previous: ApprovedItemSnapshot,
): Promise<ApprovedItemSnapshot> {
  const fail = () => {
    throw new Error('EVIDENCE_SOURCE_UNAVAILABLE');
  };
  const isFact = previous.kind === 'FACT';
  let text: string,
    status: string,
    relation = previous.relation,
    relatedFactId = previous.relatedFactId;
  let links: { documentAnchorId: string; relation: string }[];
  if (isFact) {
    const [fact] = await db
      .select()
      .from(s.facts)
      .where(
        and(eq(s.facts.id, previous.targetId), eq(s.facts.tenantId, owner.tenantId), eq(s.facts.matterId, matterId)),
      );
    if (!fact || fact.createdBy !== owner.userId || !['ASSERTED', 'DISPUTED'].includes(fact.status)) return fail();
    text = fact.statement;
    status = fact.status;
    links = await db
      .select()
      .from(s.factSourceLinks)
      .where(
        and(
          eq(s.factSourceLinks.factId, fact.id),
          eq(s.factSourceLinks.tenantId, owner.tenantId),
          eq(s.factSourceLinks.matterId, matterId),
        ),
      );
  } else {
    const [proof] = await db
      .select()
      .from(s.evidenceItems)
      .where(
        and(
          eq(s.evidenceItems.id, previous.targetId),
          eq(s.evidenceItems.tenantId, owner.tenantId),
          eq(s.evidenceItems.matterId, matterId),
        ),
      );
    if (!proof || proof.createdBy !== owner.userId || proof.status !== 'AVAILABLE' || proof.evidenceType !== 'DOCUMENT')
      return fail();
    text = proof.title;
    status = proof.status;
    const facts = await db
      .select()
      .from(s.evidenceLinks)
      .where(
        and(
          eq(s.evidenceLinks.evidenceItemId, proof.id),
          eq(s.evidenceLinks.tenantId, owner.tenantId),
          eq(s.evidenceLinks.matterId, matterId),
        ),
      );
    if (facts.length !== 1) return fail();
    relation = facts[0].relation as ApprovedItemSnapshot['relation'];
    relatedFactId = facts[0].factId;
    links = await db
      .select()
      .from(s.evidenceSourceLinks)
      .where(
        and(
          eq(s.evidenceSourceLinks.evidenceItemId, proof.id),
          eq(s.evidenceSourceLinks.tenantId, owner.tenantId),
          eq(s.evidenceSourceLinks.matterId, matterId),
        ),
      );
    if (!links.length) return fail();
  }
  if (links.length > 1000) return fail();
  const sources: ApprovedItemSnapshot['sources'] = [];
  for (const link of links) {
    const [anchor] = await db
      .select({ anchor: s.documentAnchors, version: s.documentVersions })
      .from(s.documentAnchors)
      .innerJoin(s.documentVersions, eq(s.documentVersions.id, s.documentAnchors.documentVersionId))
      .where(eq(s.documentAnchors.id, link.documentAnchorId));
    if (!anchor) return fail();
    const current = await new MatterRepository(db).getDocumentVersion(
      owner.tenantId,
      anchor.version.documentId,
      'work',
    );
    if (
      !current ||
      current.document.matterId !== matterId ||
      current.document.lifecycleState !== 'ACTIVE' ||
      current.version.id !== anchor.version.id ||
      hash(current.version.content) !== current.version.contentHash ||
      hash(anchor.anchor.text) !== anchor.anchor.contentHash ||
      current.version.content.slice(anchor.anchor.startOffset, anchor.anchor.endOffset) !== anchor.anchor.text
    )
      return fail();
    const mapped = isFact
      ? link.relation
      : ({ PROVES: 'SUPPORTS', REFUTES: 'CONTRADICTS', CONTEXT: 'CONTEXT' } as Record<string, string>)[link.relation];
    const old = previous.sources.filter(
      (ref) => ref.anchorId === anchor.anchor.id && ref.versionId === current.version.id && ref.relation === mapped,
    );
    // Preserve the exact reviewed excerpt while its anchor remains valid; a new anchor is shown in full.
    const quotes = old.length ? [...new Set(old.map((ref) => ref.quote))] : [anchor.anchor.text];
    for (const quote of quotes) {
      if (!anchor.anchor.text.includes(quote)) return fail();
      sources.push({
        documentId: current.document.id,
        versionId: current.version.id,
        anchorId: anchor.anchor.id,
        quote,
        relation: mapped as ApprovedItemSnapshot['sources'][number]['relation'],
        contentHash: current.version.contentHash,
      });
    }
  }
  sources.sort((a, b) => {
    const withoutHash = ({ contentHash: _, ...s }: typeof a) => s;
    return JSON.stringify(withoutHash(a)).localeCompare(JSON.stringify(withoutHash(b)));
  });
  const candidate = ApprovedItemSnapshotSchema.safeParse({
    ...previous,
    text,
    status,
    relation,
    relatedFactId,
    sources,
  });
  if (!candidate.success) return fail();
  return candidate.data;
}
