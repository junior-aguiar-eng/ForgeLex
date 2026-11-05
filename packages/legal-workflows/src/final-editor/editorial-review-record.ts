import { createHash } from 'node:crypto';
import { z } from 'zod';
import { FinalEditorialProposalSchema } from '@forgelex/legal-agents';

export const editorialHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const editorialDigest = z.string().regex(/^[a-f0-9]{64}$/);
export const editorialReason = z.string().trim().min(3).max(1000);
export const editorialDecision = z.strictObject({
  itemId: z.string().min(1).max(200),
  action: z.enum(['ACCEPT', 'REJECT', 'DEFER']),
  reason: editorialReason,
});
const application = z.strictObject({
  commandId: z.string().uuid(),
  inputHash: editorialDigest,
  contextHash: editorialDigest,
  proposalHash: editorialDigest,
  reviewRevision: z.number().int().min(1).max(100),
  itemIds: z.array(z.string().min(1).max(200)).min(1).max(30),
  baseVersionId: z.string().min(1),
  versionId: z.string().min(1),
  versionNumber: z.number().int().positive(),
  contentHash: editorialDigest,
  appliedBy: z.string().min(1),
  appliedAt: z.string().datetime(),
  reason: editorialReason,
});
const event = z.strictObject({
  commandId: z.string().uuid(),
  inputHash: editorialDigest,
  contextHash: editorialDigest,
  proposalHash: editorialDigest,
  proposal: FinalEditorialProposalSchema,
  decision: editorialDecision,
  decidedBy: z.string().min(1),
  decidedAt: z.string().datetime(),
});
const recordSchema = z
  .strictObject({
    version: z.literal(1),
    revision: z.number().int().min(0).max(100),
    history: z.array(event).max(100),
    application: application.optional(),
  })
  .superRefine((record, ctx) => {
    const applied = record.application;
    if (
      record.revision !== record.history.length ||
      new Set(record.history.map((e) => e.commandId)).size !== record.history.length ||
      record.history.some((e) => editorialHash(e.proposal) !== e.proposalHash) ||
      (applied &&
        (record.history.length >= 100 ||
          applied.reviewRevision !== record.revision ||
          applied.versionId === applied.baseVersionId ||
          new Set(applied.itemIds).size !== applied.itemIds.length ||
          record.history.some((e) => e.commandId === applied.commandId) ||
          applied.itemIds.some((id) => {
            const latest = record.history
              .filter(
                (e) =>
                  e.proposalHash === applied.proposalHash &&
                  e.contextHash === applied.contextHash &&
                  e.decision.itemId === id,
              )
              .at(-1);
            return (
              !latest ||
              latest.decision.action !== 'ACCEPT' ||
              latest.proposal.versionId !== applied.baseVersionId ||
              !latest.proposal.changes.some((change) => change.id === id)
            );
          })))
    )
      ctx.addIssue({ code: 'custom', message: 'Histórico editorial inconsistente.' });
  });
export function readEditorialRecord(saved: string | null): z.infer<typeof recordSchema> {
  try {
    return saved ? recordSchema.parse(JSON.parse(saved)) : { version: 1, revision: 0, history: [] };
  } catch {
    throw new Error('EDITORIAL_REVIEW_INTEGRITY');
  }
}
export function historicalEditorialReview(record: z.infer<typeof recordSchema>) {
  return {
    context: null,
    contextHash: null,
    revision: record.revision,
    history: record.history,
    stale: true,
    ...(record.application ? { application: record.application } : {}),
  };
}
