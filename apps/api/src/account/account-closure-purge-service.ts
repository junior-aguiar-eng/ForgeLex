import { closeAgenticTenant } from '@forgelex/persistence';
import type { Client } from '@forgelex/persistence';
import { createHash } from 'node:crypto';
import { assertCommercialClosureReady } from './commercial-financial-retention.js';
import { drainCommercialClosureJobs } from './commercial-execution-drain.js';

export interface PurgeSummary {
  deletedRows: number;
  remainingPrivateRows: number;
  heldCategories: string[];
}

export interface ResidualVerification {
  privateRows: number;
  activeCredentials: number;
  unredactedSnapshots: number;
  retainedFinancialRows: number;
  heldCategories: string[];
}

interface TenantStatement {
  table: string;
  category: string;
  deleteSql: string;
  countSql: string;
}

// A held conversation retains its relationship without retaining the deleted case's private fields.
const referencedByHeldConversation =
  'EXISTS (SELECT 1 FROM agentic_conversations c WHERE c.matter_id=matters.id AND c.tenant_id=matters.tenant_id)';
const minimalMatterShell =
  "lifecycle_state='PURGED' AND title='' AND description IS NULL AND client_id IS NULL AND practice_area IS NULL AND jurisdiction IS NULL AND previous_business_status IS NULL AND previous_lifecycle_state IS NULL AND created_by='retained_session' AND archived_by IS NULL AND trashed_by IS NULL AND restored_by IS NULL AND purged_by='account_closure'";

const tenantStatements: readonly TenantStatement[] = [
  direct('agentic_commands', 'SESSIONS'),
  direct('agentic_execution_jobs', 'SESSIONS'),
  nested(
    'agentic_execution_calls',
    'SESSIONS',
    'execution_id IN (SELECT id FROM agentic_executions WHERE tenant_id = ?)',
  ),
  nested('agentic_events', 'SESSIONS', 'execution_id IN (SELECT id FROM agentic_executions WHERE tenant_id = ?)'),
  direct('agentic_task_deliveries', 'SESSIONS'),
  nested(
    'agentic_messages',
    'SESSIONS',
    'conversation_id IN (SELECT id FROM agentic_conversations WHERE tenant_id = ?)',
  ),
  nested(
    'agentic_contexts',
    'SESSIONS',
    'conversation_id IN (SELECT id FROM agentic_conversations WHERE tenant_id = ?)',
  ),
  direct('agentic_executions', 'SESSIONS'),
  direct('agentic_conversations', 'SESSIONS'),
  direct('agentic_command_owners', 'SESSIONS'),
  direct('draft_approval_tokens', 'MATTERS'),
  direct('draft_approval_decisions', 'MATTERS'),
  direct('draft_approval_requests', 'MATTERS'),
  direct('citation_anchors', 'MATTERS'),
  direct('draft_review_findings', 'MATTERS'),
  direct('draft_review_runs', 'MATTERS'),
  direct('draft_ai_receipts', 'MATTERS'),
  direct('case_analysis_receipts', 'MATTERS'),
  direct('case_ai_access_grants', 'MATTERS'),
  direct('draft_sections', 'MATTERS'),
  direct('draft_versions', 'MATTERS'),
  direct('drafts', 'MATTERS'),
  direct('matter_authority_verifications', 'MATTERS'),
  direct('matter_authorities', 'MATTERS'),
  direct('legal_theses', 'MATTERS'),
  direct('research_memos', 'MATTERS'),
  direct('legal_issues', 'MATTERS'),
  direct('evidence_links', 'MATTERS'),
  direct('evidence_source_links', 'MATTERS'),
  direct('evidence_items', 'MATTERS'),
  direct('fact_source_links', 'MATTERS'),
  direct('facts', 'MATTERS'),
  direct('timeline_events', 'MATTERS'),
  nested(
    'document_anchors',
    'MATTERS',
    'document_version_id IN (SELECT id FROM document_versions WHERE document_id IN (SELECT id FROM legal_documents WHERE tenant_id = ?))',
  ),
  nested('document_versions', 'MATTERS', 'document_id IN (SELECT id FROM legal_documents WHERE tenant_id = ?)'),
  direct('legal_documents', 'MATTERS'),
  direct('workflow_checkpoints', 'WORKFLOWS'),
  direct('research_search_history', 'RESEARCH_HISTORY'),
  direct('saved_research', 'RESEARCH_HISTORY'),
  direct('saved_research_collections', 'RESEARCH_HISTORY'),
  direct('saved_research_permissions', 'CREDENTIALS'),
  direct('webhook_deliveries', 'WEBHOOKS'),
  direct('webhook_events', 'WEBHOOKS'),
  direct('webhook_endpoints', 'WEBHOOKS'),
  direct('api_keys', 'CREDENTIALS'),
  nested('approvals', 'SESSIONS', 'session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)'),
  nested('checkpoints', 'SESSIONS', 'session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)'),
  nested('session_messages', 'SESSIONS', 'session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)'),
  direct('sessions', 'SESSIONS'),
  {
    table: 'matters',
    category: 'MATTERS',
    deleteSql: `DELETE FROM matters WHERE tenant_id=? AND NOT (${referencedByHeldConversation})`,
    countSql: `SELECT COUNT(*) AS count FROM matters WHERE tenant_id=? AND NOT ((${referencedByHeldConversation}) AND (${minimalMatterShell}))`,
  },
];

// Analysis sessions are independent of matters. Their results and operation
// snapshots follow the existing SESSIONS retention category, including holds.
// Children must precede sessions because the optional module owns its own FKs.
const optionalTenantStatements: readonly TenantStatement[] = [
  direct('analise_consumos', 'SESSIONS'),
  direct('analise_operacoes', 'SESSIONS'),
  nested(
    'analise_achados',
    'SESSIONS',
    'sessao_analitica_id IN (SELECT sessao_analitica_id FROM analise_sessoes WHERE tenant_id = ?)',
  ),
  direct('analise_combos', 'SESSIONS'),
  direct('analise_sessoes', 'SESSIONS'),
];

const financialOwnerTables = [
  'commercial_executions',
  'commercial_calls',
  'ledger_accounts',
  'usage_events',
  'billing_accounts',
  'billing_purchases',
  'billing_payments',
  'billing_webhook_events',
  'billing_payment_methods',
  'billing_invoices',
  'billing_refund_requests',
  'billing_credit_lots',
  'billing_operations',
] as const;

function direct(table: string, category: string): TenantStatement {
  return nested(table, category, 'tenant_id = ?');
}

function nested(table: string, category: string, predicate: string): TenantStatement {
  return {
    table,
    category,
    deleteSql: `DELETE FROM ${table} WHERE ${predicate}`,
    countSql: `SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`,
  };
}

function numberFrom(result: { rows: Array<Record<string, unknown>> }): number {
  return Number(result.rows[0]?.count ?? 0);
}

export class AccountClosurePurgeService {
  public constructor(private readonly client: Client) {}

  public async purgePrivateContent(input: {
    tenantId: string;
    closureId: string;
    now?: string;
  }): Promise<PurgeSummary> {
    const heldCategories = await this.activeHeldCategories(input.closureId, input.now ?? new Date().toISOString());
    const held = new Set(heldCategories);
    const transaction = await this.client.transaction();
    let deletedRows = 0;
    try {
      await closeAgenticTenant(transaction, input.tenantId);
      await transaction.execute({
        sql: 'UPDATE ledger_accounts SET updated_at=updated_at WHERE tenant_id=?',
        args: [input.tenantId],
      });
      await assertCommercialClosureReady(transaction, input.tenantId);
      await drainCommercialClosureJobs(transaction, input.tenantId, input.now ?? new Date().toISOString());
      const budgets = await transaction.execute({
        sql: 'SELECT payload_json FROM inference_budgets WHERE tenant_id=?',
        args: [input.tenantId],
      });
      const calls = await transaction.execute({
        sql: 'SELECT payload_json FROM inference_calls WHERE tenant_id=?',
        args: [input.tenantId],
      });
      const parse = (raw: unknown): Record<string, unknown> => {
        try {
          const data = JSON.parse(String(raw));
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
          return data;
        } catch {
          throw new Error('ACCOUNT_CLOSURE_INFERENCE_PENDING');
        }
      };
      for (const row of budgets.rows) {
        const budget = parse(row.payload_json);
        if (budget.status !== 'RELEASED' || budget.remainingPaidCents !== 0 || budget.remainingPromoCents !== 0)
          throw new Error('ACCOUNT_CLOSURE_INFERENCE_PENDING');
      }
      for (const row of calls.rows) {
        if (!['SETTLED', 'CANCELLED', 'PROVISIONED'].includes(String(parse(row.payload_json).status)))
          throw new Error('ACCOUNT_CLOSURE_INFERENCE_PENDING');
      }
      const pending = await transaction.execute({
        sql: "SELECT execution_id FROM agentic_execution_jobs WHERE tenant_id=? AND (state NOT IN ('COMPLETED','FAILED','CANCELLED') OR budget_release_pending<>0) LIMIT 1",
        args: [input.tenantId],
      });
      if (pending.rows.length) throw new Error('ACCOUNT_CLOSURE_AGENTIC_PENDING');
      const statements = await this.availableTenantStatements(transaction);
      if (!held.has('MATTERS')) {
        const closures = await transaction.execute({
          sql: 'SELECT tenant_hash FROM account_closures WHERE id=?',
          args: [input.closureId],
        });
        const hash = String(
          closures.rows[0]?.tenant_hash ?? createHash('sha256').update(input.closureId).digest('hex'),
        );
        // Operational proof survives account closure, with its tenant association minimized.
        await transaction.execute({
          sql: 'UPDATE matter_lifecycle_purge_operations SET tenant_id=? WHERE tenant_id=?',
          args: [`tenant_closed_${hash.slice(0, 24)}`, input.tenantId],
        });
      }
      if (held.has('SESSIONS') && !held.has('MATTERS')) {
        await transaction.execute({
          sql: `UPDATE matters SET title='',description=NULL,client_id=NULL,practice_area=NULL,jurisdiction=NULL,previous_business_status=NULL,previous_lifecycle_state=NULL,status='ARCHIVED',created_by='retained_session',lifecycle_state='PURGED',lifecycle_revision=CASE WHEN lifecycle_state='PURGED' THEN lifecycle_revision ELSE lifecycle_revision+1 END,archived_at=NULL,archived_by=NULL,trashed_at=NULL,trashed_by=NULL,restored_at=NULL,restored_by=NULL,purged_at=COALESCE(purged_at,?),purged_by='account_closure',updated_at=? WHERE tenant_id=? AND (${referencedByHeldConversation})`,
          args: [input.now ?? new Date().toISOString(), input.now ?? new Date().toISOString(), input.tenantId],
        });
      }
      for (const statement of statements) {
        if (held.has(statement.category)) continue;
        const result = await transaction.execute({
          sql: statement.deleteSql,
          args: [input.tenantId],
        });
        deletedRows += result.rowsAffected;
      }

      let remainingPrivateRows = 0;
      for (const statement of statements) {
        if (held.has(statement.category)) continue;
        remainingPrivateRows += numberFrom(
          (await transaction.execute({
            sql: statement.countSql,
            args: [input.tenantId],
          })) as { rows: Array<Record<string, unknown>> },
        );
      }
      await transaction.commit();
      return { deletedRows, remainingPrivateRows, heldCategories };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  public async removeLocalIdentity(input: {
    closureId: string;
    tenantId?: string;
    userId?: string;
    tenantPseudonym: string;
    userPseudonym: string;
    closurePseudonym: string;
    now?: string;
  }): Promise<void> {
    await this.verifyResiduals({
      closureId: input.closureId,
      tenantId: input.tenantId,
      userId: input.userId,
      tenantPseudonym: input.tenantPseudonym,
      now: input.now,
    });

    const transaction = await this.client.transaction();
    try {
      if (input.tenantId && input.userId) {
        await transaction.execute({
          sql: `UPDATE audit_logs
            SET tenant_id = ?, user_id = ?, session_id = ?
            WHERE tenant_id = ?`,
          args: [input.tenantPseudonym, input.userPseudonym, input.closurePseudonym, input.tenantId],
        });
        await transaction.execute({
          sql: 'DELETE FROM forgelex_tenant_memberships WHERE tenant_id = ?',
          args: [input.tenantId],
        });
        await transaction.execute({
          sql: 'DELETE FROM forgelex_tenants WHERE id = ?',
          args: [input.tenantId],
        });
        await transaction.execute({
          sql: 'DELETE FROM forgelex_user_profiles WHERE id = ?',
          args: [input.userId],
        });
      }
      await transaction.execute({
        sql: `UPDATE account_closures
          SET subject_id = NULL, user_id = NULL, tenant_id = NULL
          WHERE id = ?`,
        args: [input.closureId],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  public async verifyResiduals(input: {
    closureId: string;
    tenantId?: string;
    userId?: string;
    tenantPseudonym: string;
    now?: string;
  }): Promise<ResidualVerification> {
    const heldCategories = await this.activeHeldCategories(input.closureId, input.now ?? new Date().toISOString());
    const held = new Set(heldCategories);
    let privateRows = 0;
    let activeCredentials = 0;
    if (input.tenantId) {
      const inference = await this.client.execute({
        sql: 'SELECT (SELECT COUNT(*) FROM inference_budgets WHERE tenant_id=?) + (SELECT COUNT(*) FROM inference_calls WHERE tenant_id=?) AS count',
        args: [input.tenantId, input.tenantId],
      });
      privateRows += numberFrom(inference as { rows: Array<Record<string, unknown>> });
      const statements = await this.availableTenantStatements(this.client);
      if (!held.has('MATTERS')) {
        const operations = await this.client.execute({
          sql: 'SELECT COUNT(*) AS count FROM matter_lifecycle_purge_operations WHERE tenant_id=?',
          args: [input.tenantId],
        });
        privateRows += numberFrom(operations as { rows: Array<Record<string, unknown>> });
      }
      for (const statement of statements) {
        if (held.has(statement.category)) continue;
        const rows = await this.client.execute({
          sql: statement.countSql,
          args: [input.tenantId],
        });
        const count = numberFrom(rows as { rows: Array<Record<string, unknown>> });
        privateRows += count;
        if (statement.table === 'api_keys') activeCredentials += count;
      }
    }

    const snapshots = await this.client.execute({
      sql: `SELECT
        (SELECT COUNT(*) FROM billing_operations
          WHERE tenant_id = ? AND result_snapshot IS NOT NULL) +
        (SELECT COUNT(*) FROM ledger_entries
          WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id = ?)
            AND operation_result_snapshot IS NOT NULL) +
        (SELECT COUNT(*) FROM billing_webhook_events
          WHERE tenant_id = ? AND (payload != '{}' OR error_message IS NOT NULL)) AS count`,
      args: [input.tenantPseudonym, input.tenantPseudonym, input.tenantPseudonym],
    });
    let directFinancialRows = 0;
    if (input.tenantId) {
      const ownerCounts = await this.client.execute({
        sql: `SELECT ${financialOwnerTables
          .map((table) => `(SELECT COUNT(*) FROM ${table} WHERE tenant_id = ?)`)
          .join(' + ')} AS count`,
        args: financialOwnerTables.map(() => input.tenantId as string),
      });
      directFinancialRows += numberFrom(ownerCounts as { rows: Array<Record<string, unknown>> });
    }
    if (input.userId) {
      const userCounts = await this.client.execute({
        sql: `SELECT
          (SELECT COUNT(*) FROM billing_purchases WHERE user_id = ?) +
          (SELECT COUNT(*) FROM billing_refund_requests WHERE requested_by = ?) +
          (SELECT COUNT(*) FROM usage_events WHERE user_id = ?) AS count`,
        args: [input.userId, input.userId, input.userId],
      });
      directFinancialRows += numberFrom(userCounts as { rows: Array<Record<string, unknown>> });
    }
    const retained = await this.client.execute({
      sql: `SELECT
        (SELECT COUNT(*) FROM ledger_accounts WHERE tenant_id = ?) +
        (SELECT COUNT(*) FROM billing_purchases WHERE tenant_id = ?) +
        (SELECT COUNT(*) FROM billing_payments WHERE tenant_id = ?) +
        (SELECT COUNT(*) FROM billing_invoices WHERE tenant_id = ?) +
        (SELECT COUNT(*) FROM billing_refund_requests WHERE tenant_id = ?) +
        (SELECT COUNT(*) FROM billing_credit_lots WHERE tenant_id = ?) AS count`,
      args: Array(6).fill(input.tenantPseudonym),
    });
    const verification: ResidualVerification = {
      privateRows,
      activeCredentials,
      unredactedSnapshots: numberFrom(snapshots as { rows: Array<Record<string, unknown>> }) + directFinancialRows,
      retainedFinancialRows: numberFrom(retained as { rows: Array<Record<string, unknown>> }),
      heldCategories,
    };
    if (verification.privateRows > 0 || verification.activeCredentials > 0 || verification.unredactedSnapshots > 0) {
      throw Object.assign(new Error('ACCOUNT_CLOSURE_RESIDUAL_DATA'), {
        code: 'ACCOUNT_CLOSURE_RESIDUAL_DATA',
      });
    }
    return verification;
  }

  private async activeHeldCategories(closureId: string, now: string): Promise<string[]> {
    const result = await this.client.execute({
      sql: `SELECT DISTINCT category FROM retention_exceptions
        WHERE closure_id = ? AND status = 'ACTIVE'
          AND starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)
        ORDER BY category`,
      args: [closureId, now, now],
    });
    return result.rows.map((row) => String(row.category));
  }

  private async availableTenantStatements(executor: Pick<Client, 'execute'>): Promise<readonly TenantStatement[]> {
    const dialect = (this.client as Client & { forgelexDialect?: 'sqlite' | 'postgres' }).forgelexDialect ?? 'sqlite';
    const placeholders = optionalTenantStatements.map(() => '?').join(', ');
    // Probe the catalog instead of swallowing missing-table errors: an absent
    // relation would abort a PostgreSQL transaction and hide other failures.
    const result = await executor.execute({
      sql:
        dialect === 'postgres'
          ? `SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = current_schema() AND tablename IN (${placeholders})`
          : `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
      args: optionalTenantStatements.map((statement) => statement.table),
    });
    const available = new Set(result.rows.map((row) => String(row.name)));
    return [...optionalTenantStatements.filter((statement) => available.has(statement.table)), ...tenantStatements];
  }
}
