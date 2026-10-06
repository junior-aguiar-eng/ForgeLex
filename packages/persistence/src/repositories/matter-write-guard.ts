import { and, eq, sql } from 'drizzle-orm';
import type { LifecycleTarget } from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';

const guardedTransactions = new WeakSet<object>();

export class MatterWriteGuard {
  constructor(private readonly db: ForgeLexDatabase) {}
  async captureRevision(target: LifecycleTarget): Promise<number> {
    const rows = await this.db.select().from(s.matters).where(and(eq(s.matters.id, target.matterId), eq(s.matters.tenantId, target.tenantId))).limit(1);
    const matter = rows[0];
    if (!matter || matter.lifecycleState === 'PURGED') throw new Error('MATTER_NOT_FOUND');
    if (matter.lifecycleState !== 'ACTIVE') throw new Error('MATTER_NOT_ACTIVE');
    if (target.documentId) {
      const docs = await this.db.select().from(s.legalDocuments).where(and(eq(s.legalDocuments.id, target.documentId), eq(s.legalDocuments.tenantId, target.tenantId), eq(s.legalDocuments.matterId, target.matterId))).limit(1);
      if (!docs[0] || docs[0].lifecycleState === 'PURGED') throw new Error('DOCUMENT_NOT_FOUND');
      if (docs[0].lifecycleState !== 'ACTIVE') throw new Error('DOCUMENT_NOT_ACTIVE');
    }
    return matter.lifecycleRevision;
  }
  async run<T>(target: LifecycleTarget, expectedMatterRevision: number, write: (tx: ForgeLexDatabase) => Promise<T>): Promise<T> {
    return this.db.transaction(async transaction => {
      const tx = transaction as unknown as ForgeLexDatabase;
      await tx.update(s.matters).set({ updatedAt: sql`${s.matters.updatedAt}` }).where(and(eq(s.matters.id, target.matterId), eq(s.matters.tenantId, target.tenantId)));
      const guard = new MatterWriteGuard(tx);
      if (await guard.captureRevision(target) !== expectedMatterRevision) throw new Error('LIFECYCLE_CONFLICT');
      guardedTransactions.add(tx);
      try { return await write(tx); } finally { guardedTransactions.delete(tx); }
    });
  }
}

/** Repositories re-enter their own method with a transaction-bound instance. */
export function isMatterWriteTransaction(db: ForgeLexDatabase): boolean { return guardedTransactions.has(db); }
export async function withMatterWrite<T>(db: ForgeLexDatabase, target: LifecycleTarget, write: (tx: ForgeLexDatabase) => Promise<T>): Promise<T> {
  const guard = new MatterWriteGuard(db);
  const revision = await guard.captureRevision(target);
  if (isMatterWriteTransaction(db)) return write(db);
  return guard.run(target, revision, write);
}
