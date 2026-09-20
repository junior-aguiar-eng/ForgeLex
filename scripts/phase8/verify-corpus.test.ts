import { describe, expect, it } from 'vitest';
import { compareCorpusSnapshots, INVARIANT_QUERIES } from './verify-corpus.mjs';

const snapshot = {
  documents: 10, versions: 10, manifests: 2, rejected: 0,
  coverageStart: '2020-01-01', coverageEnd: '2026-09-20',
  manifestHashes: ['aaa', 'bbb'], terminalGapStates: ['complete'],
  duplicateDedupeKeys: 0, duplicateVersions: 0, missingCurrentVersions: 0, stagingRows: 0,
};

describe('phase8:verify-corpus', () => {
  it('fixa as quatro invariantes SQL', () => {
    expect(INVARIANT_QUERIES.duplicateDedupeKeys).toContain('GROUP BY dedupe_key HAVING COUNT(*) > 1');
    expect(INVARIANT_QUERIES.duplicateVersions).toContain('GROUP BY document_id, content_hash HAVING COUNT(*) > 1');
    expect(INVARIANT_QUERIES.missingCurrentVersions).toContain('current_version_id');
    expect(INVARIANT_QUERIES.stagingRows).toContain('jurisprudence_ingestion_staging');
  });

  it('aprova snapshots equivalentes e rejeita divergência ou violação', () => {
    expect(compareCorpusSnapshots(snapshot, { ...snapshot })).toEqual({ status: 'passed', ...snapshot });
    expect(() => compareCorpusSnapshots(snapshot, { ...snapshot, documents: 9 })).toThrow('CORPUS_COUNT_MISMATCH');
    expect(() => compareCorpusSnapshots(snapshot, { ...snapshot, stagingRows: 1 })).toThrow('CORPUS_INVARIANT_VIOLATION');
    expect(() => compareCorpusSnapshots(snapshot, { ...snapshot, manifestHashes: ['aaa'] })).toThrow('CORPUS_MANIFEST_HASH_MISMATCH');
  });
});
