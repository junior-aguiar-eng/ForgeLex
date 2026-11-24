import { savedReviewSchema } from './evidence-review-record.js';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AgenticTaskDeliverySchema,
  EvidenceReviewCommandSchema,
  type AgenticOwner,
  type EvidenceReview,
  type EvidenceReviewCommand,
  type EvidenceReviewDecision,
  type EvidenceReviewItem,
  type StructureAdjustmentRecord,
  type StructureCommand,
  type StructureQuestion,
  resolveStructureCommands,
  structureItemsSource,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import type { AuthorizeNativeTask } from './native-case-task-repository.js';
import { AgenticWorkspaceRepository } from './agentic-workspace-repository.js';
import { MatterRepository } from './matter-repository.js';
import { withMatterWrite, MatterWriteGuard } from './matter-write-guard.js';
import { lockAgenticTenant } from './agentic-tenant-guard.js';
import { adoptAnalysisItem } from './adopt-analysis-item.js';
import { deriveEvidenceReviewItems, evidenceHash, type ReviewSource } from './evidence-review-items.js';

interface SavedReview {
  version: 1;
  revision: number;
  decisions: Record<string, EvidenceReviewDecision>;
  added?: EvidenceReviewItem[];
  commands: Record<string, { inputHash: string }>;
  adjustments?: Record<string, StructureAdjustmentRecord>;
}
/** Cap of items the user may add to one review (also the schema limit of the saved review). */
export const EVIDENCE_REVIEW_ADDED_LIMIT = 50;
/**
 * Outcome records kept per review: the tab reads only the latest, and each record can be large (summary and up to 100
 * questions), so few are kept to spare the review's 1 MB budget. Idempotency does not depend on them: every adjustment
 * command id also stays in `commands`, which is never evicted.
 */
const ADJUSTMENT_RECORDS_KEPT = 10;
/** One dedupe rule for items the user adds: the id is the hash of (delivery, 'user', text). */
function freshUserItems(
  id: string,
  items: readonly EvidenceReviewItem[],
  input: { texto: string; frase: string }[],
): EvidenceReviewItem[] {
  const addedAt = new Date().toISOString();
  const fresh: EvidenceReviewItem[] = [];
  for (const { texto, frase } of input) {
    const itemId = evidenceHash([id, 'user', texto]);
    if (items.some((i) => i.id === itemId) || fresh.some((i) => i.id === itemId)) continue;
    fresh.push({
      id: itemId,
      kind: 'FACT',
      text: texto,
      classification: 'ALLEGATION',
      sources: [],
      references: [],
      originIds: [],
      blockedReasons: [],
      userAdded: { frase, addedAt },
    });
  }
  return fresh;
}
function keepAdjustment(saved: SavedReview, commandId: string, record: StructureAdjustmentRecord, inputHash: string) {
  const kept = Object.entries(saved.adjustments ?? {})
    .sort(([, a], [, b]) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, ADJUSTMENT_RECORDS_KEPT - 1);
  saved.adjustments = { ...Object.fromEntries(kept), [commandId]: record };
  saved.commands[commandId] = { inputHash };
}
/**
 * First write wins per adjustment command: the stored record, or, once it left the recent records, an empty outcome
 * (the command was already handled; replaying it must neither apply nor record anything again).
 */
function handledAdjustment(
  saved: SavedReview,
  commandId: string,
  executionId: string,
): StructureAdjustmentRecord | undefined {
  const existing = saved.adjustments?.[commandId];
  if (existing) return existing;
  if (saved.commands[commandId])
    return { executionId, applied: 0, questions: [], recordedAt: new Date().toISOString() };
  return undefined;
}
async function writeReview(db: ForgeLexDatabase, owner: AgenticOwner, rowId: string, saved: SavedReview) {
  // Every writer goes through the same schema the reader uses: an invalid review is refused, never stored.
  savedReviewSchema.parse(saved);
  const evidenceReviewJson = JSON.stringify(saved);
  if (Buffer.byteLength(evidenceReviewJson) > 1000000) throw new Error('EVIDENCE_REVIEW_LIMIT');
  await db
    .update(s.agenticTaskDeliveries)
    .set({ evidenceReviewJson })
    .where(
      and(
        eq(s.agenticTaskDeliveries.id, rowId),
        eq(s.agenticTaskDeliveries.tenantId, owner.tenantId),
        eq(s.agenticTaskDeliveries.userId, owner.userId),
      ),
    );
}

const emptyReview = (): SavedReview => ({ version: 1, revision: 1, decisions: {}, commands: {} });
const addedItem = z.strictObject({
  texto: z.string().trim().min(3).max(4000),
  frase: z.string().trim().min(1).max(4000),
});
const approvedText = z.string().trim().min(3).max(4000);

/** Human-session entrypoint only; never registered as an agent tool. */
export class NativeEvidenceReviewRepository {
  constructor(
    private readonly db: ForgeLexDatabase,
    private readonly authorize: AuthorizeNativeTask,
  ) {
    if (typeof authorize !== 'function') throw new Error('NATIVE_AUTHORIZATION_REQUIRED');
  }
  private async row(db: ForgeLexDatabase, owner: AgenticOwner, id: string) {
    const [row] = await db
      .select()
      .from(s.agenticTaskDeliveries)
      .where(
        and(
          eq(s.agenticTaskDeliveries.id, id),
          eq(s.agenticTaskDeliveries.tenantId, owner.tenantId),
          eq(s.agenticTaskDeliveries.userId, owner.userId),
        ),
      )
      .limit(1);
    if (!row) throw new Error('DELIVERY_NOT_FOUND');
    return row;
  }
  private async guarded<T>(
    owner: AgenticOwner,
    id: string,
    action: (
      db: ForgeLexDatabase,
      row: typeof s.agenticTaskDeliveries.$inferSelect,
      review: EvidenceReview,
      saved: SavedReview,
      token: (revision: number, list?: EvidenceReviewItem[]) => string,
    ) => Promise<T>,
  ): Promise<T> {
    const initial = await this.row(this.db, owner, id);
    await this.authorize(owner, undefined, this.db);
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as ForgeLexDatabase;
      await lockAgenticTenant(db, owner.tenantId);
      await db
        .update(s.agenticConversations)
        .set({ contextRevision: sql`${s.agenticConversations.contextRevision}` })
        .where(
          and(
            eq(s.agenticConversations.id, initial.conversationId),
            eq(s.agenticConversations.tenantId, owner.tenantId),
            eq(s.agenticConversations.userId, owner.userId),
          ),
        );
      const workspace = new AgenticWorkspaceRepository(db);
      const conversation = await workspace.getConversation(owner, initial.conversationId);
      const execution = await workspace.getExecution(owner, initial.executionId);
      if (
        !conversation?.matterId ||
        !execution ||
        execution.status !== 'COMPLETED' ||
        execution.requiresReevaluation ||
        execution.conversationId !== conversation.id ||
        execution.matterId !== conversation.matterId ||
        execution.contextRevision !== initial.contextRevision ||
        conversation.contextRevision !== initial.contextRevision ||
        !execution.deliveryIds.includes(id)
      )
        throw new Error('CONTEXT_CONFLICT');
      const matterId = conversation.matterId;
      await this.authorize(owner, matterId, db);
      return withMatterWrite(db, { tenantId: owner.tenantId, matterId }, async (tx) => {
        const row = await this.row(tx, owner, id);
        let delivery;
        try {
          delivery = AgenticTaskDeliverySchema.parse(JSON.parse(row.payloadJson));
          if (
            row.id !== `delivery:${row.executionId}` ||
            evidenceHash(row.payloadJson) !== row.contentHash ||
            delivery.contextId !== conversation.id ||
            delivery.contextRevision !== row.contextRevision
          )
            throw new Error();
        } catch {
          throw new Error('DELIVERY_INTEGRITY_FAILED');
        }
        const context = conversation.contexts.find((c) => c.revision === row.contextRevision);
        if (!context) throw new Error('CONTEXT_CONFLICT');
        const sources: ReviewSource[] = [];
        for (const source of [...delivery.sources].sort((a, b) =>
          (a.documentId ?? a.id).localeCompare(b.documentId ?? b.id),
        )) {
          if (sources.some((s) => s.id === source.id)) throw new Error('DELIVERY_INTEGRITY_FAILED');
          if (source.kind === 'DOCUMENT' && source.documentId && source.versionId) {
            await tx
              .update(s.legalDocuments)
              .set({ updatedAt: sql`${s.legalDocuments.updatedAt}` })
              .where(
                and(
                  eq(s.legalDocuments.id, source.documentId),
                  eq(s.legalDocuments.tenantId, owner.tenantId),
                  eq(s.legalDocuments.matterId, matterId),
                ),
              );
            const current = await new MatterRepository(tx).getDocumentVersion(
              owner.tenantId,
              source.documentId,
              'work',
            );
            const selected = context.documents.some(
              (d) => d.documentId === source.documentId && d.versionId === source.versionId,
            );
            const valid =
              selected &&
              current?.document.matterId === matterId &&
              current.document.lifecycleState === 'ACTIVE' &&
              current.version.id === source.versionId &&
              current.version.contentHash === source.contentHash &&
              evidenceHash(current.version.content) === source.contentHash &&
              source.id === source.versionId;
            sources.push({
              id: source.id,
              documentId: source.documentId,
              versionId: source.versionId,
              ...(valid
                ? { text: current!.version.content, anchors: current!.anchors }
                : { blocked: 'DOCUMENT_UNAVAILABLE' }),
              fingerprint:
                current?.document.matterId === matterId
                  ? [
                      current.document.lifecycleRevision,
                      current.version.id,
                      evidenceHash(current.version.content),
                      current.anchors,
                    ]
                  : null,
            });
          } else if (source.kind === 'USER_TEXT' || source.kind === 'ANSWER') {
            const text =
              source.kind === 'USER_TEXT'
                ? context.text
                : (context.answers ?? [])
                    .map((a) => JSON.stringify(a))
                    .find((a) => `answer:${evidenceHash(a)}` === source.id);
            const valid =
              text !== undefined &&
              evidenceHash(text) === source.contentHash &&
              source.id === `${source.kind === 'USER_TEXT' ? 'user' : 'answer'}:${source.contentHash}`;
            sources.push({
              id: source.id,
              ...(valid ? { text } : { blocked: 'CONTEXT_SOURCE_UNAVAILABLE' }),
              fingerprint: valid ? source.contentHash : null,
            });
          } else sources.push({ id: source.id, blocked: 'SOURCE_KIND_UNSUPPORTED', fingerprint: source.contentHash });
        }
        let saved: SavedReview;
        try {
          if (row.evidenceReviewJson && Buffer.byteLength(row.evidenceReviewJson) > 1000000) throw new Error();
          saved =
            row.evidenceReviewJson === null
              ? emptyReview()
              : savedReviewSchema.parse(JSON.parse(row.evidenceReviewJson));
        } catch {
          throw new Error('DELIVERY_INTEGRITY_FAILED');
        }
        const items = [...deriveEvidenceReviewItems(id, delivery, sources), ...(saved.added ?? [])];
        const lifecycleRevision = await new MatterWriteGuard(tx).captureRevision({
          tenantId: owner.tenantId,
          matterId,
        });
        const token = (revision: number, list: EvidenceReviewItem[] = items) =>
          evidenceHash([
            row.contentHash,
            revision,
            context,
            lifecycleRevision,
            sources.map((source) => [source.id, source.blocked, source.fingerprint]),
            list,
          ]);
        const review: EvidenceReview = {
          deliveryId: id,
          matterId,
          revision: saved.revision,
          items,
          decisions: saved.decisions,
          ...(saved.adjustments ? { adjustments: saved.adjustments } : {}),
          reviewToken: token(saved.revision),
        };
        await this.authorize(owner, matterId, tx);
        const result = await action(tx, row, review, saved, token);
        await this.authorize(owner, matterId, tx);
        return result;
      });
    });
  }
  async preview(owner: AgenticOwner, id: string): Promise<EvidenceReview> {
    return this.guarded(owner, id, async (_db, _row, review) => review);
  }
  /** Acrescenta itens que o usuário informou na conversa. Ficam só na revisão, com selo, até um ADOPT explícito. */
  async addUserItems(
    owner: AgenticOwner,
    id: string,
    raw: { texto: string; frase: string }[],
  ): Promise<EvidenceReview> {
    const input = z.array(addedItem).min(1).max(50).parse(raw);
    return this.guarded(owner, id, async (db, row, review, saved, token) => {
      const fresh = freshUserItems(id, review.items, input);
      if (!fresh.length) return review;
      if ((saved.added?.length ?? 0) + fresh.length > EVIDENCE_REVIEW_ADDED_LIMIT)
        throw new Error('EVIDENCE_ADDED_LIMIT');
      saved.added = [...(saved.added ?? []), ...fresh];
      saved.revision++;
      await writeReview(db, owner, row.id, saved);
      const items = [...review.items, ...fresh];
      return { ...review, items, revision: saved.revision, reviewToken: token(saved.revision, items) };
    });
  }
  /**
   * Keeps the outcome of an adjust_structure work with this review (first write wins, so a replay returns the stored
   * outcome). It changes neither items nor decisions, so revision and token stay.
   */
  async recordStructureAdjustment(
    owner: AgenticOwner,
    id: string,
    commandId: string,
    record: StructureAdjustmentRecord,
  ): Promise<StructureAdjustmentRecord> {
    z.string().uuid().parse(commandId);
    return this.guarded(owner, id, async (db, row, _review, saved) => {
      const handled = handledAdjustment(saved, commandId, record.executionId);
      if (handled) return handled;
      keepAdjustment(saved, commandId, record, evidenceHash(record));
      await writeReview(db, owner, row.id, saved);
      return record;
    });
  }
  async decide(owner: AgenticOwner, id: string, raw: EvidenceReviewCommand): Promise<EvidenceReview> {
    const input = EvidenceReviewCommandSchema.parse(raw);
    return this.guarded(owner, id, async (db, row, review, saved, token) => {
      const inputHash = evidenceHash(input),
        previous = saved.commands[input.commandId];
      if (previous) {
        if (previous.inputHash !== inputHash) throw new Error('EVIDENCE_COMMAND_CONFLICT');
        return { ...review, isReplay: true };
      }
      if (review.revision !== input.expectedRevision || review.reviewToken !== input.reviewToken)
        throw new Error('EVIDENCE_REVIEW_CONFLICT');
      await this.applyDecisions(db, owner, id, review, saved, input.decisions);
      saved.revision++;
      saved.commands[input.commandId] = { inputHash };
      await writeReview(db, owner, row.id, saved);
      return { ...review, revision: saved.revision, reviewToken: token(saved.revision), decisions: saved.decisions };
    });
  }
  /** Shared by decide and the structure adjustment: FACT items first, so evidence can link to an adopted fact. */
  private async applyDecisions(
    db: ForgeLexDatabase,
    owner: AgenticOwner,
    id: string,
    review: EvidenceReview,
    saved: SavedReview,
    decisions: EvidenceReviewCommand['decisions'],
  ) {
    const ordered = [...decisions].sort(
      (a, b) =>
        Number(review.items.find((i) => i.id === a.itemId)?.kind !== 'FACT') -
        Number(review.items.find((i) => i.id === b.itemId)?.kind !== 'FACT'),
    );
    for (const decision of ordered) {
      const item = review.items.find((i) => i.id === decision.itemId);
      if (!item) throw new Error('EVIDENCE_ITEM_INVALID');
      if (saved.decisions[item.id]) throw new Error('EVIDENCE_ALREADY_DECIDED');
      if (decision.eventDate && item.kind !== 'TIMELINE') throw new Error('EVIDENCE_DATE_INVALID');
      const text =
        decision.action === 'ADOPT' ? approvedText.parse(decision.text ?? item.text) : (decision.text ?? item.text);
      const eventDate = decision.eventDate ?? item.eventDate;
      let targetId: string | undefined;
      if (decision.action === 'ADOPT') {
        if (item.blockedReasons.length || (item.kind === 'EVIDENCE' && !item.sources.length))
          throw new Error('EVIDENCE_SOURCE_UNAVAILABLE');
        if (item.kind === 'TIMELINE' && !z.string().date().safeParse(eventDate).success)
          throw new Error('EVIDENCE_DATE_REQUIRED');
        const fact = item.factItemId ? saved.decisions[item.factItemId] : undefined;
        targetId = await adoptAnalysisItem(
          db,
          owner,
          review.matterId,
          id,
          { ...item, eventDate },
          text,
          fact?.action === 'ADOPT' ? fact.targetId : undefined,
        );
      }
      saved.decisions[item.id] = {
        action: decision.action,
        text,
        targetId,
        eventDate,
        decidedAt: new Date().toISOString(),
        decidedBy: owner.userId,
        proposal: item,
      };
    }
  }
  /**
   * Applies one adjust_structure work in ONE transaction: checks that the review is still the one the agent read
   * (`sourceHash` of the structure source), adds the sealed items, records the decisions and the outcome. Idempotent
   * by `commandId`: a replay returns the stored outcome. ALTERAR never adopts an item the user added (that needs the
   * user's explicit confirmation); REMOVER of it stays possible.
   */
  async applyStructureCommands(
    owner: AgenticOwner,
    id: string,
    raw: {
      commandId: string;
      executionId: string;
      sourceHash: string;
      commands: StructureCommand[];
      caseSummary: string;
      request?: string;
    },
  ): Promise<StructureAdjustmentRecord> {
    const input = { ...raw, commandId: z.string().uuid().parse(raw.commandId) };
    return this.guarded(owner, id, async (db, row, review, saved) => {
      const handled = handledAdjustment(saved, input.commandId, input.executionId);
      if (handled) return handled;
      const questions: StructureQuestion[] = [];
      let applied = 0;
      const decidedIds = new Set(Object.keys(review.decisions));
      if (!input.commands.length) {
        // Nothing to apply: only the summary is kept.
      } else if (structureItemsSource(id, review.items, decidedIds).contentHash !== input.sourceHash) {
        questions.push({ reason: 'ANALISE_ALTERADA' });
      } else {
        const resolution = resolveStructureCommands({ items: review.items, decidedIds, commands: input.commands });
        questions.push(...resolution.questions);
        const byId = new Map(review.items.map((i) => [i.id, i]));
        const decisions = resolution.decisions.filter((decision) => {
          const item = byId.get(decision.itemId)!;
          if (decision.action !== 'ADOPT') return true;
          if (item.userAdded) {
            questions.push({ itemId: item.id, reason: 'ITEM_INFORMADO_A_CONFIRMAR' });
            return false;
          }
          const eventDate = decision.eventDate ?? item.eventDate;
          if (
            item.blockedReasons.length ||
            (item.kind === 'EVIDENCE' && !item.sources.length) ||
            (item.kind === 'TIMELINE' && !z.string().date().safeParse(eventDate).success)
          ) {
            questions.push({ itemId: item.id, reason: 'ITEM_BLOQUEADO' });
            return false;
          }
          return true;
        });
        const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();
        const added = resolution.added.filter((a) => {
          const found = input.request !== undefined && normalize(input.request).includes(normalize(a.frase));
          if (!found) questions.push({ reason: 'FRASE_NAO_ENCONTRADA', texto: a.texto });
          return found;
        });
        let fresh = freshUserItems(id, review.items, z.array(addedItem).max(50).parse(added));
        if ((saved.added?.length ?? 0) + fresh.length > EVIDENCE_REVIEW_ADDED_LIMIT) {
          questions.push({ reason: 'LIMITE_DE_ITENS' });
          fresh = [];
        }
        if (fresh.length) saved.added = [...(saved.added ?? []), ...fresh];
        await this.applyDecisions(db, owner, id, review, saved, decisions);
        applied = fresh.length + decisions.length;
        if (applied) saved.revision++;
      }
      const record: StructureAdjustmentRecord = {
        executionId: input.executionId,
        applied,
        questions,
        caseSummary: input.caseSummary,
        recordedAt: new Date().toISOString(),
      };
      keepAdjustment(saved, input.commandId, record, evidenceHash(input));
      await writeReview(db, owner, row.id, saved);
      return record;
    });
  }
}
