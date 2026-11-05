import { createHash } from 'node:crypto';
import type { AgenticTaskDelivery, EvidenceReviewItem, TaskEvidenceMatrix, DocumentAnchor } from '@forgelex/domain';

export const evidenceHash = (value: unknown): string =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
export interface ReviewSource {
  id: string;
  text?: string;
  documentId?: string;
  versionId?: string;
  anchors?: DocumentAnchor[];
  blocked?: string;
  /** Lifecycle/content snapshot participates in the review token, including unavailable sources. */
  fingerprint: unknown;
}
type Ref = TaskEvidenceMatrix['rows'][number]['references'][number];

/** UTF-16 offsets match extraction and source audit. Only whitespace may fall between paragraph anchors. */
function resolveReference(
  ref: Ref,
  source?: ReviewSource,
): { sources: EvidenceReviewItem['sources']; blocked: string[] } {
  const fail = (reason: string) => ({ sources: [], blocked: [reason] });
  if (!source || source.blocked || source.text === undefined) return fail(source?.blocked ?? 'SOURCE_UNAVAILABLE');
  if (
    ref.quoteStatus !== 'MATCHED' ||
    evidenceHash(source.text) !== ref.sourceContentHash ||
    source.text.slice(ref.start, ref.start + ref.quote.length) !== ref.quote
  )
    return fail('REFERENCE_MISMATCH');
  if (!source.documentId) return { sources: [], blocked: [] };
  const end = ref.start + ref.quote.length;
  let cursor = ref.start;
  const sources: EvidenceReviewItem['sources'] = [];
  for (const anchor of [...(source.anchors ?? [])].sort((a, b) => a.startOffset! - b.startOffset!)) {
    if (anchor.startOffset === undefined || anchor.endOffset === undefined) continue;
    const start = Math.max(ref.start, anchor.startOffset),
      stop = Math.min(end, anchor.endOffset);
    if (stop <= start) continue;
    if (
      source.text.slice(cursor, start).trim() ||
      source.text.slice(anchor.startOffset, anchor.endOffset) !== anchor.text ||
      evidenceHash(anchor.text) !== anchor.contentHash
    )
      return fail('ANCHOR_MISMATCH');
    sources.push({
      documentId: source.documentId,
      versionId: source.versionId!,
      anchorId: anchor.id,
      quote: source.text.slice(start, stop),
      relation: ref.relation,
    });
    cursor = Math.max(cursor, stop);
  }
  if (!sources.length || source.text.slice(cursor, end).trim()) return fail('ANCHOR_UNAVAILABLE');
  return { sources, blocked: [] };
}

export function deriveEvidenceReviewItems(
  deliveryId: string,
  delivery: AgenticTaskDelivery,
  available: ReviewSource[],
): EvidenceReviewItem[] {
  const matrix = delivery.evidenceMatrix;
  if (!matrix || delivery.action !== 'analyze_evidence') throw new Error('EVIDENCE_REVIEW_NOT_AVAILABLE');
  const items: EvidenceReviewItem[] = [];
  const id = (...parts: unknown[]) => evidenceHash([deliveryId, ...parts]);
  const add = (item: Omit<EvidenceReviewItem, 'sources' | 'blockedReasons'>, sourceIds: string[] = []) => {
    const refs = item.references.map((ref) =>
      resolveReference(
        ref,
        available.find((s) => s.id === ref.sourceId),
      ),
    );
    const blocked = sourceIds.flatMap((sourceId) => {
      const source = available.find((s) => s.id === sourceId);
      return !source || source.blocked ? [source?.blocked ?? 'SOURCE_UNAVAILABLE'] : [];
    });
    items.push({
      ...item,
      sources: refs.flatMap((r) => r.sources),
      blockedReasons: [...new Set([...blocked, ...refs.flatMap((r) => r.blocked)])],
    });
    if (items.length > 1000) throw new Error('EVIDENCE_REVIEW_LIMIT');
  };
  matrix.rows.forEach((row, index) => {
    const claim = delivery.claims.find((c) => c.id === row.claimId);
    if (!claim || row.issueIds.some((i) => !delivery.issues.some((issue) => issue.id === i)))
      throw new Error('DELIVERY_INTEGRITY_FAILED');
    const factId = id('fact', index, row.id);
    add(
      {
        id: factId,
        kind: 'FACT',
        text: claim.statement,
        classification:
          claim.classification === 'CONFLICT' || row.coverage === 'CONFLICTING'
            ? 'DISPUTED'
            : claim.classification === 'DOCUMENT_RECORD'
              ? 'EXTRACTED'
              : claim.classification,
        references: row.references,
        originIds: [row.id, claim.id],
      },
      claim.sourceIds,
    );
    row.references.forEach((ref, refIndex) => {
      if (delivery.sources.find((s) => s.id === ref.sourceId)?.kind !== 'DOCUMENT') return;
      add({
        id: id('evidence', index, refIndex),
        kind: 'EVIDENCE',
        text: ref.quote,
        classification: 'EXTRACTED',
        factItemId: factId,
        relation: ref.relation,
        references: [ref],
        originIds: [row.id, claim.id],
      });
    });
    row.gaps.forEach((text, gapIndex) =>
      add(
        {
          id: id('gap', index, gapIndex),
          kind: 'GAP',
          text,
          classification: 'GAP',
          references: row.references,
          originIds: [row.id, claim.id],
        },
        claim.sourceIds,
      ),
    );
  });
  delivery.issues.forEach((issue, index) =>
    add(
      {
        id: id('issue', index, issue.id),
        kind: 'ISSUE',
        text: issue.statement,
        classification: 'LEGAL_QUESTION',
        references: [],
        originIds: [issue.id],
      },
      issue.sourceIds,
    ),
  );
  matrix.chronology.forEach((event, index) => {
    if (event.claimIds.some((i) => !delivery.claims.some((c) => c.id === i)))
      throw new Error('DELIVERY_INTEGRITY_FAILED');
    add({
      id: id('event', index, event.id),
      kind: 'TIMELINE',
      text: event.description,
      classification: 'ALLEGATION',
      references: [event.reference],
      originIds: [event.id, ...event.claimIds],
      ...(event.dateText ? { dateText: event.dateText } : {}),
      ...(event.dateStatus === 'LITERAL_ISO' && event.sortDate && event.reference.quote.includes(event.sortDate)
        ? { eventDate: event.sortDate }
        : {}),
    });
  });
  matrix.contradictions.forEach((conflict, index) => {
    if (conflict.claimIds.some((i) => !delivery.claims.some((c) => c.id === i)))
      throw new Error('DELIVERY_INTEGRITY_FAILED');
    add({
      id: id('conflict', index, conflict.id),
      kind: 'ISSUE',
      text: conflict.explanation,
      classification: 'LEGAL_QUESTION',
      references: matrix.rows.filter((r) => conflict.claimIds.includes(r.claimId)).flatMap((r) => r.references),
      originIds: [conflict.id, ...conflict.claimIds],
    });
  });
  if (Buffer.byteLength(JSON.stringify(items)) > 1000000) throw new Error('EVIDENCE_REVIEW_LIMIT');
  return items;
}
