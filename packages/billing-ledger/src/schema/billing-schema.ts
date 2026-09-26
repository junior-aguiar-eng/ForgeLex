import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { ledgerAccounts } from './ledger-schema.js';

export const billingAccounts = sqliteTable('billing_accounts', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().unique(),
  providerCustomerId: text('provider_customer_id').unique(),
  autoRechargeEnabled: integer('auto_recharge_enabled').notNull().default(0),
  autoRechargeThresholdCents: integer('auto_recharge_threshold_cents').notNull().default(500),
  lastRechargeAmountCents: integer('last_recharge_amount_cents'),
  autoRechargeArmed: integer('auto_recharge_armed').notNull().default(1),
  defaultPaymentMethodId: text('default_payment_method_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const billingPurchases = sqliteTable('billing_purchases', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  packageId: text('package_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull().default('brl'),
  status: text('status').notNull(),
  providerCheckoutId: text('provider_checkout_id').unique(),
  checkoutUrl: text('checkout_url'),
  providerPaymentId: text('provider_payment_id').unique(),
  receiptUrl: text('receipt_url'),
  createdAt: text('created_at').notNull(),
  paidAt: text('paid_at'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('billing_purchases_tenant_created_idx').on(table.tenantId, table.createdAt),
  uniqueIndex('billing_purchases_tenant_idempotency_unique').on(table.tenantId, table.idempotencyKey),
]);

export const billingPayments = sqliteTable('billing_payments', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  purchaseId: text('purchase_id').notNull(),
  provider: text('provider').notNull(),
  providerPaymentId: text('provider_payment_id').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull(),
  paymentMethodType: text('payment_method_type'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('billing_payments_provider_payment_unique').on(table.provider, table.providerPaymentId),
  index('billing_payments_tenant_created_idx').on(table.tenantId, table.createdAt),
]);

export const billingWebhookEvents = sqliteTable('billing_webhook_events', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  eventType: text('event_type').notNull(),
  tenantId: text('tenant_id'),
  payload: text('payload').notNull(),
  status: text('status').notNull(),
  receivedAt: text('received_at').notNull(),
  processedAt: text('processed_at'),
  errorMessage: text('error_message'),
}, (table) => [
  uniqueIndex('billing_webhook_events_provider_id_unique').on(table.provider, table.id),
  index('billing_webhook_events_tenant_received_idx').on(table.tenantId, table.receivedAt),
]);

export const billingPaymentMethods = sqliteTable('billing_payment_methods', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  provider: text('provider').notNull(),
  providerPaymentMethodId: text('provider_payment_method_id').notNull(),
  type: text('type').notNull(),
  brand: text('brand'),
  last4: text('last4'),
  expMonth: integer('exp_month'),
  expYear: integer('exp_year'),
  isDefault: integer('is_default').notNull().default(0),
  createdAt: text('created_at').notNull(),
  revokedAt: text('revoked_at'),
}, (table) => [
  uniqueIndex('billing_payment_methods_provider_id_unique').on(table.provider, table.providerPaymentMethodId),
  index('billing_payment_methods_tenant_idx').on(table.tenantId),
]);

export const billingInvoices = sqliteTable('billing_invoices', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  purchaseId: text('purchase_id').notNull(),
  number: text('number').notNull(),
  status: text('status').notNull(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull(),
  receiptUrl: text('receipt_url'),
  issuedAt: text('issued_at').notNull(),
}, (table) => [
  uniqueIndex('billing_invoices_purchase_unique').on(table.purchaseId),
  index('billing_invoices_tenant_issued_idx').on(table.tenantId, table.issuedAt),
]);

export const billingRefundRequests = sqliteTable('billing_refund_requests', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  purchaseId: text('purchase_id').notNull(),
  requestedBy: text('requested_by').notNull(),
  status: text('status').notNull(),
  openKey: text('open_key'),
  eligibleAmountCents: integer('eligible_amount_cents').notNull(),
  approvedAmountCents: integer('approved_amount_cents'),
  reason: text('reason'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('billing_refund_requests_tenant_created_idx').on(table.tenantId, table.createdAt),
  uniqueIndex('billing_refund_requests_tenant_open_unique').on(table.tenantId, table.openKey),
]);

export const billingCreditLots = sqliteTable('billing_credit_lots', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  purchaseId: text('purchase_id').notNull(),
  accountId: text('account_id').notNull().references(() => ledgerAccounts.id),
  grantedCents: integer('granted_cents').notNull(),
  remainingCents: integer('remaining_cents').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('billing_credit_lots_purchase_unique').on(table.purchaseId),
  index('billing_credit_lots_tenant_created_idx').on(table.tenantId, table.createdAt),
]);
