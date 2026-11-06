import { DeskEditorialRepository } from './desk-editorial-repository.js';
import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AgenticTaskDeliverySchema,
  NativeTaskPacketSchema,
  TaskSourceSchema,
  TaskDocumentSchema,
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
import { agenticTaskDeliveries, agenticConversations, legalDocuments, drafts, matters } from '../schema/schema.js';
import { MatterWriteGuard } from './matter-write-guard.js';
import type { ForgeLexDatabase } from '../db.js';
import { ApprovedCaseContextRepository } from './approved-case-context-repository.js';

const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
export type AuthorizeNativeTask = (
  owner: AgenticOwner,
  matterId: string | undefined,
  db: ForgeLexDatabase,
) => Promise<void>;
export interface EditorialSnapshot {
  origin?: 'DESK_VERSION';
  id: string;
  draftId: string;
  versionId: string;
  delivery: Pick<
    AgenticTaskDelivery,
    'contextId' | 'contextRevision' | 'document' | 'claims' | 'requirements' | 'findings' | 'supportAudit'
  >;
  sources: TaskSource[];
}
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
    completedRead = false,
  ): Promise<T> {
    await this.authorize({ tenantId: binding.tenantId, userId: binding.userId }, binding.matterId, this.db);
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as ForgeLexDatabase,
        workspace = new AgenticWorkspaceRepository(db);
      const owner = { tenantId: binding.tenantId, userId: binding.userId };
      if (completedRead)
        await db
          .update(agenticConversations)
          .set({ contextRevision: sql`${agenticConversations.contextRevision}` })
          .where(
            and(
              eq(agenticConversations.id, binding.conversationId),
              eq(agenticConversations.tenantId, owner.tenantId),
              eq(agenticConversations.userId, owner.userId),
            ),
          );
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
          execution.status !== (completedRead ? 'COMPLETED' : 'RUNNING'))
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
        if (context.approvedItems?.length)
          sources.push(
            ...(await new ApprovedCaseContextRepository(db).load(
              owner,
              binding.matterId,
              context.approvedItems,
              historical,
            )),
          );
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
      } else if (context.documents.length || context.draft || context.approvedItems?.length)
        throw new Error('CONTEXT_MATTER_REQUIRED');
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
      for (const s of delivery.sources) {
        const trusted = packet.sources.find((p) => p.id === s.id);
        if (
          (trusted?.approvedItem || s.approvedItem || s.kind.startsWith('CASE_')) &&
          (!trusted?.approvedItem ||
            trusted.kind !== s.kind ||
            trusted.contentHash !== s.contentHash ||
            hash(trusted.approvedItem) !== hash(s.approvedItem ?? null))
        )
          throw new Error('SOURCE_REFERENCE_INVALID');
      }
      for (const section of delivery.document?.sections ?? [])
        for (const id of section.sourceIds)
          if (packet.sources.some((p) => p.id === id && p.approvedItem) && !delivery.sources.some((s) => s.id === id))
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
            linkedFactIds: [
              ...new Set(
                s.sourceIds.flatMap((id) => {
                  const source = packet.sources.find((p) => p.id === id);
                  return source?.approvedItem
                    ? source.kind === 'CASE_FACT'
                      ? [source.approvedItem.targetId]
                      : source.approvedItem.relatedFactId
                        ? [source.approvedItem.relatedFactId]
                        : []
                    : [];
                }),
              ),
            ],
            linkedEvidenceIds: [
              ...new Set(
                s.sourceIds.flatMap((id) => {
                  const source = packet.sources.find((p) => p.id === id);
                  return source?.kind === 'CASE_EVIDENCE' && source.approvedItem ? [source.approvedItem.targetId] : [];
                }),
              ),
            ],
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
  /** Load an authorized snapshot; desk metadata may be initialized, but the piece is never changed. */
  async loadEditorialSnapshot(owner: AgenticOwner, id: string, expected: { draftId: string; versionId: string }) {
    if (id.startsWith('desk:')) return new DeskEditorialRepository(this.db, this.authorize).load(owner, id, expected);
    return this.editorialOperation(owner, id, expected, async (_db, snapshot) => snapshot);
  }
  /** Authorized historical metadata remains readable when the editable snapshot is stale. */
  async readEditorialHistory(owner: AgenticOwner, id: string, expected: { draftId: string; versionId: string }) {
    if (id.startsWith('desk:'))
      return new DeskEditorialRepository(this.db, this.authorize).history(owner, id, expected);
    return this.editorialOperation(owner, id, expected, async (_db, _snapshot, row) => row.editorialReviewJson, true);
  }
  /** Human review metadata only. Callback validation and saving share all snapshot locks. */
  async editorialReview<T>(
    owner: AgenticOwner,
    id: string,
    expected: { draftId: string; versionId: string },
    action: (snapshot: EditorialSnapshot, saved: string | null) => { result: T; record?: string },
  ) {
    if (id.startsWith('desk:'))
      return new DeskEditorialRepository(this.db, this.authorize).review(owner, id, expected, action);
    return this.editorialOperation(owner, id, expected, async (db, snapshot, row) => {
      const outcome = action(snapshot, row.editorialReviewJson);
      if (outcome.record !== undefined)
        await db
          .update(agenticTaskDeliveries)
          .set({ editorialReviewJson: outcome.record })
          .where(
            and(
              eq(agenticTaskDeliveries.id, id),
              eq(agenticTaskDeliveries.tenantId, owner.tenantId),
              eq(agenticTaskDeliveries.userId, owner.userId),
            ),
          );
      return outcome.result;
    });
  }
  /** Only explicit human application uses this writer; the immutable delivery stays untouched. */
  async applyEditorialChanges<T>(
    owner: AgenticOwner,
    id: string,
    expected: { draftId: string; versionId: string },
    prepare: (
      snapshot: EditorialSnapshot,
      saved: string | null,
    ) => {
      document: z.infer<typeof TaskDocumentSchema>;
      complete: (version: { id: string; versionNumber: number; contentHash: string }) => { result: T; record: string };
    },
    replay: (saved: string | null) => T | undefined,
  ): Promise<T> {
    if (id.startsWith('desk:'))
      return new DeskEditorialRepository(this.db, this.authorize).apply(owner, id, expected, prepare, replay);
    try {
      return await this.editorialOperation(owner, id, expected, async (db, snapshot, row) => {
        const prepared = prepare(snapshot, row.editorialReviewJson);
        const repo = new DraftRepository(db);
        const execution = await new AgenticWorkspaceRepository(db).getExecution(owner, row.executionId);
        if (!execution?.matterId) throw new Error('DELIVERY_NOT_FOUND');
        const original = await repo.getVersion(
          owner.tenantId,
          execution.matterId,
          expected.draftId,
          expected.versionId,
        );
        if (!original) throw new Error('EDITORIAL_VERSION_CONFLICT');
        const sections = original.sections.map((section, index) => ({
          ordinal: section.ordinal,
          title: section.title,
          content: prepared.document.sections[index].content,
          linkedFactIds: section.linkedFactIds,
          linkedEvidenceIds: section.linkedEvidenceIds,
          linkedAuthorityIds: section.linkedAuthorityIds,
          linkedThesisIds: section.linkedThesisIds,
        }));
        const citations = original.citations.map((citation) => ({
          sectionOrdinal: original.sections.find((section) => section.id === citation.sectionId)!.ordinal,
          targetType: citation.targetType,
          targetId: citation.targetId,
          citationText: citation.citationText,
          verified: false,
        }));
        const title = prepared.document.title;
        const bundle = await repo.insertVersionInTransaction({
          tenantId: owner.tenantId,
          matterId: execution.matterId,
          draftId: expected.draftId,
          title,
          sections,
          citations,
          source: 'HUMAN',
          status: 'DRAFT',
          createdBy: owner.userId,
          contentHash: hash({ title, sections, citations }),
          baseVersionId: expected.versionId,
          expectedCurrentVersionId: expected.versionId,
          notes: 'Aplicação editorial humana; conferir esta versão antes do uso.',
        });
        const outcome = prepared.complete(bundle.version);
        await db
          .update(agenticTaskDeliveries)
          .set({ editorialReviewJson: outcome.record })
          .where(
            and(
              eq(agenticTaskDeliveries.id, id),
              eq(agenticTaskDeliveries.tenantId, owner.tenantId),
              eq(agenticTaskDeliveries.userId, owner.userId),
            ),
          );
        return outcome.result;
      });
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
      // A recorded command may have caused the stale version itself. Reauthorize historical
      // access and return only the exact saved result; never write through this path.
      const result = replay(await this.readEditorialHistory(owner, id, expected));
      if (result === undefined) throw error;
      return result;
    }
  }
  private async editorialOperation<T>(
    owner: AgenticOwner,
    id: string,
    expected: { draftId: string; versionId: string },
    action: (
      db: ForgeLexDatabase,
      snapshot: EditorialSnapshot,
      row: typeof agenticTaskDeliveries.$inferSelect,
    ) => Promise<T>,
    historyOnly = false,
  ) {
    const find = async (db: ForgeLexDatabase) =>
      (
        await db
          .select()
          .from(agenticTaskDeliveries)
          .where(
            and(
              eq(agenticTaskDeliveries.id, id),
              eq(agenticTaskDeliveries.tenantId, owner.tenantId),
              eq(agenticTaskDeliveries.userId, owner.userId),
            ),
          )
          .limit(1)
      )[0];
    const initial = await find(this.db);
    if (!initial) throw new Error('DELIVERY_NOT_FOUND');
    const run = await new AgenticWorkspaceRepository(this.db).getExecution(owner, initial.executionId);
    if (!run?.matterId || !run.deliveryIds.includes(id)) throw new Error('DELIVERY_NOT_FOUND');
    const initialDelivery = this.decode(initial);
    return this.guarded(
      {
        ...owner,
        executionId: run.id,
        conversationId: initial.conversationId,
        contextRevision: initial.contextRevision,
        matterId: run.matterId,
        objective: '',
        previousDeliveryIds: initialDelivery.sources.filter((s) => s.kind === 'PREVIOUS_DELIVERY').map((s) => s.id),
      },
      async (db, packet) => {
        const row = await find(db);
        if (!row || row.executionId !== run.id) throw new Error('DELIVERY_NOT_FOUND');
        const delivery = this.decode(row);
        if (
          !delivery.document ||
          !row.draftId ||
          !row.versionId ||
          row.draftId !== expected.draftId ||
          row.versionId !== expected.versionId
        )
          throw new Error('EDITORIAL_VERSION_CONFLICT');
        await db
          .update(drafts)
          .set({ updatedAt: sql`${drafts.updatedAt}` })
          .where(
            and(eq(drafts.id, row.draftId), eq(drafts.tenantId, owner.tenantId), eq(drafts.matterId, run.matterId!)),
          );
        const repo = new DraftRepository(db);
        const draft = await repo.getDraft(owner.tenantId, run.matterId!, row.draftId);
        const bundle = await repo.getVersion(owner.tenantId, run.matterId!, row.draftId, row.versionId);
        const document = TaskDocumentSchema.parse(delivery.document);
        if (
          !draft ||
          (!historyOnly && draft.currentVersionId !== row.versionId) ||
          !bundle ||
          bundle.version.contentHash !== hash(document) ||
          (!historyOnly && draft.title !== document.title) ||
          bundle.sections.length !== document.sections.length ||
          bundle.sections.some(
            (s, index) =>
              s.ordinal !== index + 1 ||
              s.title !== document.sections[index].title ||
              s.content !== document.sections[index].content,
          )
        )
          throw new Error('EDITORIAL_VERSION_CONFLICT');

        if (historyOnly)
          return action(db, { id: row.id, draftId: row.draftId, versionId: row.versionId, delivery, sources: [] }, row);

        // Only legal source text needs the completed checkpoint. The delivery is mandatory,
        // and every recovered byte/metadata field must match its persisted source reference.
        const execution = await new AgenticWorkspaceRepository(db).getExecution(owner, run.id);
        let evidence: TaskSource[] = [];
        if (delivery.sources.some((s) => ['AUTHORITY', 'NORM'].includes(s.kind))) {
          const parsed = z
            .object({
              caseTask: z.object({
                version: z.number().int().min(1).max(8),
                evidence: z.array(TaskSourceSchema).max(100),
              }),
            })
            .safeParse(execution?.checkpoint);
          if (!parsed.success) throw new Error('EDITORIAL_SOURCE_UNAVAILABLE');
          evidence = parsed.data.caseTask.evidence;
        }
        const sources = delivery.sources.map((ref) => {
          const candidates = (['AUTHORITY', 'NORM'].includes(ref.kind) ? evidence : packet.sources).filter(
            (s) => s.id === ref.id,
          );
          if (candidates.length !== 1) throw new Error('EDITORIAL_SOURCE_UNAVAILABLE');
          const source = TaskSourceSchema.parse(candidates[0]);
          const { text, ...metadata } = source;
          if (hash(text) !== ref.contentHash || hash(metadata) !== hash(ref))
            throw new Error('EDITORIAL_SOURCE_UNAVAILABLE');
          return source;
        });
        return action(db, { id: row.id, draftId: row.draftId, versionId: row.versionId, delivery, sources }, row);
      },
      historyOnly,
      true,
    );
  }
  /** Trusted financial finalization reads only an already committed immutable snapshot.
   * It must remain possible after live source access is revoked; this is not a client read endpoint.
   */
  async getCommittedExecutionDelivery(owner: AgenticOwner, executionId: string, id: string) {
    const execution = await new AgenticWorkspaceRepository(this.db).getExecution(owner, executionId);
    if (!execution?.deliveryIds.includes(id)) return undefined;
    const [row] = await this.db
      .select()
      .from(agenticTaskDeliveries)
      .where(
        and(
          eq(agenticTaskDeliveries.id, id),
          eq(agenticTaskDeliveries.executionId, executionId),
          eq(agenticTaskDeliveries.tenantId, owner.tenantId),
          eq(agenticTaskDeliveries.userId, owner.userId),
          eq(agenticTaskDeliveries.conversationId, execution.conversationId),
          eq(agenticTaskDeliveries.contextRevision, execution.contextRevision),
        ),
      )
      .limit(1);
    return row ? this.decode(row) : undefined;
  }
  async getDeliveryContext(owner: AgenticOwner, id: string): Promise<{ matterId: string | null }> {
    if (id.startsWith('desk:')) return new DeskEditorialRepository(this.db, this.authorize).authorizeTarget(owner, id);
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
