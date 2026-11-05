import { z } from 'zod';
import type { AgenticOwner } from '@forgelex/domain';
import type { NativeCaseTaskRepository } from '@forgelex/persistence';
import {
  FinalEditorialProposalSchema,
  validateFinalEditorialProposal,
  FINAL_EDITOR_GENERATION_PROFILE,
} from '@forgelex/legal-agents';
import { editorialContextFromSnapshot } from './final-editor-service.js';
import {
  editorialHash as hash,
  editorialDigest as digest,
  editorialDecision as decision,
  readEditorialRecord as readRecord,
  historicalEditorialReview,
} from './editorial-review-record.js';

export const EditorialReviewTargetSchema = z.strictObject({
  draftId: z.string().min(1).max(200),
  versionId: z.string().min(1).max(200),
});
export const EditorialReviewPreviewSchema = EditorialReviewTargetSchema.extend({
  proposal: FinalEditorialProposalSchema,
});
export const EditorialReviewCommandSchema = EditorialReviewPreviewSchema.extend({
  contextHash: digest,
  expectedRevision: z.number().int().min(0),
  commandId: z.string().uuid(),
  decision,
});

/** Human decisions are an append-only record; never an instruction to apply a patch. */
export class EditorialReviewService {
  constructor(private readonly native: Pick<NativeCaseTaskRepository, 'editorialReview' | 'readEditorialHistory'>) {}
  async history(owner: AgenticOwner, id: string, input: unknown) {
    const { commandId, ...target } = EditorialReviewTargetSchema.extend({
      commandId: z.string().uuid().optional(),
    }).parse(input);
    const current = async () => {
      try {
        return { ...(await this.review(owner, id, target, 'read')), stale: false };
      } catch (error) {
        if (
          !(error instanceof Error) ||
          ![
            'EDITORIAL_VERSION_CONFLICT',
            'CONTEXT_CONFLICT',
            'SOURCE_VERSION_CONFLICT',
            'APPROVED_CONTEXT_CHANGED',
            'EDITORIAL_SOURCE_UNAVAILABLE',
            'EDITORIAL_AUDIT_UNAVAILABLE',
          ].includes(error.message)
        )
          throw error;
        // Never turn an access failure into historical access. This operation reauthorizes
        // the owner, case and original sources under the existing historical read policy.
        const record = readRecord(await this.native.readEditorialHistory(owner, id, target));
        return historicalEditorialReview(record);
      }
    };
    const result = await current();
    return {
      ...result,
      ...(commandId
        ? {
            reconciliation: {
              commandId,
              status:
                result.history.some((e) => e.commandId === commandId) || result.application?.commandId === commandId
                  ? 'RECORDED'
                  : 'NOT_RECORDED',
            },
          }
        : {}),
    };
  }
  review(owner: AgenticOwner, id: string, input: unknown, mode: 'read' | 'preview' | 'decide') {
    const command = mode === 'decide' ? EditorialReviewCommandSchema.parse(input) : null;
    const preview = mode === 'preview' ? EditorialReviewPreviewSchema.parse(input) : command;
    const target =
      mode === 'read'
        ? EditorialReviewTargetSchema.parse(input)
        : { draftId: preview!.draftId, versionId: preview!.versionId };
    return this.native.editorialReview(owner, id, target, (snapshot, saved) => {
      const context = editorialContextFromSnapshot(snapshot),
        contextHash = hash(context);
      const record = readRecord(saved);
      if (record.application) throw new Error('EDITORIAL_VERSION_CONFLICT');
      const proposal = preview ? validateFinalEditorialProposal(context, preview.proposal) : undefined;
      if (
        proposal &&
        Buffer.byteLength(JSON.stringify(proposal), 'utf8') > FINAL_EDITOR_GENERATION_PROFILE.maxProposalBytes
      )
        throw new Error('EDITORIAL_REVIEW_LIMIT');
      let changed = false;
      if (command && proposal) {
        if (command.contextHash !== contextHash) throw new Error('EDITORIAL_CONTEXT_CHANGED');
        if (
          ![...proposal.changes, ...proposal.substantiveSuggestions].some((item) => item.id === command.decision.itemId)
        )
          throw new Error('EDITORIAL_REVIEW_CONFLICT');
        const inputHash = hash(command),
          previous = record.history.find((e) => e.commandId === command.commandId);
        if (previous) {
          if (previous.inputHash !== inputHash) throw new Error('EDITORIAL_REVIEW_CONFLICT');
        } else {
          if (command.expectedRevision !== record.revision) throw new Error('EDITORIAL_REVIEW_CONFLICT');
          const proposalHash = hash(proposal),
            proposals = new Set(record.history.map((e) => e.proposalHash));
          if (record.history.length >= 100 || (!proposals.has(proposalHash) && proposals.size >= 10))
            throw new Error('EDITORIAL_REVIEW_LIMIT');
          record.history.push({
            commandId: command.commandId,
            inputHash,
            contextHash,
            proposalHash,
            proposal,
            decision: command.decision,
            decidedBy: owner.userId,
            decidedAt: new Date().toISOString(),
          });
          record.revision++;
          changed = true;
        }
      }
      return {
        result: {
          stale: false,
          context,
          contextHash,
          revision: record.revision,
          history: record.history,
          ...(record.application ? { application: record.application } : {}),
          ...(mode === 'preview' ? { proposal } : {}),
        },
        ...(changed ? { record: JSON.stringify(record) } : {}),
      };
    });
  }
}
