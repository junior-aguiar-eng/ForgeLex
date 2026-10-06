import { and, eq, sql } from 'drizzle-orm';
import { LifecycleCommandSchema, type LifecycleAction, type LifecycleActor, type LifecycleCommand, type LifecycleResult, type LifecycleTarget, type LifecycleState } from '@forgelex/domain';
import type { ForgeLexDatabase } from '../db.js';
import * as s from '../schema/schema.js';

export function assertLifecycleManager(createdBy: string, actor: LifecycleActor): void {
  if (actor.authType !== 'web_session' || !actor.scopes.includes('matter:write') || (actor.userId !== createdBy && actor.role !== 'owner' && actor.role !== 'admin')) throw new Error('LIFECYCLE_FORBIDDEN');
}

export class MatterLifecycleRepository {
  constructor(private readonly db: ForgeLexDatabase) {}
  async assertCanManage(target: LifecycleTarget, actor: LifecycleActor): Promise<void> {
    const rows = await this.db.select().from(s.matters).where(and(eq(s.matters.id, target.matterId), eq(s.matters.tenantId, target.tenantId))).limit(1);
    if (!rows[0] || rows[0].lifecycleState === 'PURGED') throw new Error('MATTER_NOT_FOUND');
    assertLifecycleManager(rows[0].createdBy, actor);
    if (target.documentId) {
      const docs = await this.db.select().from(s.legalDocuments).where(and(eq(s.legalDocuments.id, target.documentId), eq(s.legalDocuments.matterId, target.matterId), eq(s.legalDocuments.tenantId, target.tenantId))).limit(1);
      if (!docs[0] || docs[0].lifecycleState === 'PURGED') throw new Error('DOCUMENT_NOT_FOUND');
    }
  }
  async transition(target: LifecycleTarget, actor: LifecycleActor, action: LifecycleAction, command: LifecycleCommand): Promise<LifecycleResult> {
    LifecycleCommandSchema.parse(command);
    return this.db.transaction(async tx => {
      const db = tx as unknown as ForgeLexDatabase;
      // The no-op update serializes every lifecycle operation on the parent case.
      const matters = await tx.update(s.matters).set({ updatedAt: sql`${s.matters.updatedAt}` }).where(and(eq(s.matters.id, target.matterId), eq(s.matters.tenantId, target.tenantId))).returning();
      const matter = matters[0];
      if (!matter || matter.lifecycleState === 'PURGED') throw new Error('MATTER_NOT_FOUND');
      assertLifecycleManager(matter.createdBy, actor);
      if (target.documentId && matter.lifecycleState !== 'ACTIVE') throw new Error('MATTER_NOT_ACTIVE');
      const table = target.documentId ? s.legalDocuments : s.matters;
      const id = target.documentId ?? target.matterId;
      const predicate = and(eq(table.id, id), eq(table.tenantId, target.tenantId), ...(target.documentId ? [eq(s.legalDocuments.matterId, target.matterId)] : []));
      const records = await db.select().from(table).where(predicate).limit(1);
      const row = records[0];
      if (!row || row.lifecycleState === 'PURGED') throw new Error('DOCUMENT_NOT_FOUND');
      if (row.lifecycleRevision !== command.expectedLifecycleRevision) throw new Error('LIFECYCLE_CONFLICT');
      const previous = row.lifecycleState as LifecycleState;
      let state: LifecycleState;
      if (action === 'archive' && previous === 'ACTIVE') state = 'ARCHIVED';
      else if (action === 'trash' && (previous === 'ACTIVE' || previous === 'ARCHIVED')) state = 'TRASHED';
      else if (action === 'restore' && previous === 'ARCHIVED') state = 'ACTIVE';
      else if (action === 'restore' && previous === 'TRASHED' && (row.previousLifecycleState === 'ACTIVE' || row.previousLifecycleState === 'ARCHIVED')) state = row.previousLifecycleState;
      else throw new Error('LIFECYCLE_CONFLICT');
      const now = new Date().toISOString();
      const changes = {
        lifecycleState: state, lifecycleRevision: row.lifecycleRevision + 1, updatedAt: now,
        ...(action === 'archive' ? { archivedAt: now, archivedBy: actor.userId } : {}),
        ...(action === 'trash' ? { previousLifecycleState: previous, trashedAt: now, trashedBy: actor.userId } : {}),
        ...(action === 'restore' ? { restoredAt: now, restoredBy: actor.userId, ...(previous === 'TRASHED' ? { previousLifecycleState: null, trashedAt: null, trashedBy: null } : {}), ...(state === 'ACTIVE' ? { archivedAt: null, archivedBy: null } : {}) } : {}),
      };
      if (target.documentId) await db.update(s.legalDocuments).set(changes).where(predicate);
      else await db.update(s.matters).set({ ...changes,
        ...(action === 'archive' ? { status: 'ARCHIVED', previousBusinessStatus: matter.status } : {}),
        ...(action === 'restore' && state === 'ACTIVE' ? { status: matter.previousBusinessStatus ?? matter.status, previousBusinessStatus: null } : {}),
      }).where(predicate);
      if (action === 'archive' || action === 'trash') {
        const grants = await db.select().from(s.caseAiAccessGrants).where(and(eq(s.caseAiAccessGrants.tenantId, target.tenantId), eq(s.caseAiAccessGrants.matterId, target.matterId), eq(s.caseAiAccessGrants.status, 'ACTIVE')));
        for (const grant of grants) {
          const selection = JSON.parse(grant.selectionJson) as { documents: { documentId: string }[] };
          if (target.documentId && !selection.documents.some(doc => doc.documentId === target.documentId)) continue;
          await db.update(s.caseAiAccessGrants).set({ status: 'REVOKED', revision: grant.revision + 1, updatedAt: now, revokedAt: now }).where(eq(s.caseAiAccessGrants.id, grant.id));
        }
      }
      return { id, lifecycleState: state, lifecycleRevision: changes.lifecycleRevision,
        archivedAt: action === 'archive' ? now : state === 'ACTIVE' ? undefined : row.archivedAt ?? undefined,
        trashedAt: action === 'trash' ? now : undefined,
      };
    });
  }
}
