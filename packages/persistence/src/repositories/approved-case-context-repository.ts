import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import {
  AgenticTaskDeliverySchema,
  ApprovedItemsSchema,
  ApprovedItemSnapshotSchema,
  type AgenticOwner,
  type ApprovedItems,
  type TaskSource,
  type ApprovedItemSnapshot,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { savedReviewSchema } from './evidence-review-record.js';
import { evidenceHash as hash } from './evidence-review-items.js';
import { MatterRepository } from './matter-repository.js';
import { MatterWriteGuard } from './matter-write-guard.js';

type Receipt = ReturnType<typeof savedReviewSchema.parse>;
type Row = typeof s.agenticTaskDeliveries.$inferSelect;
const sorted = (values: unknown[]) => [...values].map((v) => JSON.stringify(v)).sort();
const same = (a: unknown[], b: unknown[]) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** Internal only. Caller holds tenant/conversation locks; matter lock serializes human writers. */
export class ApprovedCaseContextRepository {
  constructor(private readonly db: ForgeLexDatabase) {}
  private async lock(owner: AgenticOwner, matterId: string) {
    await this.db
      .update(s.matters)
      .set({ updatedAt: sql`${s.matters.updatedAt}` })
      .where(and(eq(s.matters.tenantId, owner.tenantId), eq(s.matters.id, matterId)));
    await new MatterWriteGuard(this.db).captureRevision({ ...owner, matterId });
  }
  receipt(row: Row): Receipt {
    const delivery = AgenticTaskDeliverySchema.parse(JSON.parse(row.payloadJson));
    if (
      row.id !== `delivery:${row.executionId}` ||
      hash(row.payloadJson) !== row.contentHash ||
      delivery.contextId !== row.conversationId ||
      delivery.contextRevision !== row.contextRevision ||
      delivery.action !== 'analyze_evidence' ||
      !delivery.evidenceMatrix ||
      !row.evidenceReviewJson
    )
      throw new Error('APPROVED_CONTEXT_CHANGED');
    return savedReviewSchema.parse(JSON.parse(row.evidenceReviewJson));
  }
  async rows(owner: AgenticOwner, matterId: string, deliveryId?: string) {
    return this.db
      .select({ delivery: s.agenticTaskDeliveries })
      .from(s.agenticTaskDeliveries)
      .innerJoin(
        s.agenticConversations,
        and(
          eq(s.agenticConversations.id, s.agenticTaskDeliveries.conversationId),
          eq(s.agenticConversations.tenantId, owner.tenantId),
          eq(s.agenticConversations.userId, owner.userId),
          eq(s.agenticConversations.matterId, matterId),
        ),
      )
      .where(
        and(
          eq(s.agenticTaskDeliveries.tenantId, owner.tenantId),
          eq(s.agenticTaskDeliveries.userId, owner.userId),
          isNotNull(s.agenticTaskDeliveries.evidenceReviewJson),
          deliveryId ? eq(s.agenticTaskDeliveries.id, deliveryId) : undefined,
        ),
      )
      .orderBy(asc(s.agenticTaskDeliveries.id))
      .limit(1001);
  }
  async capture(owner: AgenticOwner, matterId: string): Promise<ApprovedItems> {
    await this.lock(owner, matterId);
    const rows = await this.rows(owner, matterId);
    if (rows.length > 1000) throw new Error('TASK_CONTEXT_LIMIT');
    const refs: ApprovedItems = [];
    for (const { delivery: row } of rows) {
      const receipt = this.receipt(row);
      for (const [itemId, decision] of Object.entries(receipt.decisions).sort(([a], [b]) => a.localeCompare(b))) {
        if (decision.action !== 'ADOPT' || !['FACT', 'EVIDENCE'].includes(decision.proposal.kind)) continue;
        if (refs.length >= 50) throw new Error('TASK_CONTEXT_LIMIT');
        const source = await this.source(
          owner,
          matterId,
          row,
          receipt,
          itemId,
          false,
          receipt.reapprovals?.[itemId]?.at(-1),
        );
        refs.push({ deliveryId: row.id, itemId, contentHash: source.contentHash });
      }
    }
    // Check dependent facts and the same payload limit used during execution, without silent truncation.
    await this.load(owner, matterId, refs);
    return refs;
  }
  async load(owner: AgenticOwner, matterId: string, raw: ApprovedItems, historical = false): Promise<TaskSource[]> {
    const refs = ApprovedItemsSchema.parse(raw);
    await this.lock(owner, matterId);
    const sources: TaskSource[] = [];
    for (const ref of refs) {
      const [found] = await this.rows(owner, matterId, ref.deliveryId);
      if (!found) throw new Error('APPROVED_CONTEXT_CHANGED');
      const receipt = this.receipt(found.delivery);
      const revisions = receipt.reapprovals?.[ref.itemId] ?? [];
      const snapshot = historical
        ? revisions.find((item) => hash(JSON.stringify(item)) === ref.contentHash)
        : revisions.at(-1);
      const source = await this.source(owner, matterId, found.delivery, receipt, ref.itemId, historical, snapshot);
      if (source.contentHash !== ref.contentHash) throw new Error('APPROVED_CONTEXT_CHANGED');
      sources.push(source);
    }
    for (const source of sources) {
      const factId = source.approvedItem?.relatedFactId;
      if (factId && !sources.some((s) => s.kind === 'CASE_FACT' && s.approvedItem?.targetId === factId))
        throw new Error('APPROVED_FACT_REQUIRED');
    }
    if (Buffer.byteLength(JSON.stringify(sources)) > 128000) throw new Error('TASK_CONTEXT_LIMIT');
    return sources;
  }
  /** Internal receipt reconstruction only. Call source() to authorize document access or reuse. */
  recordedSnapshot(
    owner: AgenticOwner,
    row: Row,
    receipt: Receipt,
    itemId: string,
    saved?: ApprovedItemSnapshot,
  ): ApprovedItemSnapshot {
    const decision = receipt.decisions[itemId],
      proposal = decision?.proposal;
    const fail = () => {
      throw new Error('APPROVED_CONTEXT_CHANGED');
    };
    if (
      !decision ||
      decision.action !== 'ADOPT' ||
      !decision.targetId ||
      decision.decidedBy !== owner.userId ||
      proposal.id !== itemId ||
      proposal.blockedReasons.length ||
      !['FACT', 'EVIDENCE'].includes(proposal.kind)
    )
      return fail();
    if (saved) {
      if (
        saved.targetId !== decision.targetId ||
        saved.kind !== proposal.kind ||
        saved.deliveryId !== row.id ||
        saved.itemId !== itemId ||
        saved.decidedBy !== owner.userId
      )
        return fail();
      return ApprovedItemSnapshotSchema.parse(saved);
    }
    const delivery = AgenticTaskDeliverySchema.parse(JSON.parse(row.payloadJson));
    const related = proposal.factItemId ? receipt.decisions[proposal.factItemId] : undefined;
    const relatedFactId =
      proposal.kind === 'EVIDENCE' && related?.action === 'ADOPT' && related.proposal.kind === 'FACT'
        ? related.targetId
        : undefined;
    if (proposal.kind === 'EVIDENCE' && !relatedFactId) return fail();
    return ApprovedItemSnapshotSchema.parse({
      deliveryId: row.id,
      itemId,
      targetId: decision.targetId,
      kind: proposal.kind,
      text: decision.text,
      status:
        proposal.kind === 'EVIDENCE' ? 'AVAILABLE' : proposal.classification === 'DISPUTED' ? 'DISPUTED' : 'ASSERTED',
      decidedBy: decision.decidedBy,
      decidedAt: decision.decidedAt,
      receiptHash: hash(decision),
      ...(proposal.relation ? { relation: proposal.relation } : {}),
      ...(relatedFactId ? { relatedFactId } : {}),
      sources: [...proposal.sources]
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        .map((ref) => {
          const original = delivery.sources.find(
            (s) => s.kind === 'DOCUMENT' && s.documentId === ref.documentId && s.versionId === ref.versionId,
          );
          if (!original) return fail();
          return { ...ref, contentHash: original.contentHash };
        }),
    });
  }
  async source(
    owner: AgenticOwner,
    matterId: string,
    row: Row,
    receipt: Receipt,
    itemId: string,
    historical = false,
    snapshot?: ApprovedItemSnapshot,
  ): Promise<TaskSource> {
    const initial = receipt.decisions[itemId];
    if (
      snapshot &&
      (!initial ||
        snapshot.targetId !== initial.targetId ||
        snapshot.deliveryId !== row.id ||
        snapshot.itemId !== itemId ||
        snapshot.kind !== initial.proposal.kind ||
        snapshot.decidedBy !== owner.userId)
    )
      throw new Error('APPROVED_CONTEXT_CHANGED');
    const d =
        snapshot && initial
          ? {
              ...initial,
              text: snapshot.text,
              decidedAt: snapshot.decidedAt,
              decidedBy: snapshot.decidedBy,
              proposal: {
                ...initial.proposal,
                sources: snapshot.sources,
                classification: snapshot.status === 'DISPUTED' ? 'DISPUTED' : 'ALLEGATION',
                relation: snapshot.relation,
              },
            }
          : initial,
      p = d?.proposal;
    const fail = () => {
      throw new Error('APPROVED_CONTEXT_CHANGED');
    };
    if (
      !d ||
      d.action !== 'ADOPT' ||
      !d.targetId ||
      d.decidedBy !== owner.userId ||
      p.id !== itemId ||
      p.blockedReasons.length ||
      !['FACT', 'EVIDENCE'].includes(p.kind)
    )
      return fail();
    const isFact = p.kind === 'FACT';
    let status: string = isFact ? (p.classification === 'DISPUTED' ? 'DISPUTED' : 'ASSERTED') : 'AVAILABLE';
    let links: { documentAnchorId: string; relation: string }[] = [];
    const related = p.factItemId ? receipt.decisions[p.factItemId] : undefined;
    const relatedFactId =
      snapshot?.relatedFactId ??
      (!isFact && related?.action === 'ADOPT' && related.proposal.kind === 'FACT' ? related.targetId : undefined);
    if (!isFact && !relatedFactId) return fail();
    if (!historical && isFact) {
      const [fact] = await this.db
        .select()
        .from(s.facts)
        .where(and(eq(s.facts.tenantId, owner.tenantId), eq(s.facts.matterId, matterId), eq(s.facts.id, d.targetId)));
      status = p.classification === 'DISPUTED' ? 'DISPUTED' : 'ASSERTED';
      if (!fact || fact.statement !== d.text || fact.status !== status || fact.createdBy !== owner.userId)
        return fail();
      links = await this.db
        .select()
        .from(s.factSourceLinks)
        .where(
          and(
            eq(s.factSourceLinks.tenantId, owner.tenantId),
            eq(s.factSourceLinks.matterId, matterId),
            eq(s.factSourceLinks.factId, d.targetId),
          ),
        );
    } else if (!historical) {
      const [proof] = await this.db
        .select()
        .from(s.evidenceItems)
        .where(
          and(
            eq(s.evidenceItems.tenantId, owner.tenantId),
            eq(s.evidenceItems.matterId, matterId),
            eq(s.evidenceItems.id, d.targetId),
          ),
        );
      status = 'AVAILABLE';
      if (
        !proof ||
        proof.title !== d.text ||
        proof.status !== status ||
        proof.evidenceType !== 'DOCUMENT' ||
        proof.createdBy !== owner.userId
      )
        return fail();
      const factLinks = await this.db
        .select()
        .from(s.evidenceLinks)
        .where(
          and(
            eq(s.evidenceLinks.tenantId, owner.tenantId),
            eq(s.evidenceLinks.matterId, matterId),
            eq(s.evidenceLinks.evidenceItemId, d.targetId),
          ),
        );
      if (
        !same(
          factLinks.map((l) => [l.factId, l.relation]),
          [[relatedFactId, p.relation]],
        )
      )
        return fail();
      links = await this.db
        .select()
        .from(s.evidenceSourceLinks)
        .where(
          and(
            eq(s.evidenceSourceLinks.tenantId, owner.tenantId),
            eq(s.evidenceSourceLinks.matterId, matterId),
            eq(s.evidenceSourceLinks.evidenceItemId, d.targetId),
          ),
        );
    }
    const relation = (r: string) =>
      isFact ? r : r === 'SUPPORTS' ? 'PROVES' : r === 'CONTRADICTS' ? 'REFUTES' : 'CONTEXT';
    const expectedLinks = [
      ...new Map(
        p.sources.map((ref) => [
          JSON.stringify([ref.anchorId, relation(ref.relation)]),
          [ref.anchorId, relation(ref.relation)],
        ]),
      ).values(),
    ];
    if (
      !historical &&
      !same(
        links.map((l) => [l.documentAnchorId, l.relation]),
        expectedLinks,
      )
    )
      return fail();
    const sources = [];
    for (const ref of [...p.sources].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) {
      await this.db
        .update(s.legalDocuments)
        .set({ updatedAt: sql`${s.legalDocuments.updatedAt}` })
        .where(
          and(
            eq(s.legalDocuments.tenantId, owner.tenantId),
            eq(s.legalDocuments.matterId, matterId),
            eq(s.legalDocuments.id, ref.documentId),
          ),
        );
      const documents = new MatterRepository(this.db);
      const current = historical
        ? await documents.getSpecificDocumentVersion(owner.tenantId, matterId, ref.documentId, ref.versionId, 'work')
        : await documents.getDocumentVersion(owner.tenantId, ref.documentId, 'work');
      const anchor = current?.anchors.find((a) => a.id === ref.anchorId);
      if (!current || current.document.matterId !== matterId || current.document.lifecycleState !== 'ACTIVE')
        throw new Error('ACCESS_REVOKED');
      const original =
        snapshot?.sources.find((s) => s.documentId === ref.documentId && s.versionId === ref.versionId) ??
        AgenticTaskDeliverySchema.parse(JSON.parse(row.payloadJson)).sources.find(
          (s) => s.kind === 'DOCUMENT' && s.documentId === ref.documentId && s.versionId === ref.versionId,
        );
      if (
        current.version.id !== ref.versionId ||
        !original ||
        current.version.contentHash !== original.contentHash ||
        hash(current.version.content) !== original.contentHash ||
        !anchor ||
        anchor.startOffset === undefined ||
        anchor.endOffset === undefined ||
        current.version.content.slice(anchor.startOffset, anchor.endOffset) !== anchor.text ||
        hash(anchor.text) !== anchor.contentHash ||
        !anchor.text.includes(ref.quote)
      )
        return fail();
      sources.push({ ...ref, contentHash: original.contentHash });
    }
    const approvedItem = ApprovedItemSnapshotSchema.parse({
      deliveryId: row.id,
      itemId,
      targetId: d.targetId,
      kind: p.kind,
      text: d.text,
      status,
      decidedBy: d.decidedBy,
      decidedAt: d.decidedAt,
      receiptHash: snapshot?.receiptHash ?? hash(d),
      ...(p.relation ? { relation: p.relation } : {}),
      ...(relatedFactId ? { relatedFactId } : {}),
      sources,
    });
    const text = JSON.stringify(approvedItem);
    return {
      id: `approved:${hash([row.id, itemId])}`,
      kind: isFact ? 'CASE_FACT' : 'CASE_EVIDENCE',
      text,
      contentHash: hash(text),
      approvedItem,
      extent: 'EXCERPT',
    };
  }
}
