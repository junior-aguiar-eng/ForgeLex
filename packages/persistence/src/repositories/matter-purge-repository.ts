import type { Client } from '@libsql/client';
import type { LifecycleTarget, LifecycleActor, PurgeCommand, LifecycleResult, MatterPurgeIntent } from '@forgelex/domain';
import { PurgeCommandSchema } from '@forgelex/domain';
import { assertLifecycleManager } from './matter-lifecycle-repository.js';
import { createHash, randomUUID } from 'node:crypto';

interface Executor { execute(statement: { sql: string; args: (string | number | null)[] }): Promise<{ rows: unknown[]; rowsAffected: number }>; }
interface PurgeOperation { operationId: string; result: LifecycleResult; }
const directChildren = ['citation_anchors', 'draft_review_findings', 'draft_review_runs', 'draft_ai_receipts', 'case_ai_access_grants', 'draft_sections', 'draft_versions', 'drafts', 'matter_authority_verifications', 'matter_authorities', 'legal_theses', 'research_memos', 'legal_issues', 'evidence_links', 'evidence_source_links', 'evidence_items', 'fact_source_links', 'timeline_events', 'facts', 'workflow_checkpoints', 'research_search_history'] as const;
const queries = (target: LifecycleTarget) => [
  ...['draft_approval_tokens', 'draft_approval_decisions'].map(table => ({ table, where: 'tenant_id=? AND request_id IN (SELECT id FROM draft_approval_requests WHERE tenant_id=? AND matter_id=?)', args: [target.tenantId, target.tenantId, target.matterId] })),
  { table: 'draft_approval_requests', where: 'tenant_id=? AND matter_id=?', args: [target.tenantId, target.matterId] },
  ...directChildren.map(table => ({ table, where: 'tenant_id=? AND matter_id=?', args: [target.tenantId, target.matterId] })),
  { table: 'document_anchors', where: 'document_version_id IN (SELECT id FROM document_versions WHERE document_id IN (SELECT id FROM legal_documents WHERE tenant_id=? AND matter_id=?))', args: [target.tenantId, target.matterId] },
  { table: 'document_versions', where: 'document_id IN (SELECT id FROM legal_documents WHERE tenant_id=? AND matter_id=?)', args: [target.tenantId, target.matterId] },
  { table: 'legal_documents', where: 'tenant_id=? AND matter_id=?', args: [target.tenantId, target.matterId] },
  ...['approvals', 'checkpoints', 'session_messages'].map(table => ({ table, where: 'session_id IN (SELECT id FROM sessions WHERE tenant_id=? AND matter_id=?)', args: [target.tenantId, target.matterId] })),
  { table: 'sessions', where: 'tenant_id=? AND matter_id=?', args: [target.tenantId, target.matterId] },
];

export class MatterPurgeRepository {
  constructor(private readonly client: Client) {}
  async assertCanManage(target: LifecycleTarget, actor: LifecycleActor): Promise<void> {
    const rows = await this.client.execute({ sql: 'SELECT created_by FROM matters WHERE id=? AND tenant_id=?', args: [target.matterId, target.tenantId] });
    if (!rows.rows[0]) throw new Error('MATTER_NOT_FOUND');
    assertLifecycleManager(String(rows.rows[0].created_by), actor);
  }
  async findCommitted(target: LifecycleTarget, actor: LifecycleActor, expectedRevision: number, fingerprint: string): Promise<PurgeOperation | undefined> {
    await this.assertCanManage(target, actor);
    const records = await this.client.execute({ sql: `SELECT * FROM matter_lifecycle_purge_operations WHERE tenant_id=? AND matter_id=? AND ${target.documentId ? 'document_id=?' : 'document_id IS NULL'} AND expected_lifecycle_revision=? AND fingerprint=? AND local_state='COMMITTED'`, args: [target.tenantId, target.matterId, ...(target.documentId ? [target.documentId] : []), expectedRevision, fingerprint] });
    const row = records.rows[0];
    if (!row) return undefined;
    return { operationId: String(row.operation_id), result: { id: target.documentId ?? target.matterId, lifecycleState: 'PURGED', lifecycleRevision: expectedRevision + 1, purgedAt: String(row.completed_at) } };
  }
  async purge(target: LifecycleTarget, actor: LifecycleActor, command: PurgeCommand, intent: MatterPurgeIntent): Promise<LifecycleResult> {
    PurgeCommandSchema.parse(command);
    if (intent.target.tenantId !== target.tenantId || intent.target.matterId !== target.matterId || intent.target.documentId !== target.documentId || intent.expectedLifecycleRevision !== command.expectedLifecycleRevision) throw new Error('PURGE_INTENT_INVALID');
    const tx = await this.client.transaction();
    let commitStarted = false;
    try {
      await tx.execute({ sql: 'UPDATE matters SET updated_at=updated_at WHERE id=? AND tenant_id=?', args: [target.matterId, target.tenantId] });
      const cases = await tx.execute({ sql: 'SELECT * FROM matters WHERE id=? AND tenant_id=?', args: [target.matterId, target.tenantId] });
      const matter = cases.rows[0];
      if (!matter || matter.lifecycle_state === 'PURGED') throw new Error('MATTER_NOT_FOUND');
      assertLifecycleManager(String(matter.created_by), actor);
      if (target.documentId && matter.lifecycle_state !== 'ACTIVE') throw new Error('MATTER_NOT_ACTIVE');
      const targetRows = target.documentId ? await tx.execute({ sql: 'SELECT * FROM legal_documents WHERE id=? AND tenant_id=? AND matter_id=?', args: [target.documentId, target.tenantId, target.matterId] }) : cases;
      const row = targetRows.rows[0];
      if (!row) throw new Error('DOCUMENT_NOT_FOUND');
      if (row.lifecycle_state !== 'TRASHED' || Number(row.lifecycle_revision) !== command.expectedLifecycleRevision) throw new Error('LIFECYCLE_CONFLICT');
      if (command.confirmation !== (target.documentId ?? String(row.title))) throw new Error('PURGE_CONFIRMATION_REQUIRED');
      const now = new Date().toISOString();
      const held = await tx.execute({ sql: `SELECT r.id FROM retention_exceptions r JOIN account_closures a ON a.id=r.closure_id WHERE a.tenant_id=? AND r.status='ACTIVE' AND r.starts_at<=? AND (r.ends_at IS NULL OR r.ends_at>?) AND r.category IN (${target.documentId ? "'MATTERS','DOCUMENTS'" : "'MATTERS','DOCUMENTS','SESSIONS','WORKFLOWS','RESEARCH_HISTORY'"}) LIMIT 1`, args: [target.tenantId, now, now] });
      if (held.rows.length) throw new Error('PURGE_RETENTION_HOLD');
      const counts = await this.apply(tx as unknown as Executor, target, command.expectedLifecycleRevision + 1, actor.userId, now);
      await tx.execute({ sql: 'INSERT INTO matter_lifecycle_purge_operations(operation_id,tenant_id,matter_id,document_id,expected_lifecycle_revision,fingerprint,local_state,prepared_at,completed_at,counts_json) VALUES(?,?,?,?,?,?,?,?,?,?)', args: [intent.operationId, target.tenantId, target.matterId, target.documentId ?? null, intent.expectedLifecycleRevision, intent.fingerprint, 'COMMITTED', intent.preparedAt, now, JSON.stringify(counts)] });
      const metadata = JSON.stringify({ matterId: target.matterId, documentId: target.documentId, operationId: intent.operationId, action: 'purge', result: 'COMMITTED', lifecycleRevision: command.expectedLifecycleRevision + 1, counts });
      await tx.execute({ sql: 'INSERT INTO audit_logs(id,session_id,tenant_id,user_id,tool_name,duration_ms,status,payload_hash,cost_metadata,created_at) VALUES(?,?,?,?,?,0,?,?,?,?)', args: [randomUUID(), `matter_${target.matterId}`, target.tenantId, actor.userId, 'matter.lifecycle.purge', 'SUCCESS', createHash('sha256').update(metadata).digest('hex'), metadata, now] });
      commitStarted = true;
      await tx.commit();
      return { id: target.documentId ?? target.matterId, lifecycleState: 'PURGED', lifecycleRevision: command.expectedLifecycleRevision + 1, purgedAt: now };
    } catch (error) {
      if (commitStarted) throw Object.assign(new Error('PURGE_OUTCOME_UNKNOWN'), { cause: error });
      try { await tx.rollback(); }
      catch { throw Object.assign(new Error('PURGE_OUTCOME_UNKNOWN'), { cause: error }); }
      try {
        await this.client.execute({ sql: 'INSERT INTO matter_lifecycle_purge_operations(operation_id,tenant_id,matter_id,document_id,expected_lifecycle_revision,fingerprint,local_state,prepared_at,completed_at,counts_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING', args: [intent.operationId, target.tenantId, target.matterId, target.documentId ?? null, intent.expectedLifecycleRevision, intent.fingerprint, 'ROLLED_BACK', intent.preparedAt, new Date().toISOString(), '{}'] });
      } catch { /* The verified rollback still permits a durable ABORTED terminal. */ }
      throw Object.assign(error instanceof Error ? error : new Error('PURGE_FAILED'), { rollbackVerified: true });
    }
  }
  private async apply(tx: Executor, target: LifecycleTarget, revision: number, actor: string, now: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (target.documentId) {
      const args = [target.documentId, target.tenantId, target.matterId];
      const docs = 'SELECT id FROM legal_documents WHERE id=? AND tenant_id=? AND matter_id=?';
      counts.anchors = (await tx.execute({ sql: `UPDATE document_anchors SET text='',start_offset=0,end_offset=1 WHERE document_version_id IN (SELECT id FROM document_versions WHERE document_id IN (${docs}))`, args })).rowsAffected;
      counts.versions = (await tx.execute({ sql: `UPDATE document_versions SET content='' WHERE document_id IN (${docs})`, args })).rowsAffected;
      counts.documents = (await tx.execute({ sql: "UPDATE legal_documents SET lifecycle_state='PURGED',lifecycle_revision=CASE WHEN lifecycle_revision>? THEN lifecycle_revision ELSE ? END,title='Documento excluído',original_filename='',mime_type='application/octet-stream',byte_size=0,purged_at=COALESCE(purged_at,?),purged_by=COALESCE(purged_by,?),updated_at=? WHERE id=? AND tenant_id=? AND matter_id=?", args: [revision, revision, now, actor, now, ...args] })).rowsAffected;
    } else {
      for (const query of queries(target)) counts[query.table] = (await tx.execute({ sql: `DELETE FROM ${query.table} WHERE ${query.where}`, args: query.args })).rowsAffected;
      counts.matters = (await tx.execute({ sql: "UPDATE matters SET lifecycle_state='PURGED',lifecycle_revision=CASE WHEN lifecycle_revision>? THEN lifecycle_revision ELSE ? END,title='',description=NULL,client_id=NULL,practice_area=NULL,jurisdiction=NULL,status='ARCHIVED',previous_business_status=NULL,purged_at=COALESCE(purged_at,?),purged_by=COALESCE(purged_by,?),updated_at=? WHERE id=? AND tenant_id=?", args: [revision, revision, now, actor, now, target.matterId, target.tenantId] })).rowsAffected;
    }
    return counts;
  }
  async localOutcome(operationId: string): Promise<'committed' | 'rolled_back' | 'unknown'> {
    const rows = await this.client.execute({ sql: 'SELECT local_state FROM matter_lifecycle_purge_operations WHERE operation_id=?', args: [operationId] });
    return rows.rows[0]?.local_state === 'COMMITTED' ? 'committed' : rows.rows[0]?.local_state === 'ROLLED_BACK' ? 'rolled_back' : 'unknown';
  }
  async reapply(intent: MatterPurgeIntent): Promise<void> {
    const tx = await this.client.transaction();
    try {
      await tx.execute({ sql: 'UPDATE matters SET updated_at=updated_at WHERE id=? AND tenant_id=?', args: [intent.target.matterId, intent.target.tenantId] });
      const existingCase = await tx.execute({ sql: 'SELECT id FROM matters WHERE id=? AND tenant_id=?', args: [intent.target.matterId, intent.target.tenantId] });
      await this.apply(tx as unknown as Executor, intent.target, intent.expectedLifecycleRevision + 1, 'restore_journal', intent.preparedAt);
      if (existingCase.rows.length) await tx.execute({ sql: 'INSERT INTO matter_lifecycle_purge_operations(operation_id,tenant_id,matter_id,document_id,expected_lifecycle_revision,fingerprint,local_state,prepared_at,completed_at,counts_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO NOTHING', args: [intent.operationId, intent.target.tenantId, intent.target.matterId, intent.target.documentId ?? null, intent.expectedLifecycleRevision, intent.fingerprint, 'COMMITTED', intent.preparedAt, intent.preparedAt, '{}'] });
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }
  }
  async verifyResiduals(target: LifecycleTarget): Promise<void> {
    if (target.documentId) {
      const docs = await this.client.execute({ sql: 'SELECT lifecycle_state,title,original_filename,byte_size FROM legal_documents WHERE id=? AND tenant_id=? AND matter_id=?', args: [target.documentId, target.tenantId, target.matterId] });
      const row = docs.rows[0];
      if (row && (row.lifecycle_state !== 'PURGED' || row.title !== 'Documento excluído' || row.original_filename !== '' || Number(row.byte_size) !== 0)) throw new Error('PURGE_RESIDUAL_DATA');
      const content = await this.client.execute({ sql: "SELECT (SELECT COUNT(*) FROM document_versions WHERE document_id=? AND content!='') + (SELECT COUNT(*) FROM document_anchors WHERE document_version_id IN (SELECT id FROM document_versions WHERE document_id=?) AND text!='') AS count", args: [target.documentId, target.documentId] });
      if (Number(content.rows[0]?.count)) throw new Error('PURGE_RESIDUAL_DATA');
    } else {
      for (const query of queries(target)) {
        const count = await this.client.execute({ sql: `SELECT COUNT(*) AS count FROM ${query.table} WHERE ${query.where}`, args: query.args });
        if (Number(count.rows[0]?.count)) throw new Error('PURGE_RESIDUAL_DATA');
      }
      const markers = await this.client.execute({ sql: "SELECT id FROM matters WHERE id=? AND tenant_id=? AND (lifecycle_state!='PURGED' OR title!='' OR description IS NOT NULL OR client_id IS NOT NULL OR practice_area IS NOT NULL OR jurisdiction IS NOT NULL)", args: [target.matterId, target.tenantId] });
      if (markers.rows.length) throw new Error('PURGE_RESIDUAL_DATA');
    }
  }
}
