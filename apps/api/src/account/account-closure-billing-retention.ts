import { createHash } from 'node:crypto';
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
      await transaction.execute({ sql: 'UPDATE ledger_accounts SET updated_at=updated_at WHERE tenant_id=?', args: [input.tenantId] });
      const budgets = await transaction.execute({ sql: 'SELECT id,idempotency_key,payload_json FROM inference_budgets WHERE tenant_id=?', args: [input.tenantId] });
      const calls = await transaction.execute({ sql: 'SELECT id,call_id,operation_key,payload_json FROM inference_calls WHERE tenant_id=?', args: [input.tenantId] });
      const parse = (raw: unknown): Record<string, unknown> => {
        try { const value = JSON.parse(String(raw)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
        catch { throw new Error('ACCOUNT_CLOSURE_INFERENCE_PENDING'); }
      };
      for (const row of budgets.rows) {
        const data = parse(row.payload_json);
        if (data.status !== 'RELEASED' || data.remainingPaidCents !== 0 || data.remainingPromoCents !== 0) throw new Error('ACCOUNT_CLOSURE_INFERENCE_PENDING');
      }
      for (const row of calls.rows) {
        const data = parse(row.payload_json);
        if (!['SETTLED', 'CANCELLED', 'PROVISIONED'].includes(String(data.status))) throw new Error('ACCOUNT_CLOSURE_INFERENCE_PENDING');
      }
      const retainedKey = (key: unknown) => createHash('sha256').update('forgelex-closed-inference\0').update(input.tenantPseudonym).update('\0').update(String(key)).digest('hex');
      for (const row of budgets.rows) {
        const data = parse(row.payload_json);
        const allowed = ['id','executionId','status','maxCostCents','remainingPaidCents','remainingPromoCents','consumedCents','provisionedCents','releasedCents','expiredPromoCents'];
        const retained = Object.fromEntries(allowed.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
        await transaction.execute({ sql: 'UPDATE inference_budgets SET tenant_id=?,user_id=?,idempotency_key=?,payload_json=? WHERE id=?', args: [input.tenantPseudonym,input.userPseudonym,retainedKey(row.idempotency_key),JSON.stringify({ ...retained, tenantId: input.tenantPseudonym, userId: input.userPseudonym }),String(row.id)] });
      }
      for (const row of calls.rows) {
        const data = parse(row.payload_json);
        const allowed = ['id','executionId','status','kind','upperBoundCents','reservedPaidCents','reservedPromoCents'];
        const retained = Object.fromEntries(allowed.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
        const settlement = data.settlement && typeof data.settlement === 'object' ? { actualCostCents: (data.settlement as Record<string, unknown>).actualCostCents } : undefined;
        const rawProvision = data.provision && typeof data.provision === 'object' ? data.provision as Record<string, unknown> : undefined;
        const provision = rawProvision ? { basis: rawProvision.basis, amountCents: rawProvision.amountCents, actualCostCents: rawProvision.actualCostCents, recordedAt: rawProvision.recordedAt } : undefined;
        const operationKey = retainedKey(row.operation_key);
        await transaction.execute({ sql: 'UPDATE billing_operations SET idempotency_key=? WHERE tenant_id=? AND idempotency_key=?', args: [operationKey,input.tenantId,String(row.operation_key)] });
        await transaction.execute({ sql: 'UPDATE ledger_entries SET idempotency_key=? WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id=?) AND idempotency_key=?', args: [operationKey,input.tenantId,String(row.operation_key)] });
        await transaction.execute({ sql: 'UPDATE inference_calls SET tenant_id=?,call_id=?,operation_key=?,payload_json=? WHERE id=?', args: [input.tenantPseudonym,retainedKey(row.call_id),operationKey,JSON.stringify({ ...retained, callId: retainedKey(row.call_id), ...(settlement ? { settlement } : {}), ...(provision ? { provision } : {}), tenantId: input.tenantPseudonym, userId: input.userPseudonym }),String(row.id)] });
      }
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
