import type { Client } from '@forgelex/persistence';

export interface BillingRetentionInput {
  tenantId: string;
  userId: string;
  tenantPseudonym: string;
  userPseudonym: string;
}

export class AccountClosureBillingRetention {
  public constructor(private readonly client: Client) {}

  public async minimize(input: BillingRetentionInput): Promise<void> {
    const transaction = await this.client.transaction();
    try {
      await transaction.execute({
        sql: 'DELETE FROM billing_payment_methods WHERE tenant_id = ?',
        args: [input.tenantId],
      });
      await transaction.execute({
        sql: `UPDATE billing_webhook_events
          SET tenant_id = ?, payload = '{}', error_message = NULL
          WHERE tenant_id = ?`,
        args: [input.tenantPseudonym, input.tenantId],
      });
      await transaction.execute({
        sql: `UPDATE billing_accounts
          SET tenant_id = ?, provider_customer_id = NULL,
              auto_recharge_enabled = 0, default_payment_method_id = NULL
          WHERE tenant_id = ?`,
        args: [input.tenantPseudonym, input.tenantId],
      });
      await transaction.execute({
        sql: `UPDATE billing_purchases
          SET tenant_id = ?, user_id = ?, checkout_url = NULL, receipt_url = NULL
          WHERE tenant_id = ?`,
        args: [input.tenantPseudonym, input.userPseudonym, input.tenantId],
      });
      for (const table of ['billing_payments', 'billing_invoices', 'billing_credit_lots'] as const) {
        const extra = table === 'billing_invoices' ? ', receipt_url = NULL' : '';
        await transaction.execute({
          sql: `UPDATE ${table} SET tenant_id = ?${extra} WHERE tenant_id = ?`,
          args: [input.tenantPseudonym, input.tenantId],
        });
      }
      await transaction.execute({
        sql: `UPDATE billing_refund_requests
          SET tenant_id = ?, requested_by = ?, reviewed_by = NULL, reason = NULL
          WHERE tenant_id = ?`,
        args: [input.tenantPseudonym, input.userPseudonym, input.tenantId],
      });
      await transaction.execute({
        sql: `UPDATE billing_operations
          SET tenant_id = ?, result_snapshot = NULL,
              lease_owner = NULL, lease_expires_at = NULL
          WHERE tenant_id = ?`,
        args: [input.tenantPseudonym, input.tenantId],
      });
      await transaction.execute({
        sql: `UPDATE usage_events
          SET tenant_id = ?, user_id = NULL, session_id = NULL, model = NULL
          WHERE tenant_id = ?`,
        args: [input.tenantPseudonym, input.tenantId],
      });
      await transaction.execute({
        sql: `UPDATE ledger_entries SET operation_result_snapshot = NULL
          WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id = ?)`,
        args: [input.tenantId],
      });
      await transaction.execute({
        sql: 'UPDATE ledger_accounts SET tenant_id = ? WHERE tenant_id = ?',
        args: [input.tenantPseudonym, input.tenantId],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}
