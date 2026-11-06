import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AgenticTaskDeliverySchema, TaskDocumentSchema, type AgenticOwner } from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import { drafts, draftVersions } from '../schema/schema.js';
import { DraftRepository } from './draft-repository.js';
import { MatterRepository } from './matter-repository.js';
import { withMatterWrite } from './matter-write-guard.js';
import type { AuthorizeNativeTask, EditorialSnapshot } from './native-case-task-repository.js';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const snapshotSchema = z.object({
  id: z.string(),
  draftId: z.string(),
  versionId: z.string(),
  origin: z.literal('DESK_VERSION'),
  delivery: AgenticTaskDeliverySchema.pick({
    contextId: true,
    contextRevision: true,
    document: true,
    claims: true,
    requirements: true,
    findings: true,
    supportAudit: true,
  }).extend({
    document: TaskDocumentSchema.extend({
      sections: z.array(TaskDocumentSchema.shape.sections.element.extend({ content: z.string().min(1) })),
    }),
  }),
  sources: z.array(z.never()),
});
const recordsSchema = z.record(z.string(), z.object({ snapshot: snapshotSchema, record: z.string().nullable() }));
type Target = { draftId: string; versionId: string };
/** Version metadata follows the draft's existing retention/deletion lifecycle. No AI delivery is fabricated. */
export class DeskEditorialRepository {
  constructor(
    private readonly db: ForgeLexDatabase,
    private readonly authorize: AuthorizeNativeTask,
  ) {}
  async authorizeTarget(owner: AgenticOwner, id: string) {
    const matterId = z.string().uuid().parse(id.slice(5));
    await this.authorize(owner, matterId, this.db);
    if (!(await new MatterRepository(this.db).getMatter(owner.tenantId, matterId))) throw new Error('MATTER_NOT_FOUND');
    return { matterId };
  }
  private async operation<T>(
    owner: AgenticOwner,
    id: string,
    target: Target,
    historical: boolean,
    action: (
      db: ForgeLexDatabase,
      snapshot: EditorialSnapshot,
      record: string | null,
      save: (record: string) => Promise<void>,
      matterId: string,
    ) => Promise<T>,
  ) {
    const { matterId } = await this.authorizeTarget(owner, id);
    return withMatterWrite(this.db, { tenantId: owner.tenantId, matterId }, async (db) => {
      await this.authorize(owner, matterId, db);
      await db
        .update(drafts)
        .set({ updatedAt: sql`${drafts.updatedAt}` })
        .where(and(eq(drafts.id, target.draftId), eq(drafts.tenantId, owner.tenantId), eq(drafts.matterId, matterId)));
      const repo = new DraftRepository(db);
      const draft = await repo.getDraft(owner.tenantId, matterId, target.draftId);
      const bundle = await repo.getVersion(owner.tenantId, matterId, target.draftId, target.versionId);
      if (!draft || !bundle || (!historical && draft.currentVersionId !== target.versionId))
        throw new Error('EDITORIAL_VERSION_CONFLICT');
      const where = and(
        eq(draftVersions.id, target.versionId),
        eq(draftVersions.tenantId, owner.tenantId),
        eq(draftVersions.matterId, matterId),
        eq(draftVersions.draftId, target.draftId),
      );
      const [row] = await db.select().from(draftVersions).where(where).limit(1);
      const records = recordsSchema.parse(JSON.parse(row.editorialReviewsJson ?? '{}'));
      const key = digest(owner);
      let entry = records[key];
      if (!entry) {
        if (historical && draft.currentVersionId !== target.versionId) throw new Error('EDITORIAL_VERSION_CONFLICT');
        const document = TaskDocumentSchema.parse({
          title: draft.title,
          documentType: 'Peça salva na mesa',
          sections: bundle.sections.map((s) => ({ title: s.title, content: s.content, sourceIds: [] })),
        });
        // Do not trim anchor text: offsets always refer to the exact saved content.
        document.sections.forEach((s, i) => {
          s.content = bundle.sections[i].content;
        });
        entry = {
          record: null,
          snapshot: {
            id,
            draftId: target.draftId,
            versionId: target.versionId,
            origin: 'DESK_VERSION',
            sources: [],
            delivery: {
              contextId: `desk-version:${target.versionId}`,
              contextRevision: bundle.version.versionNumber,
              document,
              claims: [],
              requirements: [],
              supportAudit: [],
              findings: [
                {
                  id: 'desk-editorial-only',
                  code: 'LEGAL_SUPPORT_NOT_EVALUATED',
                  severity: 'WARNING',
                  sourceIds: [],
                  statement:
                    'Revisão editorial do texto salvo pelo usuário. Fatos, fontes, citações e mérito jurídico não foram auditados; não presume nem herda validação de versões anteriores.',
                },
              ],
            },
          },
        };
        records[key] = entry;
        await db
          .update(draftVersions)
          .set({ editorialReviewsJson: JSON.stringify(records) })
          .where(where);
      }
      const snapshot = entry.snapshot;
      if (
        snapshot.id !== id ||
        snapshot.draftId !== target.draftId ||
        snapshot.versionId !== target.versionId ||
        snapshot.delivery.document?.sections.length !== bundle.sections.length ||
        snapshot.delivery.document.sections.some(
          (s, i) => s.content !== bundle.sections[i].content || s.title !== bundle.sections[i].title,
        ) ||
        (!historical && snapshot.delivery.document.title !== draft.title)
      )
        throw new Error('EDITORIAL_VERSION_CONFLICT');
      return action(
        db,
        snapshot,
        entry.record,
        async (record) => {
          records[key] = { snapshot, record };
          await db
            .update(draftVersions)
            .set({ editorialReviewsJson: JSON.stringify(records) })
            .where(where);
        },
        matterId,
      );
    });
  }
  load(owner: AgenticOwner, id: string, target: Target) {
    return this.operation(owner, id, target, false, async (_db, snapshot) => snapshot);
  }
  history(owner: AgenticOwner, id: string, target: Target) {
    return this.operation(owner, id, target, true, async (_db, _snapshot, record) => record);
  }
  review<T>(
    owner: AgenticOwner,
    id: string,
    target: Target,
    action: (snapshot: EditorialSnapshot, record: string | null) => { result: T; record?: string },
  ) {
    return this.operation(owner, id, target, false, async (_db, snapshot, record, save) => {
      const outcome = action(snapshot, record);
      if (outcome.record !== undefined) await save(outcome.record);
      return outcome.result;
    });
  }
  async apply<T>(
    owner: AgenticOwner,
    id: string,
    target: Target,
    prepare: (
      snapshot: EditorialSnapshot,
      saved: string | null,
    ) => {
      document: z.infer<typeof TaskDocumentSchema>;
      complete: (version: { id: string; versionNumber: number; contentHash: string }) => { result: T; record: string };
    },
    replay: (saved: string | null) => T | undefined,
  ): Promise<T> {
    try {
      return await this.operation(owner, id, target, false, async (db, snapshot, saved, save, matterId) => {
        const prepared = prepare(snapshot, saved),
          repo = new DraftRepository(db);
        const original = (await repo.getVersion(owner.tenantId, matterId, target.draftId, target.versionId))!;
        const sections = original.sections.map((s, i) => ({
          ordinal: s.ordinal,
          title: s.title,
          content: prepared.document.sections[i].content,
          linkedFactIds: s.linkedFactIds,
          linkedEvidenceIds: s.linkedEvidenceIds,
          linkedAuthorityIds: s.linkedAuthorityIds,
          linkedThesisIds: s.linkedThesisIds,
        }));
        const citations = original.citations.map((c) => ({
          sectionOrdinal: original.sections.find((s) => s.id === c.sectionId)!.ordinal,
          targetType: c.targetType,
          targetId: c.targetId,
          citationText: c.citationText,
          verified: false,
        }));
        const title = prepared.document.title;
        const bundle = await repo.insertVersionInTransaction({
          tenantId: owner.tenantId,
          matterId,
          draftId: target.draftId,
          title,
          sections,
          citations,
          source: 'HUMAN',
          status: 'DRAFT',
          createdBy: owner.userId,
          contentHash: digest({ title, sections, citations }),
          baseVersionId: target.versionId,
          expectedCurrentVersionId: target.versionId,
          notes: 'Aplicação editorial humana; conferir esta versão antes do uso.',
        });
        const outcome = prepared.complete(bundle.version);
        await save(outcome.record);
        return outcome.result;
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'EDITORIAL_VERSION_CONFLICT') throw error;
      const result = replay(await this.history(owner, id, target));
      if (result === undefined) throw error;
      return result;
    }
  }
}
