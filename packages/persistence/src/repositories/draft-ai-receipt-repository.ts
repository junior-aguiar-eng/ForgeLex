import { and, eq, desc, sql } from 'drizzle-orm';
import { MatterWriteGuard } from './matter-write-guard.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  DraftSaveFromAiInputSchema,
  type DraftSaveFromAiInput,
  type DraftAiReceipt,
  type DraftAiReference,
  type CaseAiOwner,
  type CaseAiReader,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { CaseAiAccessRepository } from './case-ai-access-repository.js';
import { DraftRepository } from './draft-repository.js';

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
type Row = typeof s.draftAiReceipts.$inferSelect;
function receipt(row: Row, isReplay = false): DraftAiReceipt {
  return {
    id: row.id,
    draftId: row.draftId,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    receivedAt: row.receivedAt,
    reviewPending: true,
    isReplay,
    openPath: `/app/rascunhos?matterId=${row.matterId}&draftId=${row.draftId}`,
    application: { clientId: row.oauthClientId },
  };
}
export class DraftAiReceiptRepository {
  constructor(private readonly db: ForgeLexDatabase) {}
  private scope(owner: CaseAiOwner, matterId: string, draftId: string) {
    return and(
      eq(s.draftAiReceipts.tenantId, owner.tenantId),
      eq(s.draftAiReceipts.userId, owner.userId),
      eq(s.draftAiReceipts.matterId, matterId),
      eq(s.draftAiReceipts.draftId, draftId),
    );
  }
  async receive(
    reader: CaseAiReader,
    raw: DraftSaveFromAiInput,
    options: { signal?: AbortSignal } = {},
  ): Promise<DraftAiReceipt> {
    const input = DraftSaveFromAiInputSchema.parse(raw);
    const abort = () => options.signal?.throwIfAborted();
    abort();
    return this.db.transaction(async (tx) => {
      const db = tx as unknown as ForgeLexDatabase;
      await tx
        .update(s.matters)
        .set({ updatedAt: sql`${s.matters.updatedAt}` })
        .where(and(eq(s.matters.id, input.matterId), eq(s.matters.tenantId, reader.tenantId)));
      abort();
      const access = new CaseAiAccessRepository(db);
      const grant = await access.assertActive(reader, input.matterId);
      if (grant.revision !== input.expectedGrantRevision) throw new Error('DRAFT_PERMISSION_STALE');
      if (!grant.receivePermission.enabled) throw new Error('DRAFT_RECEIVING_NOT_AUTHORIZED');
      const destination = grant.receivePermission.destination;
      const records = await access.loadSelection(reader, input.matterId, grant.selection);
      for (const ref of input.references) {
        const record = records.find((record) => record.kind === ref.kind && record.id === ref.itemId);
        if (
          !record ||
          (ref.kind === 'DOCUMENT' &&
            !record.fields.some(
              (field) =>
                field.versionId === ref.documentVersionId && (!ref.anchorId || field.anchorId === ref.anchorId),
            ))
        )
          throw new Error('DRAFT_REFERENCE_INVALID');
      }
      const references = [...input.references].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
      const keyHash = hash(input.idempotencyKey);
      const { idempotencyKey: _key, ...content } = input;
      const payloadHash = hash(
        JSON.stringify({
          ...content,
          sections: [...input.sections].sort((a, b) => a.ordinal - b.ordinal),
          references,
          destination,
        }),
      );
      const previous = await tx
        .select()
        .from(s.draftAiReceipts)
        .where(
          and(
            eq(s.draftAiReceipts.tenantId, reader.tenantId),
            eq(s.draftAiReceipts.userId, reader.userId),
            eq(s.draftAiReceipts.oauthClientId, reader.oauthConnection.clientId),
            eq(s.draftAiReceipts.oauthGrantedAt, reader.oauthConnection.grantedAt),
            eq(s.draftAiReceipts.matterId, input.matterId),
            eq(s.draftAiReceipts.keyHash, keyHash),
          ),
        )
        .limit(1);
      if (previous[0]) {
        if (previous[0].payloadHash !== payloadHash || previous[0].grantRevision !== grant.revision)
          throw new Error('DRAFT_RECEIPT_CONFLICT');
        abort();
        return receipt(previous[0], true);
      }
      abort();
      const drafts = new DraftRepository(db);
      const draft =
        destination.mode === 'NEW'
          ? await drafts.createDraft({
              tenantId: reader.tenantId,
              matterId: input.matterId,
              title: input.title,
              createdBy: reader.userId,
            })
          : await drafts.getDraft(reader.tenantId, input.matterId, destination.draftId);
      if (!draft) throw new Error('DRAFT_DESTINATION_INVALID');
      const bundle = await drafts.insertVersionInTransaction(
        {
          tenantId: reader.tenantId,
          matterId: input.matterId,
          draftId: draft.id,
          title: input.title,
          createdBy: reader.userId,
          source: 'SYSTEM',
          contentHash: hash(JSON.stringify({ title: input.title, sections: input.sections, references })),
          notes: input.notes,
          sections: input.sections.map((section) => {
            const ids = (kind: string) => [
              ...new Set(
                references.filter((r) => r.sectionOrdinal === section.ordinal && r.kind === kind).map((r) => r.itemId),
              ),
            ];
            return {
              ...section,
              linkedFactIds: ids('FACT'),
              linkedEvidenceIds: ids('EVIDENCE'),
              linkedAuthorityIds: ids('AUTHORITY'),
              linkedThesisIds: ids('THESIS'),
            };
          }),
          citations: references
            .filter((r) => r.kind === 'FACT' || r.kind === 'EVIDENCE' || r.kind === 'AUTHORITY')
            .map((r) => ({
              sectionOrdinal: r.sectionOrdinal,
              targetType: r.kind as 'FACT' | 'EVIDENCE' | 'AUTHORITY',
              targetId: r.itemId,
              citationText:
                r.citationText && r.citationText.length >= 3
                  ? r.citationText
                  : `Fonte do caso: ${records.find((record) => record.kind === r.kind && record.id === r.itemId)!.title}`,
              verified: false,
            })),
        },
        { preserveDraft: destination.mode === 'EXISTING' },
      );
      const row: Row = {
        id: randomUUID(),
        tenantId: reader.tenantId,
        userId: reader.userId,
        oauthClientId: reader.oauthConnection.clientId,
        oauthGrantedAt: reader.oauthConnection.grantedAt,
        matterId: input.matterId,
        grantId: grant.id,
        grantRevision: grant.revision,
        draftId: draft.id,
        versionId: bundle.version.id,
        versionNumber: bundle.version.versionNumber,
        destinationJson: JSON.stringify(destination),
        keyHash,
        payloadHash,
        referencesJson: JSON.stringify(references),
        receivedAt: new Date().toISOString(),
      };
      await tx.insert(s.draftAiReceipts).values(row);
      abort();
      return receipt(row);
    });
  }
  async listForOwner(owner: CaseAiOwner, matterId: string, draftId: string): Promise<DraftAiReceipt[]> {
    if (!(await new DraftRepository(this.db).getDraft(owner.tenantId, matterId, draftId))) return [];
    return (
      await this.db
        .select()
        .from(s.draftAiReceipts)
        .where(this.scope(owner, matterId, draftId))
        .orderBy(desc(s.draftAiReceipts.receivedAt))
    ).map((row) => receipt(row));
  }
  async getReferences(
    owner: CaseAiOwner,
    matterId: string,
    draftId: string,
    versionId: string,
  ): Promise<DraftAiReference[]> {
    // Provenance belongs to the tenant's draft version, regardless of its current reviewer.
    // Private receipt listing and adoption keep their separate user scope.
    const versions = new DraftRepository(this.db);
    const seen = new Set<string>();
    let current: string | undefined = versionId;
    while (current && !seen.has(current)) {
      seen.add(current);
      if (!(await versions.getVersion(owner.tenantId, matterId, draftId, current))) return [];
      const rows = await this.db
        .select()
        .from(s.draftAiReceipts)
        .where(
          and(
            eq(s.draftAiReceipts.tenantId, owner.tenantId),
            eq(s.draftAiReceipts.matterId, matterId),
            eq(s.draftAiReceipts.draftId, draftId),
            eq(s.draftAiReceipts.versionId, current),
          ),
        )
        .limit(1);
      if (rows[0]) return JSON.parse(rows[0].referencesJson) as DraftAiReference[];
      const parents = await this.db
        .select({ parent: s.draftVersions.derivedFromVersionId })
        .from(s.draftVersions)
        .where(eq(s.draftVersions.id, current))
        .limit(1);
      current = parents[0]?.parent ?? undefined;
    }
    return [];
  }
  async adopt(
    owner: CaseAiOwner,
    matterId: string,
    draftId: string,
    versionId: string,
    expectedCurrentVersionId: string | null,
  ) {
    return this.db.transaction(async (tx) => {
      const db = tx as unknown as ForgeLexDatabase;
      await tx
        .update(s.matters)
        .set({ updatedAt: sql`${s.matters.updatedAt}` })
        .where(and(eq(s.matters.id, matterId), eq(s.matters.tenantId, owner.tenantId)));
      await new MatterWriteGuard(db).captureRevision({ tenantId: owner.tenantId, matterId });
      await tx
        .update(s.drafts)
        .set({ updatedAt: sql`${s.drafts.updatedAt}` })
        .where(and(eq(s.drafts.id, draftId), eq(s.drafts.tenantId, owner.tenantId), eq(s.drafts.matterId, matterId)));
      const drafts = new DraftRepository(db);
      const draft = await drafts.getDraft(owner.tenantId, matterId, draftId);
      const rows = await tx
        .select()
        .from(s.draftAiReceipts)
        .where(and(this.scope(owner, matterId, draftId), eq(s.draftAiReceipts.versionId, versionId)))
        .limit(1);
      if (!draft || !rows[0]) throw new Error('DRAFT_RECEIPT_NOT_FOUND');
      if ((draft.currentVersionId ?? null) !== expectedCurrentVersionId) throw new Error('DRAFT_ADOPTION_CONFLICT');
      const version = await drafts.getVersion(owner.tenantId, matterId, draftId, versionId);
      if (!version) throw new Error('DRAFT_RECEIPT_NOT_FOUND');
      await tx
        .update(s.drafts)
        .set({ currentVersionId: versionId, status: 'DRAFT', updatedAt: new Date().toISOString() })
        .where(eq(s.drafts.id, draftId));
      return { draft: (await drafts.getDraft(owner.tenantId, matterId, draftId))!, version };
    });
  }
}
