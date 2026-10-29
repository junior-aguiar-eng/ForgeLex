import {
  LegislationRequestSchema,
  LegislationIntegrityError,
  LegislationSnapshotSchema,
  validateLegislationSnapshot,
  type LegislationRequest,
  type LegislationResult,
  type LegislationCoverage,
  type LegislationReadPort,
  type LegislationWritePort,
} from '../contracts/legislation-document.js';

/** Server-internal snapshot retrieval. No model knowledge or live-law/applicability claim. */
export class LegislationService {
  constructor(
    private readonly repository: LegislationReadPort,
    private readonly coverage: (normId: string, provisionId: string) => LegislationCoverage | undefined,
  ) {}
  async ingest(input: unknown): Promise<void> {
    const parsed = LegislationSnapshotSchema.parse(input),
      d = parsed.document;
    const coverage = this.coverage(d.normId, d.provisionId);
    if (!coverage) throw new Error('LEGISLATION_OUT_OF_COVERAGE');
    const record = validateLegislationSnapshot(parsed, coverage, d.provisionId);
    const writer = this.repository as LegislationWritePort;
    if (!writer.append) throw new Error('LEGISLATION_READ_ONLY');
    await writer.append(record);
  }
  async retrieve(raw: LegislationRequest): Promise<LegislationResult> {
    const request = LegislationRequestSchema.parse(raw);
    const limits = { legalApplicability: 'NOT_EVALUATED' as const, freshness: 'SNAPSHOT_ONLY' as const };
    const limited = (reason: Extract<LegislationResult, { status: 'LIMITED' }>['reason']): LegislationResult => ({
      status: 'LIMITED',
      ...limits,
      reason,
    });
    const coverage = this.coverage(request.normId, request.provisionId);
    if (!coverage) return limited('OUT_OF_COVERAGE');
    let records;
    try {
      records = await this.repository.listVersions(request.normId, request.provisionId);
    } catch (error) {
      return limited(error instanceof LegislationIntegrityError ? 'SOURCE_INVALID' : 'SOURCE_UNAVAILABLE');
    }
    let valid;
    try {
      valid = records.map((r) => validateLegislationSnapshot(r, coverage, request.provisionId).document);
    } catch {
      return limited('SOURCE_INVALID');
    }
    const selector = request.selector;
    const matches = valid.filter((d) =>
      selector.kind === 'EXACT'
        ? d.versionId === selector.versionId
        : selector.kind === 'CURRENT'
          ? d.versionId === coverage.currentVersionId
          : d.effectiveFrom <= selector.date && (!d.effectiveTo || selector.date < d.effectiveTo),
    );
    if (!matches.length) return limited('VERSION_UNAVAILABLE');
    if (matches.length !== 1) return limited('AMBIGUOUS_VERSION');
    return {
      status: 'FOUND',
      ...limits,
      temporalBasis:
        selector.kind === 'EXACT'
          ? 'EXACT_VERSION'
          : selector.kind === 'CURRENT'
            ? 'CATALOG_CURRENT'
            : 'RECORDED_PERIOD',
      document: matches[0]!,
    };
  }
}
