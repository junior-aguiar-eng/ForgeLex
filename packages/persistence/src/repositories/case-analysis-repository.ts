import { and, eq, desc } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import {
  CaseAnalysisInputSchema,
  AnalysisDecisionInputSchema,
  type CaseAnalysisInput,
  type AnalysisReceipt,
  type AnalysisReview,
  type AnalysisItem,
  type AnalysisDecisionInput,
  type CaseAiOwner,
  type CaseAiReader,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { CaseAiAccessRepository } from './case-ai-access-repository.js';
import { MatterRepository } from './matter-repository.js';
import { FactsEvidenceRepository } from './facts-evidence-repository.js';
import { LegalIssueRepository } from './legal-issue-repository.js';
import { withMatterWrite } from './matter-write-guard.js';

type Row = typeof s.caseAnalysisReceipts.$inferSelect;
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
function review(r: Row): AnalysisReview {
  return {
    id: r.id,
    matterId: r.matterId,
    revision: r.revision,
    objective: r.objective,
    receivedAt: r.receivedAt,
    application: { clientId: r.oauthClientId },
    items: JSON.parse(r.itemsJson),
    decisions: JSON.parse(r.decisionsJson),
  };
}
function receipt(r: Row, isReplay = false): AnalysisReceipt {
  return {
    id: r.id,
    matterId: r.matterId,
    receivedAt: r.receivedAt,
    reviewPending: true,
    isReplay,
    openPath: `/app/casos?caso=${r.matterId}`,
  };
}
export class CaseAnalysisRepository {
  constructor(private readonly db: ForgeLexDatabase) {}
  private scope(o: CaseAiOwner, matterId: string) {
    return and(
      eq(s.caseAnalysisReceipts.tenantId, o.tenantId),
      eq(s.caseAnalysisReceipts.userId, o.userId),
      eq(s.caseAnalysisReceipts.matterId, matterId),
    );
  }
  async receive(
    r: CaseAiReader,
    raw: CaseAnalysisInput,
    options: { signal?: AbortSignal; revalidate?: () => Promise<void> } = {},
  ): Promise<AnalysisReceipt> {
    const input = CaseAnalysisInputSchema.parse(raw);
    const abort = () => options.signal?.throwIfAborted();
    abort();
    return withMatterWrite(this.db, { tenantId: r.tenantId, matterId: input.matterId }, async (db) => {
      const access = new CaseAiAccessRepository(db);
      const grant = await access.assertActive(r, input.matterId);
      if (grant.revision !== input.expectedGrantRevision) throw new Error('ANALYSIS_PERMISSION_STALE');
      if (!grant.analysisPermission.enabled) throw new Error('ANALYSIS_RECEIVING_NOT_AUTHORIZED');
      if (grant.analysisPermission.objective !== input.objective) throw new Error('ANALYSIS_OBJECTIVE_STALE');
      const records = await access.loadSelection(r, input.matterId, grant.selection);
      for (const item of input.items)
        for (const ref of item.sources) {
          const field = records
            .find((d) => d.kind === 'DOCUMENT' && d.id === ref.documentId)
            ?.fields.find((f) => f.versionId === ref.versionId && f.anchorId === ref.anchorId);
          if (!field || !field.text.includes(ref.quote)) throw new Error('ANALYSIS_REFERENCE_INVALID');
        }
      const keyHash = hash(input.idempotencyKey);
      const { idempotencyKey: _, ...payload } = input;
      const payloadHash = hash(payload);
      const previous = await db
        .select()
        .from(s.caseAnalysisReceipts)
        .where(
          and(
            this.scope(r, input.matterId),
            eq(s.caseAnalysisReceipts.oauthClientId, r.oauthConnection.clientId),
            eq(s.caseAnalysisReceipts.oauthGrantedAt, r.oauthConnection.grantedAt),
            eq(s.caseAnalysisReceipts.keyHash, keyHash),
          ),
        )
        .limit(1);
      await options.revalidate?.();
      abort();
      if (previous[0]) {
        if (previous[0].payloadHash !== payloadHash) throw new Error('ANALYSIS_RECEIPT_CONFLICT');
        return receipt(previous[0], true);
      }
      const row: Row = {
        id: randomUUID(),
        tenantId: r.tenantId,
        userId: r.userId,
        oauthClientId: r.oauthConnection.clientId,
        oauthGrantedAt: r.oauthConnection.grantedAt,
        matterId: input.matterId,
        grantRevision: grant.revision,
        keyHash,
        payloadHash,
        objective: input.objective,
        itemsJson: JSON.stringify(input.items),
        decisionsJson: '{}',
        revision: 1,
        receivedAt: new Date().toISOString(),
      };
      await db.insert(s.caseAnalysisReceipts).values(row);
      abort();
      return receipt(row);
    });
  }
  async list(o: CaseAiOwner, matterId: string): Promise<AnalysisReview[]> {
    if (!(await new MatterRepository(this.db).getMatter(o.tenantId, matterId))) throw new Error('MATTER_NOT_FOUND');
    return (
      await this.db
        .select()
        .from(s.caseAnalysisReceipts)
        .where(this.scope(o, matterId))
        .orderBy(desc(s.caseAnalysisReceipts.receivedAt))
        .limit(50)
    ).map(review);
  }
  async get(o: CaseAiOwner, matterId: string, id: string): Promise<AnalysisReview> {
    if (!(await new MatterRepository(this.db).getMatter(o.tenantId, matterId))) throw new Error('MATTER_NOT_FOUND');
    const rows = await this.db
      .select()
      .from(s.caseAnalysisReceipts)
      .where(and(this.scope(o, matterId), eq(s.caseAnalysisReceipts.id, id)))
      .limit(1);
    if (!rows[0]) throw new Error('ANALYSIS_NOT_FOUND');
    return review(rows[0]);
  }
  private async validateSources(o: CaseAiOwner, matterId: string, item: AnalysisItem) {
    const matters = new MatterRepository(this.db);
    for (const ref of item.sources) {
      const d = await matters.getSpecificDocumentVersion(o.tenantId, matterId, ref.documentId, ref.versionId);
      if (
        !d ||
        d.document.lifecycleState !== 'ACTIVE' ||
        !d.anchors.some((a) => a.id === ref.anchorId && a.text.includes(ref.quote))
      )
        throw new Error('ANALYSIS_SOURCE_UNAVAILABLE');
    }
  }
  async decide(o: CaseAiOwner, matterId: string, id: string, raw: AnalysisDecisionInput): Promise<AnalysisReview> {
    const input = AnalysisDecisionInputSchema.parse(raw);
    return withMatterWrite(this.db, { tenantId: o.tenantId, matterId }, async (db) => {
      const repo = new CaseAnalysisRepository(db);
      const saved = await repo.get(o, matterId, id);
      if (saved.revision !== input.expectedRevision) throw new Error('ANALYSIS_REVIEW_CONFLICT');
      const ordered = [...input.decisions].sort(
        (a, b) =>
          Number(saved.items.find((i) => i.id === a.itemId)?.kind !== 'FACT') -
          Number(saved.items.find((i) => i.id === b.itemId)?.kind !== 'FACT'),
      );
      const facts = new FactsEvidenceRepository(db);
      const issues = new LegalIssueRepository(db);
      const ctx = { tenantId: o.tenantId, matterId, createdBy: o.userId };
      for (const decision of ordered) {
        const item = saved.items.find((i) => i.id === decision.itemId);
        if (!item) throw new Error('ANALYSIS_ITEM_INVALID');
        if (saved.decisions[item.id]) throw new Error('ANALYSIS_ALREADY_DECIDED');
        const text = decision.text ?? item.text;
        let targetId: string | undefined;
        if (decision.action === 'ADOPT') {
          await repo.validateSources(o, matterId, item);
          if (item.kind === 'FACT') {
            targetId = (
              await facts.createFact({
                ...ctx,
                statement: text,
                status: item.classification === 'DISPUTED' ? 'DISPUTED' : 'ASSERTED',
              })
            ).id;
            for (const ref of item.sources)
              await facts.linkFactToAnchor({
                ...ctx,
                factId: targetId,
                documentAnchorId: ref.anchorId,
                relation: ref.relation,
                note: `Análise ${id}: ${item.classification}`,
              });
          } else if (item.kind === 'EVIDENCE') {
            const factId = item.factItemId ? saved.decisions[item.factItemId]?.targetId : undefined;
            if (item.factItemId && !factId) throw new Error('ANALYSIS_FACT_REQUIRED');
            targetId = (await facts.createEvidenceItem({ ...ctx, title: text, evidenceType: 'DOCUMENT' })).id;
            for (const ref of item.sources)
              await facts.linkEvidenceToAnchor({
                ...ctx,
                evidenceItemId: targetId,
                documentAnchorId: ref.anchorId,
                relation:
                  ref.relation === 'SUPPORTS' ? 'PROVES' : ref.relation === 'CONTRADICTS' ? 'REFUTES' : 'CONTEXT',
              });
            if (factId)
              await facts.linkEvidenceToFact({ ...ctx, factId, evidenceItemId: targetId, relation: item.relation! });
          } else if (item.kind === 'TIMELINE')
            targetId = (
              await facts.createTimelineEvent({
                ...ctx,
                title: text,
                eventDate: item.eventDate!,
                sourceAnchorId: item.sources[0].anchorId,
              })
            ).id;
          else
            targetId = (await issues.createIssue({ ...ctx, statement: item.kind === 'GAP' ? `Lacuna: ${text}` : text }))
              .id;
        }
        saved.decisions[item.id] = {
          action: decision.action,
          text,
          targetId,
          decidedAt: new Date().toISOString(),
          decidedBy: o.userId,
        };
      }
      await db
        .update(s.caseAnalysisReceipts)
        .set({ revision: saved.revision + 1, decisionsJson: JSON.stringify(saved.decisions) })
        .where(
          and(
            repo.scope(o, matterId),
            eq(s.caseAnalysisReceipts.id, id),
            eq(s.caseAnalysisReceipts.revision, saved.revision),
          ),
        );
      return { ...saved, revision: saved.revision + 1 };
    });
  }
}
