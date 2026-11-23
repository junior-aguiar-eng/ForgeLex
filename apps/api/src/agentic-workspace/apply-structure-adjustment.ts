import { createHash } from 'node:crypto';
import {
  STRUCTURE_ITEMS_SOURCE_PREFIX,
  StructureCommandsSchema,
  resolveStructureCommands,
  type AgenticOwner,
  type AgenticTaskDelivery,
  type StructureAdjustmentRecord,
  type StructureCommand,
  type StructureQuestion,
} from '@forgelex/domain';
import {
  findCurrentStructure,
  type CurrentStructureDeps,
  type CurrentStructureExecution,
} from './current-structure.js';

export interface ApplyStructureAdjustmentDeps<
  E extends CurrentStructureExecution = CurrentStructureExecution,
> extends CurrentStructureDeps<E> {
  store: CurrentStructureDeps<E>['store'] & {
    workspace: CurrentStructureDeps<E>['store']['workspace'] & {
      getConversation(
        owner: AgenticOwner,
        id: string,
      ): Promise<{ contexts: Array<{ revision: number; text: string }> } | undefined>;
    };
  };
  reviews: {
    applyStructureCommands(
      owner: AgenticOwner,
      id: string,
      input: {
        commandId: string;
        executionId: string;
        sourceHash: string;
        commands: StructureCommand[];
        caseSummary: string;
        request?: string;
      },
    ): Promise<StructureAdjustmentRecord>;
    recordStructureAdjustment(
      owner: AgenticOwner,
      id: string,
      commandId: string,
      record: StructureAdjustmentRecord,
    ): Promise<StructureAdjustmentRecord>;
  };
}

export interface StructureAdjustmentOutcome {
  applied: number;
  questions: ReturnType<typeof resolveStructureCommands>['questions'];
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
/** Name-based UUID (v5 layout over SHA-256) so every replay of the same work uses the same review command. */
export function structureCommandId(executionId: string): string {
  const b = createHash('sha256').update(`forgelex:adjust_structure:${executionId}`).digest().subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Refusals of the review that mean "the analysis is not as the agent saw it" or "a limit was reached". */
const AS_QUESTION: Record<string, StructureQuestion['reason']> = {
  CONTEXT_CONFLICT: 'ANALISE_ALTERADA',
  EVIDENCE_REVIEW_CONFLICT: 'ANALISE_ALTERADA',
  EVIDENCE_ALREADY_DECIDED: 'ANALISE_ALTERADA',
  EVIDENCE_ITEM_INVALID: 'ANALISE_ALTERADA',
  EVIDENCE_SOURCE_UNAVAILABLE: 'ANALISE_ALTERADA',
  EVIDENCE_DATE_REQUIRED: 'ANALISE_ALTERADA',
  EVIDENCE_DATE_INVALID: 'ANALISE_ALTERADA',
  EVIDENCE_REVIEW_LIMIT: 'LIMITE_DE_ITENS',
  EVIDENCE_ADDED_LIMIT: 'LIMITE_DE_ITENS',
};

/** The user's request of the run (its USER_TEXT source), only when it still matches the hash the run used. */
async function requestText<E extends CurrentStructureExecution>(
  deps: ApplyStructureAdjustmentDeps<E>,
  owner: AgenticOwner,
  delivery: AgenticTaskDelivery,
): Promise<string | undefined> {
  const source = delivery.sources.find((s) => s.kind === 'USER_TEXT');
  if (!source) return undefined;
  const conversation = await deps.store.workspace.getConversation(owner, delivery.contextId);
  const text = conversation?.contexts.find((c) => c.revision === delivery.contextRevision)?.text;
  return text !== undefined && sha256(text) === source.contentHash ? text : undefined;
}

/**
 * Applies the commands of a completed adjust_structure work to the case's current analysis. The review repository
 * does the check, the additions, the decisions and the record in one transaction, idempotent per execution:
 * ALTERAR/REMOVER become ADOPT/DISCARD of existing items; ACRESCENTAR becomes a sealed item that stays out of the case
 * until an explicit ADOPT. Anything that cannot be applied safely becomes a question, never an error.
 */
export async function applyStructureAdjustment<E extends CurrentStructureExecution>(
  deps: ApplyStructureAdjustmentDeps<E>,
  owner: AgenticOwner,
  matterId: string,
  saved: { id: string; delivery: AgenticTaskDelivery },
): Promise<StructureAdjustmentOutcome> {
  const { delivery } = saved;
  const adjustment = delivery.structureAdjustment;
  if (delivery.action !== 'adjust_structure' || !adjustment || !saved.id.startsWith('delivery:'))
    throw new Error('STRUCTURE_ADJUSTMENT_INVALID');
  const executionId = saved.id.slice('delivery:'.length);
  const commandId = structureCommandId(executionId);

  const current = await findCurrentStructure(deps, owner, matterId);
  if (!current) return { applied: 0, questions: [{ reason: 'ANALISE_ALTERADA' }] };
  const target = current.deliveryId;
  const outcome = (r: StructureAdjustmentRecord) => ({ applied: r.applied, questions: r.questions });
  const asQuestion = async (reason: StructureQuestion['reason']) => {
    const questions = [{ reason }];
    try {
      return outcome(
        await deps.reviews.recordStructureAdjustment(owner, target, commandId, {
          executionId,
          applied: 0,
          questions,
          caseSummary: adjustment.caseSummary,
          recordedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message in AS_QUESTION) return { applied: 0, questions };
      throw error;
    }
  };

  // Empty list (handled before StructureCommandsSchema, which requires 1..20): only the summary is kept.
  const commands = adjustment.commands.length ? StructureCommandsSchema.parse(adjustment.commands) : [];
  // The run must have read exactly this analysis; the repository also checks the items/decisions hash.
  const seen = delivery.sources.filter(
    (s) => s.kind === 'PREVIOUS_DELIVERY' && s.id.startsWith(STRUCTURE_ITEMS_SOURCE_PREFIX),
  );
  const sourceHash =
    seen.length === 1 && seen[0]!.id === `${STRUCTURE_ITEMS_SOURCE_PREFIX}${target}` ? seen[0]!.contentHash : undefined;
  if (commands.length && !sourceHash) return asQuestion('ANALISE_ALTERADA');
  const request = await requestText(deps, owner, delivery);
  try {
    return outcome(
      await deps.reviews.applyStructureCommands(owner, target, {
        commandId,
        executionId,
        sourceHash: sourceHash ?? '',
        commands,
        caseSummary: adjustment.caseSummary,
        ...(request !== undefined ? { request } : {}),
      }),
    );
  } catch (error) {
    // The transaction rolled back: nothing was applied.
    const reason = error instanceof Error ? AS_QUESTION[error.message] : undefined;
    if (reason) return asQuestion(reason);
    throw error;
  }
}
