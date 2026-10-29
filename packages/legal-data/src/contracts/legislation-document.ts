import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().trim().min(1).max(200);
export const legislationDate = z.iso.date();
export const LegislationRequestSchema = z.strictObject({
  normId: id,
  provisionId: id,
  selector: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('EXACT'), versionId: id }),
    z.strictObject({ kind: z.literal('CURRENT') }),
    z.strictObject({ kind: z.literal('ON_DATE'), date: legislationDate }),
  ]),
});
export const LegislationDocumentSchema = z
  .strictObject({
    sourceId: id,
    normId: id,
    provisionId: id,
    versionId: id,
    text: z.string().min(1).max(100000),
    officialUrl: z.url(),
    capturedAt: z.iso.datetime({ offset: true }),
    effectiveFrom: legislationDate,
    effectiveTo: legislationDate.nullable(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    curationEvidence: id,
  })
  .refine((v) => v.end > v.start && (!v.effectiveTo || v.effectiveTo > v.effectiveFrom), 'INVALID_LEGISLATION_RANGE');
export const LegislationSnapshotSchema = z.strictObject({
  document: LegislationDocumentSchema,
  snapshotText: z.string().min(1).max(2000000),
});
export type LegislationRequest = z.infer<typeof LegislationRequestSchema>;
export type LegislationDocument = z.infer<typeof LegislationDocumentSchema>;
export type LegislationSnapshot = z.infer<typeof LegislationSnapshotSchema>;
export class LegislationIntegrityError extends Error {
  constructor(options?: ErrorOptions) {
    super('LEGISLATION_SOURCE_INVALID', options);
    this.name = 'LegislationIntegrityError';
  }
}
export interface LegislationCoverage {
  sourceId: string;
  normId: string;
  officialUrl: string;
  currentVersionId: string;
}
export interface LegislationReadPort {
  listVersions(normId: string, provisionId: string): Promise<LegislationSnapshot[]>;
}
export interface LegislationWritePort extends LegislationReadPort {
  append(input: LegislationSnapshot): Promise<void>;
}
export const legislationHash = (text: string) => createHash('sha256').update(text).digest('hex');
export function validateLegislationSnapshot(
  raw: unknown,
  coverage: LegislationCoverage,
  provisionId: string,
): LegislationSnapshot {
  const record = LegislationSnapshotSchema.parse(raw),
    d = record.document;
  const url = new URL(d.officialUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !['www.planalto.gov.br', 'planalto.gov.br'].includes(url.hostname) ||
    d.officialUrl !== coverage.officialUrl ||
    d.sourceId !== coverage.sourceId ||
    d.normId !== coverage.normId ||
    d.provisionId !== provisionId ||
    legislationHash(d.text) !== d.contentHash ||
    legislationHash(record.snapshotText) !== d.snapshotHash ||
    d.end > record.snapshotText.length ||
    record.snapshotText.slice(d.start, d.end) !== d.text
  )
    throw new Error('LEGISLATION_SOURCE_INVALID');
  return record;
}
const limits = { legalApplicability: z.literal('NOT_EVALUATED'), freshness: z.literal('SNAPSHOT_ONLY') };
export const LegislationResultSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('FOUND'),
    ...limits,
    temporalBasis: z.enum(['EXACT_VERSION', 'CATALOG_CURRENT', 'RECORDED_PERIOD']),
    document: LegislationDocumentSchema,
  }),
  z.strictObject({
    status: z.literal('LIMITED'),
    ...limits,
    reason: z.enum([
      'OUT_OF_COVERAGE',
      'VERSION_UNAVAILABLE',
      'SOURCE_UNAVAILABLE',
      'SOURCE_INVALID',
      'AMBIGUOUS_VERSION',
    ]),
  }),
]);
export type LegislationResult = z.infer<typeof LegislationResultSchema>;
