import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  AgenticTaskDeliverySchema,
  NativeTaskPacketSchema,
  type AgenticOwner,
  type TaskBinding,
  type NativeTaskContextPort,
  type AgenticTaskDelivery,
  type NativeTaskPacket,
  type TaskSource,
} from '@forgelex/domain';
import { AgenticWorkspaceRepository } from './agentic-workspace-repository.js';
import { CaseAiAccessRepository } from './case-ai-access-repository.js';
import { MatterRepository } from './matter-repository.js';
import { DraftRepository } from './draft-repository.js';
import { agenticTaskDeliveries, legalDocuments, drafts, matters } from '../schema/schema.js';
import { MatterWriteGuard } from './matter-write-guard.js';
import type { ForgeLexDatabase } from '../db.js';

const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
export type AuthorizeNativeTask = (
  owner: AgenticOwner,
  matterId: string | undefined,
  db: ForgeLexDatabase,
) => Promise<void>;
/** Owner-bound native adapter. OAuth grant checks in the external MCP service remain unchanged. */
export class NativeCaseTaskRepository implements NativeTaskContextPort {
  constructor(
    private readonly db: ForgeLexDatabase,
    private readonly authorize: AuthorizeNativeTask,
  ) {
    if (typeof authorize !== 'function') throw new Error('NATIVE_AUTHORIZATION_REQUIRED');
  }
  private decode(row: typeof agenticTaskDeliveries.$inferSelect): AgenticTaskDelivery {
    try {
      const delivery = AgenticTaskDeliverySchema.parse(JSON.parse(row.payloadJson));
      if (
        row.id !== `delivery:${row.executionId}` ||
        hash(row.payloadJson) !== row.contentHash ||
        delivery.contextId !== row.conversationId ||
        delivery.contextRevision !== row.contextRevision
      )
        throw new Error('DELIVERY_INTEGRITY_FAILED');
      return delivery;
    } catch (error) {
      throw new Error('DELIVERY_INTEGRITY_FAILED', { cause: error });
    }
  }
  private async guarded<T>(
    binding: TaskBinding,
    action: (db: ForgeLexDatabase, packet: NativeTaskPacket) => Promise<T>,
    historical = false,
  ): Promise<T> {
    await this.authorize({ tenantId: binding.tenantId, userId: binding.userId }, binding.matterId, this.db);
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as ForgeLexDatabase,
        workspace = new AgenticWorkspaceRepository(db);
      const owner = { tenantId: binding.tenantId, userId: binding.userId };
      const conversation = await workspace.getConversation(owner, binding.conversationId);
      const execution = await workspace.getExecution(owner, binding.executionId);
      if (
        !conversation ||
        !execution ||
        execution.conversationId !== conversation.id ||
        execution.contextRevision !== binding.contextRevision ||
        conversation.matterId !== (binding.matterId ?? null)
      )
        throw new Error('CONTEXT_CONFLICT');
      if (
        !historical &&
        (conversation.contextRevision !== binding.contextRevision ||
          execution.requiresReevaluation ||
          execution.status !== 'RUNNING')
      )
        throw new Error('CONTEXT_CONFLICT');
      const context = conversation.contexts.find((c) => c.revision === binding.contextRevision);
      if (!context) throw new Error('CONTEXT_CONFLICT');
      // Match every human writer: conversation -> matter -> documents/draft.
      if (binding.matterId) {
        await db
          .update(matters)
          .set({ updatedAt: sql`${matters.updatedAt}` })
          .where(and(eq(matters.id, binding.matterId), eq(matters.tenantId, binding.tenantId)));
        await new MatterWriteGuard(db).captureRevision({ tenantId: binding.tenantId, matterId: binding.matterId });
      }
      const sources: TaskSource[] = [];
      const add = (id: string, kind: TaskSource['kind'], text: string, extra: Partial<TaskSource> = {}) => {
        if (text.trim()) sources.push({ id, kind, text, contentHash: hash(text), ...extra });
      };
      if (!historical) add(`user:${hash(context.text)}`, 'USER_TEXT', context.text);
      if (binding.matterId) {
        for (const d of [...context.documents].sort((a, b) => a.documentId.localeCompare(b.documentId))) {
          await db
            .update(legalDocuments)
            .set({ updatedAt: sql`${legalDocuments.updatedAt}` })
            .where(and(eq(legalDocuments.id, d.documentId), eq(legalDocuments.tenantId, binding.tenantId)));
          const current: Awaited<ReturnType<MatterRepository['getDocumentVersion']>> = historical
            ? await new MatterRepository(db).getSpecificDocumentVersion(
                binding.tenantId,
                binding.matterId,
                d.documentId,
                d.versionId,
                'work',
              )
            : await new MatterRepository(db).getDocumentVersion(binding.tenantId, d.documentId, 'work');
          if (!current || current.document.matterId !== binding.matterId) throw new Error('ACCESS_REVOKED');
          if (!historical && current.version.id !== d.versionId) throw new Error('SOURCE_VERSION_CONFLICT');
        }
        const selected = historical
          ? []
          : await new CaseAiAccessRepository(db).loadSelection(binding, binding.matterId, {
              documents: context.documents,
              factIds: [],
              evidenceIds: [],
              thesisIds: [],
              authorityIds: [],
            });
        for (const d of selected) {
          const ref = context.documents.find((x) => x.documentId === d.id)!;
          add(ref.versionId, 'DOCUMENT', d.fields.find((f) => f.field === 'content')!.text, {
            documentId: ref.documentId,
            versionId: ref.versionId,
            extent: 'SELECTED_TEXT',
          });
        }
        if (context.draft) {
          await db
            .update(drafts)
            .set({ updatedAt: sql`${drafts.updatedAt}` })
            .where(
              and(
                eq(drafts.id, context.draft.draftId),
                eq(drafts.tenantId, binding.tenantId),
                eq(drafts.matterId, binding.matterId),
              ),
            );
          const repo = new DraftRepository(db),
            draft = await repo.getDraft(binding.tenantId, binding.matterId, context.draft.draftId);
          if (!draft) throw new Error('ACCESS_REVOKED');
          if (!historical && draft.currentVersionId !== context.draft.versionId)
            throw new Error('SOURCE_VERSION_CONFLICT');
          const version = await repo.getVersion(binding.tenantId, binding.matterId, draft.id, context.draft.versionId);
          if (!version) throw new Error('ACCESS_REVOKED');
          if (!historical)
            add(context.draft.versionId, 'DRAFT', version.sections.map((s) => `${s.title}\n${s.content}`).join('\n'), {
              versionId: context.draft.versionId,
              extent: 'SELECTED_TEXT',
              identityStatus: version.version.source,
            });
        }
      } else if (context.documents.length || context.draft) throw new Error('CONTEXT_MATTER_REQUIRED');
      if (historical) {
        await this.authorize(owner, binding.matterId, db);
        return action(db, {
          contextId: conversation.id,
          contextRevision: binding.contextRevision,
          sources: [],
          answers: [],
        });
      }
      for (const a of context.answers ?? []) add(`answer:${hash(a)}`, 'ANSWER', JSON.stringify(a));
      const prior = await db
        .select()
        .from(agenticTaskDeliveries)
        .where(
          and(
            eq(agenticTaskDeliveries.tenantId, binding.tenantId),
            eq(agenticTaskDeliveries.userId, binding.userId),
            eq(agenticTaskDeliveries.conversationId, binding.conversationId),
          ),
        );
      for (const row of prior.filter(
        (r) =>
          r.executionId !== binding.executionId &&
          (binding.previousDeliveryIds === undefined || binding.previousDeliveryIds.includes(r.id)),
      )) {
        const delivery = this.decode(row);
        if (
          delivery.sources
            .filter((s) => !['AUTHORITY', 'NORM', 'PREVIOUS_DELIVERY'].includes(s.kind))
            .every((s) => sources.some((x) => x.id === s.id && x.contentHash === s.contentHash))
        ) {
          const text = JSON.stringify(delivery);
          add(row.id, 'PREVIOUS_DELIVERY', text.slice(0, 16000), {
            extent: text.length > 16000 ? 'EXCERPT' : 'SELECTED_TEXT',
          });
        }
      }
      await this.authorize({ tenantId: binding.tenantId, userId: binding.userId }, binding.matterId, db);
      if (Buffer.byteLength(JSON.stringify(sources)) > 128000) throw new Error('TASK_CONTEXT_LIMIT');
      const packet = NativeTaskPacketSchema.parse({
        contextId: conversation.id,
        contextRevision: binding.contextRevision,
        sources,
        answers: context.answers ?? [],
      });
      return action(db, packet);
    });
  }
  load(binding: TaskBinding): Promise<NativeTaskPacket> {
    return this.guarded(binding, async (_db, packet) => packet);
  }
  async assert(binding: TaskBinding): Promise<void> {
    await this.guarded(binding, async () => undefined);
  }
  async save(
    binding: TaskBinding,
    raw: AgenticTaskDelivery,
  ): Promise<{ id: string; draftId?: string; versionId?: string }> {
    const delivery = AgenticTaskDeliverySchema.parse(raw);
    if (delivery.contextId !== binding.conversationId || delivery.contextRevision !== binding.contextRevision)
      throw new Error('CONTEXT_CONFLICT');
    return this.guarded(binding, async (db, packet) => {
      for (const s of delivery.sources.filter((s) => !['AUTHORITY', 'NORM'].includes(s.kind)))
        if (!packet.sources.some((p) => p.id === s.id && p.contentHash === s.contentHash))
          throw new Error('SOURCE_REFERENCE_INVALID');
      const id = `delivery:${binding.executionId}`,
        payloadJson = JSON.stringify(delivery),
        contentHash = hash(payloadJson);
      const [existing] = await db
        .select()
        .from(agenticTaskDeliveries)
        .where(eq(agenticTaskDeliveries.executionId, binding.executionId))
        .limit(1);
      if (existing) {
        if (existing.contentHash !== contentHash) throw new Error('DELIVERY_IDEMPOTENCY_CONFLICT');
        return {
          id: existing.id,
          ...(existing.draftId ? { draftId: existing.draftId, versionId: existing.versionId! } : {}),
        };
      }
      let draftId: string | undefined, versionId: string | undefined;
      if (delivery.document && binding.matterId) {
        const repo = new DraftRepository(db);
        const draft = await repo.createDraft({
          tenantId: binding.tenantId,
          matterId: binding.matterId,
          title: delivery.document.title,
          createdBy: binding.userId,
        });
        const bundle = await repo.createVersion({
          tenantId: binding.tenantId,
          matterId: binding.matterId,
          draftId: draft.id,
          title: draft.title,
          createdBy: binding.userId,
          source: 'WORKFLOW',
          status: 'DRAFT',
          contentHash: hash(delivery.document),
          notes: 'Minuta preliminar agêntica; exige revisão humana de Boni.',
          sections: delivery.document.sections.map((s, i) => ({
            title: s.title,
            content: s.content,
            ordinal: i + 1,
            linkedFactIds: [],
            linkedThesisIds: [],
          })),
        });
        draftId = draft.id;
        versionId = bundle.version.id;
      }
      await this.authorize({ tenantId: binding.tenantId, userId: binding.userId }, binding.matterId, db);
      await db.insert(agenticTaskDeliveries).values({
        id,
        executionId: binding.executionId,
        conversationId: binding.conversationId,
        tenantId: binding.tenantId,
        userId: binding.userId,
        contextRevision: binding.contextRevision,
        payloadJson,
        contentHash,
        draftId: draftId ?? null,
        versionId: versionId ?? null,
      });
      const workspace = new AgenticWorkspaceRepository(db),
        owner = { tenantId: binding.tenantId, userId: binding.userId };
      const execution = (await workspace.getExecution(owner, binding.executionId))!;
      await workspace.saveProgress(owner, binding.executionId, execution.checkpoint, [
        ...new Set([...execution.deliveryIds, id]),
      ]);
      await workspace.appendEvent(owner, binding.executionId, { type: 'DELIVERY', payload: { deliveryId: id } });
      return { id, ...(draftId ? { draftId, versionId } : {}) };
    });
  }
  async getDelivery(owner: AgenticOwner, id: string) {
    const [row] = await this.db
      .select()
      .from(agenticTaskDeliveries)
      .where(
        and(
          eq(agenticTaskDeliveries.id, id),
          eq(agenticTaskDeliveries.tenantId, owner.tenantId),
          eq(agenticTaskDeliveries.userId, owner.userId),
        ),
      )
      .limit(1);
    if (!row) throw new Error('DELIVERY_NOT_FOUND');
    const execution = await new AgenticWorkspaceRepository(this.db).getExecution(owner, row.executionId);
    if (!execution) throw new Error('DELIVERY_NOT_FOUND');
    return this.guarded(
      {
        ...owner,
        executionId: row.executionId,
        conversationId: row.conversationId,
        contextRevision: row.contextRevision,
        objective: '',
        matterId: execution.matterId ?? undefined,
      },
      async () => ({
        id: row.id,
        delivery: this.decode(row),
        ...(row.draftId ? { draftId: row.draftId, versionId: row.versionId! } : {}),
      }),
      true,
    );
  }
  async getDeliveryContext(owner: AgenticOwner, id: string): Promise<{ matterId: string | null }> {
    const [row] = await this.db
      .select({ executionId: agenticTaskDeliveries.executionId })
      .from(agenticTaskDeliveries)
      .where(
        and(
          eq(agenticTaskDeliveries.id, id),
          eq(agenticTaskDeliveries.tenantId, owner.tenantId),
          eq(agenticTaskDeliveries.userId, owner.userId),
        ),
      )
      .limit(1);
    if (!row) throw new Error('DELIVERY_NOT_FOUND');
    const execution = await new AgenticWorkspaceRepository(this.db).getExecution(owner, row.executionId);
    if (!execution) throw new Error('DELIVERY_NOT_FOUND');
    return { matterId: execution.matterId };
  }
}
