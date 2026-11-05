import { expect, it } from 'vitest';
import { deriveEvidenceReviewItems } from './evidence-review-items.js';
it('keeps a documentary record as extracted content rather than treating it as supported fact', () => {
  const delivery: any = {
    action: 'analyze_evidence',
    issues: [{ id: 'i' }],
    claims: [{ id: 'c', classification: 'DOCUMENT_RECORD', statement: 'Registro literal.', sourceIds: [] }],
    sources: [],
    evidenceMatrix: {
      rows: [{ id: 'row', claimId: 'c', issueIds: ['i'], references: [], gaps: [], coverage: 'UNSUPPORTED' }],
      chronology: [],
      contradictions: [],
    },
  };
  expect(deriveEvidenceReviewItems('delivery', delivery, [])[0].classification).toBe('EXTRACTED');
});
