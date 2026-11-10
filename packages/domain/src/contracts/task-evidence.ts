import { z } from 'zod';
import { MAX_SOURCE_TEXT_CHARS } from './agentic-limits.js';

const id = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(4000);
export const TaskEvidenceReferenceSchema = z.strictObject({
  sourceId: id,
  quote: z.string().min(1).max(4000),
  start: z.number().int().min(0).max(MAX_SOURCE_TEXT_CHARS),
  relation: z.enum(['SUPPORTS', 'CONTRADICTS', 'CONTEXT']),
});
const row = z.strictObject({
  id,
  claimId: id,
  issueIds: z.array(id).min(1).max(100),
  references: z.array(TaskEvidenceReferenceSchema).max(10),
  gaps: z.array(text).max(10),
});
const event = z.strictObject({
  id,
  claimIds: z.array(id).min(1).max(10),
  description: text,
  dateText: z.string().min(1).max(200).nullable(),
  reference: TaskEvidenceReferenceSchema,
});
const contradiction = z.strictObject({ id, claimIds: z.array(id).min(2).max(10), explanation: text });
export const TaskEvidenceAnalysisSchema = z.strictObject({
  rows: z.array(row).max(100),
  chronology: z.array(event).max(100),
  contradictions: z.array(contradiction).max(50),
});
export type TaskEvidenceAnalysis = z.infer<typeof TaskEvidenceAnalysisSchema>;
const auditedReference = TaskEvidenceReferenceSchema.extend({
  sourceContentHash: z.string().regex(/^[a-f0-9]{64}$/),
  quoteStatus: z.enum(['MATCHED', 'MISMATCH']),
});
/** Literal occurrence is independently checked; relationships remain model proposals. */
export const TaskEvidenceMatrixSchema = z.strictObject({
  assessment: z.literal('MODEL_PROPOSAL_NOT_FACT_CONFIRMATION'),
  rows: z
    .array(
      row.extend({
        references: z.array(auditedReference).max(10),
        coverage: z.enum(['DOCUMENT_LINKED', 'CONTEXT_ONLY', 'UNSUPPORTED', 'CONFLICTING', 'INVALID_REFERENCE']),
      }),
    )
    .max(100),
  chronology: z
    .array(
      event.extend({
        reference: auditedReference,
        sortDate: z.string().date().nullable(),
        dateStatus: z.enum(['LITERAL_ISO', 'UNCERTAIN']),
      }),
    )
    .max(100),
  contradictions: z.array(contradiction).max(50),
});
export type TaskEvidenceMatrix = z.infer<typeof TaskEvidenceMatrixSchema>;
