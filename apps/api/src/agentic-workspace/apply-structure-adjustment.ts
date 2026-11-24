import { createHash } from 'node:crypto';
import {
  STRUCTURE_ITEMS_SOURCE_PREFIX,
  StructureCommandsSchema,
  resolveStructureCommands,
  structureItemsSource,
  type AgenticOwner,
  type EvidenceReview,
  type AgenticTaskDelivery,
  type StructureAdjustmentRecord,
  type StructureCommand,
  type StructureQuestion,
} from '@forgelex/domain';
import { findCaseStructure, type CaseStructureDeps, type CaseStructureExecution } from './case-structure.js';

export interface ApplyStructureAdjustmentDeps<
  E extends CaseStructureExecution = CaseStructureExecution,
> extends CaseStructureDeps<E> {
  store: CaseStructureDeps<E>['store'] & {
    workspace: CaseStructureDeps<E>['store']['workspace'] & {
      getConversation(
        owner: AgenticOwner,
        id: string,
      ): Promise<{ contexts: Array<{ revision: number; text: string }> } | undefined>;
    };
  };
  reviews: {
    preview(owner: AgenticOwner, id: string): Promise<EvidenceReview>;
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
/**
 * Name-based UUID (v5 layout over SHA-256) so every replay of the same work uses the same review command. With one
 * analysis in the case the id is the one of always; an older analysis of a several-analyses case gets its own.
 */
export function structureCommandId(executionId: string, deliveryId?: string): string {
  const seed = deliveryId ? `${executionId}:${deliveryId}` : executionId;
  const b = createHash('sha256').update(`forgelex:adjust_structure:${seed}`).digest().subarray(0, 16);
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
async function requestText<E extends CaseStructureExecution>(
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

const decidedIds = (review: EvidenceReview) => new Set(Object.keys(review.decisions));

/**
 * The key the structure source of a run carries: the delivery id with one analysis in the case (as always), the case
 * with several. Shared by the driver (that builds the source) and the apply (that checks the run read the same one).
 */
export const structureSourceKey = (matterId: string, deliveryIds: readonly string[]): string =>
  deliveryIds.length === 1 ? deliveryIds[0]! : `case:${matterId}`;

/**
 * Applies the commands of a completed adjust_structure work to the case's analyses (E4: all of them, E2: the current
 * one). Each command goes to the analysis that owns the item, ACRESCENTAR to the newest. The review repository does the
 * check, the additions, the decisions and the record in one transaction per analysis, idempotent per execution:
 * ALTERAR/REMOVER become ADOPT/DISCARD of existing items; ACRESCENTAR becomes a sealed item that stays out of the case
 * until an explicit ADOPT. Anything that cannot be applied safely becomes a question, never an error, and a failure in
 * one analysis does not undo the others.
 */
export async function applyStructureAdjustment<E extends CaseStructureExecution>(
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

  const entries = await findCaseStructure(deps, owner, matterId);
  const newest = entries.at(-1);
  if (!newest) return { applied: 0, questions: [{ reason: 'ANALISE_ALTERADA' }] };
  // One at a time: each preview is its own transaction, and a single-connection database cannot overlap them.
  const previews: { entry: (typeof entries)[number]; review: EvidenceReview }[] = [];
  for (const entry of entries) previews.push({ entry, review: await deps.reviews.preview(owner, entry.deliveryId) });
  const commandIdFor = (deliveryId: string) =>
    structureCommandId(executionId, deliveryId === newest.deliveryId ? undefined : deliveryId);
  const record = async (deliveryId: string, reason: StructureQuestion['reason']) => {
    const questions = [{ reason }];
    try {
      const r = await deps.reviews.recordStructureAdjustment(owner, deliveryId, commandIdFor(deliveryId), {
        executionId,
        applied: 0,
        questions,
        caseSummary: adjustment.caseSummary,
        recordedAt: new Date().toISOString(),
      });
      return { applied: r.applied, questions: r.questions };
    } catch (error) {
      if (error instanceof Error && error.message in AS_QUESTION) return { applied: 0, questions };
      throw error;
    }
  };

  // Empty list (handled before StructureCommandsSchema, which requires 1..20): only the summary is kept.
  const commands = adjustment.commands.length ? StructureCommandsSchema.parse(adjustment.commands) : [];
  // Each command goes to the analysis that owns the item; ACRESCENTAR to the newest.
  const ownerOf = new Map<string, string>();
  for (const { entry, review } of previews) for (const item of review.items) ownerOf.set(item.id, entry.deliveryId);
  const perDelivery = new Map<string, StructureCommand[]>();
  const questions: StructureQuestion[] = [];
  const send = (deliveryId: string, command: StructureCommand) =>
    perDelivery.set(deliveryId, [...(perDelivery.get(deliveryId) ?? []), command]);
  for (const command of commands) {
    if (command.op === 'ACRESCENTAR') send(newest.deliveryId, command);
    else {
      const target = ownerOf.get(command.itemId);
      if (target) send(target, command);
      else questions.push({ reason: 'ITEM_DESCONHECIDO', itemId: command.itemId });
    }
  }
  // Replay of a work already applied: every analysis it had to reach holds its record, so the outcome is the stored one
  // (the analyses changed since, which the hash check below would take for a stale read).
  const targets = previews.filter(
    ({ entry }) => entry.deliveryId === newest.deliveryId || (perDelivery.get(entry.deliveryId)?.length ?? 0) > 0,
  );
  const stored = targets.map(({ entry, review }) => review.adjustments?.[commandIdFor(entry.deliveryId)]);
  if (stored.every((record) => record !== undefined))
    return {
      applied: stored.reduce((sum, record) => sum + record!.applied, 0),
      questions: stored.flatMap((record) => record!.questions),
    };
  // The run must have read exactly these analyses as they are now: the source it saw carries their hash.
  let expectedHash: string | undefined;
  try {
    const key = structureSourceKey(
      matterId,
      entries.map((entry) => entry.deliveryId),
    );
    const source = structureItemsSource(
      key,
      previews.flatMap(({ review }) => review.items),
      new Set(previews.flatMap(({ review }) => [...decidedIds(review)])),
    );
    const seen = delivery.sources.filter(
      (s) => s.kind === 'PREVIOUS_DELIVERY' && s.id.startsWith(STRUCTURE_ITEMS_SOURCE_PREFIX),
    );
    if (seen.length === 1 && seen[0]!.id === source.id && seen[0]!.contentHash === source.contentHash)
      expectedHash = source.contentHash;
  } catch {
    expectedHash = undefined;
  }
  if (commands.length && !expectedHash) return record(newest.deliveryId, 'ANALISE_ALTERADA');

  const request = await requestText(deps, owner, delivery);
  let applied = 0;
  // Oldest first; the newest always runs (it keeps the summary even without commands).
  for (const { entry, review } of previews) {
    const own = perDelivery.get(entry.deliveryId) ?? [];
    if (!own.length && entry.deliveryId !== newest.deliveryId) continue;
    const sourceHash = structureItemsSource(entry.deliveryId, review.items, decidedIds(review)).contentHash;
    try {
      const r = await deps.reviews.applyStructureCommands(owner, entry.deliveryId, {
        commandId: commandIdFor(entry.deliveryId),
        executionId,
        sourceHash,
        commands: own,
        caseSummary: adjustment.caseSummary,
        ...(request !== undefined ? { request } : {}),
      });
      applied += r.applied;
      questions.push(...r.questions);
    } catch (error) {
      // The transaction of this analysis rolled back: nothing was applied there.
      const reason = error instanceof Error ? AS_QUESTION[error.message] : undefined;
      if (!reason) throw error;
      const outcome = await record(entry.deliveryId, reason);
      applied += outcome.applied;
      questions.push(...outcome.questions);
    }
  }
  return { applied, questions };
}
