import { z } from 'zod';
import { StoredTaskDocumentSchema, TaskDocumentSchema, type AgenticOwner } from '@forgelex/domain';
import type { NativeCaseTaskRepository } from '@forgelex/persistence';
import { validateFinalEditorialProposal, FINAL_EDITOR_GENERATION_PROFILE } from '@forgelex/legal-agents';
import { EditorialReviewTargetSchema } from './editorial-review-service.js';
import { editorialContextFromSnapshot } from './final-editor-service.js';
import {
  editorialHash as hash,
  editorialDigest,
  editorialReason,
  readEditorialRecord,
  historicalEditorialReview,
} from './editorial-review-record.js';

export const EditorialApplicationCommandSchema = EditorialReviewTargetSchema.extend({
  commandId: z.string().uuid(),
  proposalHash: editorialDigest,
  contextHash: editorialDigest,
  expectedRevision: z.number().int().min(0).max(100),
  itemIds: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(30)
    .refine((ids) => new Set(ids).size === ids.length),
  reason: editorialReason,
  confirmed: z.literal(true),
});

export class EditorialApplicationService {
  constructor(private readonly native: Pick<NativeCaseTaskRepository, 'applyEditorialChanges'>) {}
  apply(owner: AgenticOwner, id: string, input: unknown) {
    const command = EditorialApplicationCommandSchema.parse(input);
    const inputHash = hash(command);
    return this.native.applyEditorialChanges(
      owner,
      id,
      command,
      (snapshot, saved) => {
        const record = readEditorialRecord(saved);
        if (record.application) throw new Error('EDITORIAL_VERSION_CONFLICT');
        if (record.history.length >= 100) throw new Error('EDITORIAL_REVIEW_LIMIT');
        const context = editorialContextFromSnapshot(snapshot);
        if (command.contextHash !== hash(context)) throw new Error('EDITORIAL_CONTEXT_CHANGED');
        if (
          record.revision !== command.expectedRevision ||
          record.history.some((e) => e.commandId === command.commandId)
        )
          throw new Error('EDITORIAL_REVIEW_CONFLICT');
        const savedProposal = record.history.find(
          (e) => e.proposalHash === command.proposalHash && e.contextHash === command.contextHash,
        )?.proposal;
        if (!savedProposal) throw new Error('EDITORIAL_REVIEW_CONFLICT');
        const proposal = validateFinalEditorialProposal(context, savedProposal);
        if (Buffer.byteLength(JSON.stringify(proposal), 'utf8') > FINAL_EDITOR_GENERATION_PROFILE.maxProposalBytes)
          throw new Error('EDITORIAL_REVIEW_LIMIT');
        const changes = command.itemIds.map((itemId) => {
          const latest = record.history
            .filter(
              (e) =>
                e.proposalHash === command.proposalHash &&
                e.contextHash === command.contextHash &&
                e.decision.itemId === itemId,
            )
            .at(-1);
          const change = proposal.changes.find((item) => item.id === itemId);
          if (!change || latest?.decision.action !== 'ACCEPT') throw new Error('EDITORIAL_REVIEW_CONFLICT');
          return change;
        });
        const document = structuredClone(context.document);
        for (const change of changes.sort((a, b) => b.sectionIndex - a.sectionIndex || b.start - a.start)) {
          const section = document.sections[change.sectionIndex];
          section.content = section.content.slice(0, change.start) + change.after + section.content.slice(change.end);
        }
        // Validation must not silently trim accepted replacements at section boundaries.
        const parsed = (context.origin === 'SCOPED_DELIVERY' ? StoredTaskDocumentSchema : TaskDocumentSchema).parse(
          document,
        );
        if (JSON.stringify(parsed) !== JSON.stringify(document)) throw new Error('EDITORIAL_REVIEW_CONFLICT');
        return {
          document,
          complete: (version: { id: string; versionNumber: number; contentHash: string }) => {
            record.application = {
              commandId: command.commandId,
              inputHash,
              proposalHash: command.proposalHash,
              contextHash: command.contextHash,
              reviewRevision: record.revision,
              itemIds: command.itemIds,
              baseVersionId: command.versionId,
              versionId: version.id,
              versionNumber: version.versionNumber,
              contentHash: version.contentHash,
              appliedBy: owner.userId,
              appliedAt: new Date().toISOString(),
              reason: command.reason,
            };
            return { result: historicalEditorialReview(record), record: JSON.stringify(record) };
          },
        };
      },
      (saved) => {
        const record = readEditorialRecord(saved);
        if (!record.application) return undefined;
        if (record.application.commandId !== command.commandId || record.application.inputHash !== inputHash)
          throw new Error('EDITORIAL_REVIEW_CONFLICT');
        return historicalEditorialReview(record);
      },
    );
  }
}
