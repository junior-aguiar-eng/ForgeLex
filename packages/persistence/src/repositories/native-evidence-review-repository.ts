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
  commands: Record<string, { inputHash: string }>;
}
const emptyReview = (): SavedReview => ({ version: 1, revision: 1, decisions: {}, commands: {} });
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
      token: (revision: number) => string,
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
        const items = deriveEvidenceReviewItems(id, delivery, sources);
        const lifecycleRevision = await new MatterWriteGuard(tx).captureRevision({
          tenantId: owner.tenantId,
          matterId,
        });
        const token = (revision: number) =>
          evidenceHash([
            row.contentHash,
            revision,
            context,
            lifecycleRevision,
            sources.map((source) => [source.id, source.blocked, source.fingerprint]),
            items,
          ]);
        const review: EvidenceReview = {
          deliveryId: id,
          matterId,
          revision: saved.revision,
          items,
          decisions: saved.decisions,
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
      const ordered = [...input.decisions].sort(
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
      saved.revision++;
      saved.commands[input.commandId] = { inputHash };
      const evidenceReviewJson = JSON.stringify(saved);
      if (Buffer.byteLength(evidenceReviewJson) > 1000000) throw new Error('EVIDENCE_REVIEW_LIMIT');
      await db
        .update(s.agenticTaskDeliveries)
        .set({ evidenceReviewJson })
        .where(
          and(
            eq(s.agenticTaskDeliveries.id, row.id),
            eq(s.agenticTaskDeliveries.tenantId, owner.tenantId),
            eq(s.agenticTaskDeliveries.userId, owner.userId),
          ),
        );
      return { ...review, revision: saved.revision, reviewToken: token(saved.revision), decisions: saved.decisions };
    });
  }
}
