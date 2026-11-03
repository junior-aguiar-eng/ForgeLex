import { z } from 'zod';
import {
  TaskEvidenceAnalysisSchema,
  TaskEvidenceMatrixSchema,
  type TaskEvidenceAnalysis,
  type TaskClaimSchema,
  type TaskIssueSchema,
  type TaskSource,
} from '@forgelex/domain';

export const EVIDENCE_LIMITATIONS = [
  'EVIDENCE_MATRIX_MISSING',
  'EVIDENCE_MATRIX_INCOMPLETE',
  'EVIDENCE_DOCUMENT_MISSING',
  'EVIDENCE_REFERENCE_MISMATCH',
  'EVIDENCE_DATE_UNCERTAIN',
  'EVIDENCE_CONFLICT_UNRESOLVED',
  'EVIDENCE_GAP',
] as const;
export function auditTaskEvidence(
  raw: TaskEvidenceAnalysis | undefined,
  claims: z.infer<typeof TaskClaimSchema>[],
  issues: z.infer<typeof TaskIssueSchema>[],
  sources: TaskSource[],
) {
  const limitations = new Set<(typeof EVIDENCE_LIMITATIONS)[number]>();
  if (!raw) limitations.add('EVIDENCE_MATRIX_MISSING');
  const input = TaskEvidenceAnalysisSchema.parse(raw ?? { rows: [], chronology: [], contradictions: [] });
  const unique = (ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw new Error('EVIDENCE_ID_CONFLICT');
  };
  unique([
    ...input.rows.map((r) => r.id),
    ...input.chronology.map((e) => e.id),
    ...input.contradictions.map((c) => c.id),
  ]);
  unique(input.rows.map((r) => r.claimId));
  const checkClaims = (ids: string[]) => {
    unique(ids);
    if (ids.some((id) => !claims.some((c) => c.id === id))) throw new Error('EVIDENCE_REFERENCE_INVALID');
  };
  const ref = (r: TaskEvidenceAnalysis['rows'][number]['references'][number]) => {
    const source = sources.find((s) => s.id === r.sourceId);
    if (!source) throw new Error('EVIDENCE_REFERENCE_INVALID');
    if (!['DOCUMENT', 'USER_TEXT', 'ANSWER'].includes(source.kind)) throw new Error('EVIDENCE_SOURCE_INVALID');
    const matched = source.text.slice(r.start, r.start + r.quote.length) === r.quote;
    if (!matched) limitations.add('EVIDENCE_REFERENCE_MISMATCH');
    return {
      ...r,
      sourceContentHash: source.contentHash,
      quoteStatus: matched ? ('MATCHED' as const) : ('MISMATCH' as const),
    };
  };
  const rows = input.rows.map((row) => {
    checkClaims([row.claimId]);
    unique(row.issueIds);
    if (row.issueIds.some((id) => !issues.some((i) => i.id === id))) throw new Error('EVIDENCE_REFERENCE_INVALID');
    const claim = claims.find((c) => c.id === row.claimId)!;
    if (row.references.some((r) => !claim.sourceIds.includes(r.sourceId)))
      throw new Error('EVIDENCE_REFERENCE_INVALID');
    unique(row.references.map((r) => JSON.stringify([r.sourceId, r.start, r.quote])));
    const references = row.references.map(ref);
    if (row.gaps.length) limitations.add('EVIDENCE_GAP');
    const conflicting = claim.classification === 'CONFLICT' || references.some((r) => r.relation === 'CONTRADICTS');
    if (conflicting) limitations.add('EVIDENCE_CONFLICT_UNRESOLVED');
    const document = references.some(
      (r) => r.quoteStatus === 'MATCHED' && sources.some((s) => s.id === r.sourceId && s.kind === 'DOCUMENT'),
    );
    if (!document) limitations.add('EVIDENCE_DOCUMENT_MISSING');
    return {
      ...row,
      references,
      coverage: references.some((r) => r.quoteStatus === 'MISMATCH')
        ? ('INVALID_REFERENCE' as const)
        : conflicting
          ? ('CONFLICTING' as const)
          : document
            ? ('DOCUMENT_LINKED' as const)
            : references.length
              ? ('CONTEXT_ONLY' as const)
              : ('UNSUPPORTED' as const),
    };
  });
  if (
    !rows.length ||
    claims.some((c) => !rows.some((r) => r.claimId === c.id)) ||
    issues.some((i) => !rows.some((r) => r.issueIds.includes(i.id)))
  )
    limitations.add('EVIDENCE_MATRIX_INCOMPLETE');
  const chronology = input.chronology
    .map((event) => {
      checkClaims(event.claimIds);
      if (event.claimIds.some((id) => !claims.find((c) => c.id === id)!.sourceIds.includes(event.reference.sourceId)))
        throw new Error('EVIDENCE_REFERENCE_INVALID');
      const reference = ref(event.reference);
      const literal =
        reference.quoteStatus === 'MATCHED' &&
        event.dateText !== null &&
        reference.quote.includes(event.dateText) &&
        z.string().date().safeParse(event.dateText).success;
      if (!literal) limitations.add('EVIDENCE_DATE_UNCERTAIN');
      return {
        ...event,
        reference,
        sortDate: literal ? event.dateText : null,
        dateStatus: literal ? ('LITERAL_ISO' as const) : ('UNCERTAIN' as const),
      };
    })
    .sort((a, b) => (a.sortDate ?? '9999').localeCompare(b.sortDate ?? '9999'));
  for (const contradiction of input.contradictions) {
    checkClaims(contradiction.claimIds);
    limitations.add('EVIDENCE_CONFLICT_UNRESOLVED');
  }
  return {
    matrix: TaskEvidenceMatrixSchema.parse({
      assessment: 'MODEL_PROPOSAL_NOT_FACT_CONFIRMATION',
      rows,
      chronology,
      contradictions: input.contradictions,
    }),
    limitations: [...limitations],
  };
}
