import { and, eq } from 'drizzle-orm';
import {
  EvidenceReapprovalCommandSchema,
  type AgenticOwner,
  type EvidenceReapproval,
  type EvidenceReapprovalCommand,
  type ApprovedItemSnapshot,
} from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';
import { ApprovedCaseContextRepository } from './approved-case-context-repository.js';
import { currentApprovedItem } from './current-approved-item.js';
import { evidenceHash as hash } from './evidence-review-items.js';
import { withMatterWrite, MatterWriteGuard } from './matter-write-guard.js';
import { lockAgenticTenant } from './agentic-tenant-guard.js';
import type { AuthorizeNativeTask } from './native-case-task-repository.js';

/** Session-only human approval; deliberately absent from the agent tool registry. */
export class EvidenceReapprovalRepository {
  constructor(
    private readonly db: ForgeLexDatabase,
    private readonly authorize: AuthorizeNativeTask,
    private readonly authorizeExecution: (
      owner: AgenticOwner,
      executionId: string,
      db: ForgeLexDatabase,
    ) => Promise<void> = async () => {},
  ) {}

  private async guarded<T>(
    owner: AgenticOwner,
    matterId: string,
    action: (db: ForgeLexDatabase) => Promise<T>,
  ): Promise<T> {
    await this.authorize(owner, undefined, this.db);
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as ForgeLexDatabase;
      await lockAgenticTenant(db, owner.tenantId);
      await this.authorize(owner, matterId, db);
      return withMatterWrite(db, { ...owner, matterId }, async (tx) => {
        const result = await action(tx);
        await this.authorize(owner, matterId, tx);
        return result;
      });
    });
  }
  private async records(db: ForgeLexDatabase, owner: AgenticOwner, matterId: string) {
    const repo = new ApprovedCaseContextRepository(db);
    const rows = await repo.rows(owner, matterId);
    if (rows.length > 1000) throw new Error('TASK_CONTEXT_LIMIT');
    const records = [];
    for (const { delivery: row } of rows) {
      await this.authorizeExecution(owner, row.executionId, db);
      records.push({ row, receipt: repo.receipt(row) });
    }
    return records;
  }
  private async build(
    db: ForgeLexDatabase,
    owner: AgenticOwner,
    matterId: string,
    records: Awaited<ReturnType<EvidenceReapprovalRepository['records']>>,
  ): Promise<EvidenceReapproval> {
    const repo = new ApprovedCaseContextRepository(db);
    const all: EvidenceReapproval['items'] = [];
    const changed = new Set<string>();
    for (const { row, receipt } of records) {
      for (const [itemId, decision] of Object.entries(receipt.decisions).sort(([a], [b]) => a.localeCompare(b))) {
        if (decision.action !== 'ADOPT' || !['FACT', 'EVIDENCE'].includes(decision.proposal.kind)) continue;
        if (all.length >= 50) throw new Error('TASK_CONTEXT_LIMIT');
        const saved = receipt.reapprovals?.[itemId]?.at(-1);
        const previous = repo.recordedSnapshot(owner, row, receipt, itemId, saved);
        const item: EvidenceReapproval['items'][number] = { deliveryId: row.id, itemId, previous };
        try {
          await repo.source(owner, matterId, row, receipt, itemId, true, saved);
        } catch (error) {
          if (!(error instanceof Error) || !['APPROVED_CONTEXT_CHANGED', 'ACCESS_REVOKED'].includes(error.message))
            throw error;
          // The case statement remains reviewable; unavailable historical excerpts are not disclosed.
          item.previous = { ...previous, sources: [] };
          item.previousSourcesUnavailable = true;
        }
        try {
          item.current = await currentApprovedItem(db, owner, matterId, previous);
          await repo.source(owner, matterId, row, receipt, itemId, false, item.current);
          if (hash(item.current) !== hash(previous)) changed.add(previous.targetId);
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !['EVIDENCE_SOURCE_UNAVAILABLE', 'APPROVED_CONTEXT_CHANGED', 'ACCESS_REVOKED'].includes(error.message)
          )
            throw error;
          item.current = undefined;
          item.blocked =
            'Confira o item e seus vínculos no caso. A condição atual ou uma fonte não permite nova aprovação.';
          changed.add(previous.targetId);
        }
        all.push(item);
      }
    }
    for (const item of all) {
      const oldFact = all.find(
        (i) => i.previous.kind === 'FACT' && i.previous.targetId === item.previous.relatedFactId,
      );
      item.previousRelatedFactText = oldFact?.previous.text;
      if (item.current?.kind !== 'EVIDENCE') continue;
      const fact = all.find((i) => i.previous.kind === 'FACT' && i.previous.targetId === item.current?.relatedFactId);
      item.relatedFactText = fact?.current?.text;
      if (!fact?.current) {
        item.blocked = 'Confira e aprove o fato relacionado antes de aprovar esta prova.';
        changed.add(item.previous.targetId);
      }
    }
    const lifecycle = await new MatterWriteGuard(db).captureRevision({ ...owner, matterId });
    const reviewToken = hash([
      owner,
      matterId,
      lifecycle,
      records.map((r) => [r.row.id, hash(r.row.evidenceReviewJson!)]),
      all,
    ]);
    if (Buffer.byteLength(JSON.stringify(all)) > 512000) throw new Error('TASK_CONTEXT_LIMIT');
    return { matterId, reviewToken, items: all.filter((item) => changed.has(item.previous.targetId)) };
  }
  async preview(owner: AgenticOwner, matterId: string) {
    return this.guarded(owner, matterId, async (db) =>
      this.build(db, owner, matterId, await this.records(db, owner, matterId)),
    );
  }
  async approve(owner: AgenticOwner, matterId: string, raw: EvidenceReapprovalCommand): Promise<EvidenceReapproval> {
    const input = EvidenceReapprovalCommandSchema.parse(raw),
      inputHash = hash(input);
    return this.guarded(owner, matterId, async (db) => {
      const records = await this.records(db, owner, matterId);
      const prior = records.flatMap((r) => r.receipt.reapprovalCommands?.[input.commandId] ?? []);
      if (prior.length) {
        if (prior.some((p) => p.inputHash !== inputHash)) throw new Error('EVIDENCE_COMMAND_CONFLICT');
        // A successful retry acknowledges the stored decision even if the case has since changed again.
        return { matterId, reviewToken: input.reviewToken, items: [], isReplay: true };
      }
      const review = await this.build(db, owner, matterId, records);
      if (review.reviewToken !== input.reviewToken) throw new Error('EVIDENCE_REVIEW_CONFLICT');
      const selected = input.items.map((ref) => {
        const item = review.items.find((i) => i.itemId === ref.itemId && i.deliveryId === ref.deliveryId);
        if (!item?.current || item.blocked) throw new Error('EVIDENCE_SOURCE_UNAVAILABLE');
        return item;
      });
      for (const item of selected) {
        const pendingFact = review.items.find((i) => i.previous.targetId === item.current!.relatedFactId);
        if (pendingFact && !selected.includes(pendingFact)) throw new Error('APPROVED_FACT_REQUIRED');
      }
      const decidedAt = new Date().toISOString();
      for (const record of records) {
        const items = selected.filter((i) => i.deliveryId === record.row.id);
        if (!items.length) continue;
        const saved = record.receipt;
        saved.reapprovals ??= {};
        saved.reapprovalCommands ??= {};
        for (const item of items) {
          const snapshot: ApprovedItemSnapshot = {
            ...item.current!,
            decidedAt,
            decidedBy: owner.userId,
            receiptHash: hash([item.current, inputHash, decidedAt, owner.userId]),
          };
          const history = (saved.reapprovals[item.itemId] ??= []);
          if (history.length >= 100) throw new Error('EVIDENCE_REVIEW_LIMIT');
          history.push(snapshot);
        }
        saved.revision++;
        saved.reapprovalCommands[input.commandId] = { inputHash };
        const evidenceReviewJson = JSON.stringify(saved);
        if (Buffer.byteLength(evidenceReviewJson) > 1000000) throw new Error('EVIDENCE_REVIEW_LIMIT');
        await db
          .update(s.agenticTaskDeliveries)
          .set({ evidenceReviewJson })
          .where(
            and(
              eq(s.agenticTaskDeliveries.id, record.row.id),
              eq(s.agenticTaskDeliveries.tenantId, owner.tenantId),
              eq(s.agenticTaskDeliveries.userId, owner.userId),
            ),
          );
      }
      return { matterId, reviewToken: review.reviewToken, items: [] };
    });
  }
}
