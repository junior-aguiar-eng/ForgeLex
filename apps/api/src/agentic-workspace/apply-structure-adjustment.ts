import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  STRUCTURE_ITEMS_SOURCE_PREFIX,
  StructureCommandsSchema,
  resolveStructureCommands,
  structureItemsSource,
  type AgenticOwner,
  type AgenticTaskDelivery,
  type EvidenceReview,
  type EvidenceReviewCommand,
  type StructureAdjustmentRecord,
  type StructureQuestion,
} from '@forgelex/domain';
import { EVIDENCE_REVIEW_ADDED_LIMIT } from '@forgelex/persistence';
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
    preview(owner: AgenticOwner, id: string): Promise<EvidenceReview>;
    addUserItems(owner: AgenticOwner, id: string, items: { texto: string; frase: string }[]): Promise<EvidenceReview>;
    decide(owner: AgenticOwner, id: string, command: EvidenceReviewCommand): Promise<EvidenceReview>;
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
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

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
 * Applies the commands of a completed adjust_structure work to the case's current analysis. Server-side and
 * deterministic: ALTERAR/REMOVER become ADOPT/DISCARD of the existing review; ACRESCENTAR becomes a sealed item that
 * stays out of the case until an explicit ADOPT. Anything that cannot be applied safely becomes a question.
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
  const review = await deps.reviews.preview(owner, target);
  const prior = review.adjustments?.[commandId];
  if (prior) return { applied: prior.applied, questions: prior.questions };
  const record = async (applied: number, questions: StructureQuestion[]) => {
    const kept = await deps.reviews.recordStructureAdjustment(owner, target, commandId, {
      executionId,
      applied,
      questions,
      caseSummary: adjustment.caseSummary,
      recordedAt: new Date().toISOString(),
    });
    return { applied: kept.applied, questions: kept.questions };
  };

  // Empty list: the agent omitted every command (ambiguous references); only the summary is kept.
  if (!adjustment.commands.length) return record(0, []);
  const commands = StructureCommandsSchema.parse(adjustment.commands);

  // The analysis must be exactly the one the agent read: same delivery and same items/decisions (source hash).
  const decidedIds = new Set(Object.keys(review.decisions));
  const seen = delivery.sources.filter(
    (s) => s.kind === 'PREVIOUS_DELIVERY' && s.id.startsWith(STRUCTURE_ITEMS_SOURCE_PREFIX),
  );
  if (
    seen.length !== 1 ||
    seen[0]!.id !== `${STRUCTURE_ITEMS_SOURCE_PREFIX}${target}` ||
    seen[0]!.contentHash !== structureItemsSource(target, review.items, decidedIds).contentHash
  )
    return record(0, [{ reason: 'ANALISE_ALTERADA' }]);

  const resolution = resolveStructureCommands({ items: review.items, decidedIds, commands });
  const questions: StructureQuestion[] = [...resolution.questions];
  const byId = new Map(review.items.map((i) => [i.id, i]));

  // Decisions the review would refuse become questions instead of failing the whole work.
  const decisions = resolution.decisions.filter((decision) => {
    const item = byId.get(decision.itemId)!;
    const blocked =
      decision.action === 'ADOPT' &&
      (item.blockedReasons.length > 0 ||
        (item.kind === 'EVIDENCE' && !item.sources.length) ||
        (item.kind === 'TIMELINE' &&
          !z
            .string()
            .date()
            .safeParse(decision.eventDate ?? item.eventDate).success));
    if (blocked) questions.push({ itemId: item.id, reason: 'ITEM_BLOQUEADO' });
    return !blocked;
  });

  // ACRESCENTAR only with a phrase the user actually wrote in this request.
  const request = await requestText(deps, owner, delivery);
  let added = resolution.added.filter((a) => {
    const found = request !== undefined && normalize(request).includes(normalize(a.frase));
    if (!found) questions.push({ reason: 'FRASE_NAO_ENCONTRADA', texto: a.texto });
    return found;
  });
  const existing = new Set(review.items.filter((i) => i.userAdded).map((i) => i.text));
  const fresh = new Set(added.map((a) => a.texto).filter((t) => !existing.has(t)));
  if (existing.size + fresh.size > EVIDENCE_REVIEW_ADDED_LIMIT) {
    questions.push({ reason: 'LIMITE_DE_ITENS' });
    added = [];
  }

  let applied = 0;
  if (added.length) {
    const before = review.items.length;
    applied += (await deps.reviews.addUserItems(owner, target, added)).items.length - before;
  }
  if (decisions.length) {
    // Adding items changes revision and token: decide against the review as it is now.
    const now = added.length ? await deps.reviews.preview(owner, target) : review;
    await deps.reviews.decide(owner, target, {
      approved: true,
      commandId,
      expectedRevision: now.revision,
      reviewToken: now.reviewToken,
      decisions,
    });
    applied += decisions.length;
  }
  return record(applied, questions);
}
