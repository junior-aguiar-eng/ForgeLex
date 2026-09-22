import type { Client } from '@forgelex/persistence';

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

const tenantStatements: readonly TenantStatement[] = [
  direct('draft_approval_tokens', 'MATTERS'),
  direct('draft_approval_decisions', 'MATTERS'),
  direct('draft_approval_requests', 'MATTERS'),
  direct('citation_anchors', 'MATTERS'),
  direct('draft_review_findings', 'MATTERS'),
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
  direct('webhook_deliveries', 'WEBHOOKS'),
  direct('webhook_events', 'WEBHOOKS'),
  direct('webhook_endpoints', 'WEBHOOKS'),
  direct('api_keys', 'CREDENTIALS'),
  nested('approvals', 'SESSIONS', 'session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)'),
  nested('checkpoints', 'SESSIONS', 'session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)'),
  nested('session_messages', 'SESSIONS', 'session_id IN (SELECT id FROM sessions WHERE tenant_id = ?)'),
  direct('sessions', 'SESSIONS'),
  direct('matters', 'MATTERS'),
];

const financialOwnerTables = [
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
      for (const statement of tenantStatements) {
        if (held.has(statement.category)) continue;
        const result = await transaction.execute({
          sql: statement.deleteSql,
          args: [input.tenantId],
        });
        deletedRows += result.rowsAffected;
      }

      let remainingPrivateRows = 0;
      for (const statement of tenantStatements) {
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
      for (const statement of tenantStatements) {
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
}
