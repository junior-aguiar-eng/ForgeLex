import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations, type Client } from '@forgelex/persistence';
import { runLedgerMigrations } from '@forgelex/billing-ledger';
import { AccountClosureBillingRetention } from './account-closure-billing-retention.js';

const now = '2026-09-22T12:00:00.000Z';

describe('AccountClosureBillingRetention', () => {
  let client: Client;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-closure-billing-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    client = connection.client;
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    await seedFinancialRows(client);
  });

  afterEach(() => {
    client.close();
    try {
      rmSync(databasePath, { force: true });
    } catch {
      /* SQLite pode liberar depois do worker. */
    }
  });

  it('mantém valores e referências fiscais sem conteúdo jurídico ou identificador direto', async () => {
    const retention = new AccountClosureBillingRetention(client);

    await retention.minimize({
      tenantId: 'tenant_original',
      userId: 'user_original',
      tenantPseudonym: 'tenant_closed_1',
      userPseudonym: 'user_closed_1',
    });

    expect(await row(client, 'SELECT amount_cents, operation_result_snapshot FROM ledger_entries')).toMatchObject({
      amount_cents: -20,
      operation_result_snapshot: null,
    });
    expect(await row(client, 'SELECT tenant_id, user_id, session_id, model FROM usage_events')).toMatchObject({
      tenant_id: 'tenant_closed_1',
      user_id: null,
      session_id: null,
      model: null,
    });
    expect(
      await row(client, 'SELECT tenant_id, user_id, checkout_url, receipt_url FROM billing_purchases'),
    ).toMatchObject({ tenant_id: 'tenant_closed_1', user_id: 'user_closed_1', checkout_url: null, receipt_url: null });
    expect(await row(client, 'SELECT tenant_id, payload, error_message FROM billing_webhook_events')).toMatchObject({
      tenant_id: 'tenant_closed_1',
      payload: '{}',
      error_message: null,
    });
    expect(await count(client, 'SELECT COUNT(*) AS count FROM billing_payment_methods')).toBe(0);

    const retained = await client.batch(
      [
        'SELECT * FROM ledger_entries',
        'SELECT * FROM usage_events',
        'SELECT * FROM billing_purchases',
        'SELECT * FROM billing_refund_requests',
        'SELECT * FROM billing_operations',
        'SELECT * FROM billing_webhook_events',
      ],
      'read',
    );
    expect(JSON.stringify(retained.map((result) => result.rows))).not.toContain('consulta sigilosa');
    expect(JSON.stringify(retained.map((result) => result.rows))).not.toContain('tenant_original');
    expect(JSON.stringify(retained.map((result) => result.rows))).not.toContain('user_original');
  });
});

async function row(client: Client, sql: string): Promise<Record<string, unknown>> {
  const result = await client.execute(sql);
  return result.rows[0] as Record<string, unknown>;
}

async function count(client: Client, sql: string): Promise<number> {
  return Number((await row(client, sql)).count);
}

async function seedFinancialRows(client: Client): Promise<void> {
  await client.batch(
    [
      {
        sql: `INSERT INTO ledger_accounts (id, tenant_id, paid_balance_cents, promotional_balance_cents, created_at, updated_at) VALUES ('account_1', 'tenant_original', 100, 0, ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO usage_events (id, tenant_id, user_id, capability, model, units, request_id, session_id, occurred_at) VALUES ('usage_1', 'tenant_original', 'user_original', 'research.search_case_law', 'model-secret', 1, 'request_1', 'session_secret', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO ledger_entries (id, account_id, usage_event_id, idempotency_key, kind, bucket, amount_cents, operation_result_snapshot, created_at) VALUES ('entry_1', 'account_1', 'usage_1', 'idem_1', 'DEBIT', 'PAID', -20, '{"query":"consulta sigilosa"}', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_accounts (id, tenant_id, provider_customer_id, auto_recharge_enabled, default_payment_method_id, created_at, updated_at) VALUES ('billing_account_1', 'tenant_original', 'customer_direct', 1, 'method_1', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_purchases (id, tenant_id, user_id, package_id, idempotency_key, amount_cents, currency, status, checkout_url, receipt_url, created_at, updated_at) VALUES ('purchase_1', 'tenant_original', 'user_original', 'credits_25', 'purchase_idem', 2500, 'brl', 'PAID', 'https://checkout.invalid/secret', 'https://receipt.invalid/secret', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_payments (id, tenant_id, purchase_id, provider, provider_payment_id, amount_cents, currency, status, created_at, updated_at) VALUES ('payment_1', 'tenant_original', 'purchase_1', 'provider', 'provider_payment_1', 2500, 'brl', 'SUCCEEDED', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_webhook_events (id, provider, event_type, tenant_id, payload, status, received_at, error_message) VALUES ('webhook_1', 'provider', 'payment', 'tenant_original', '{"query":"consulta sigilosa"}', 'PROCESSED', ?, 'conteúdo interno')`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_payment_methods (id, tenant_id, provider, provider_payment_method_id, type, created_at) VALUES ('method_1', 'tenant_original', 'provider', 'provider_method_1', 'card', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_invoices (id, tenant_id, purchase_id, number, status, amount_cents, currency, receipt_url, issued_at) VALUES ('invoice_1', 'tenant_original', 'purchase_1', 'INV-1', 'PAID', 2500, 'brl', 'https://receipt.invalid/secret', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO billing_refund_requests (id, tenant_id, purchase_id, requested_by, status, eligible_amount_cents, reason, reviewed_by, created_at, updated_at) VALUES ('refund_1', 'tenant_original', 'purchase_1', 'user_original', 'APPROVED', 100, 'consulta sigilosa', 'reviewer_direct', ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_credit_lots (id, tenant_id, purchase_id, account_id, granted_cents, remaining_cents, created_at, updated_at) VALUES ('lot_1', 'tenant_original', 'purchase_1', 'account_1', 2500, 100, ?, ?)`,
        args: [now, now],
      },
      {
        sql: `INSERT INTO billing_operations (id, tenant_id, account_id, idempotency_key, status, reserved_amount_cents, lease_owner, lease_expires_at, result_snapshot, error_code, created_at, updated_at) VALUES ('operation_1', 'tenant_original', 'account_1', 'operation_idem', 'COMPLETED', 20, 'worker_direct', ?, '{"query":"consulta sigilosa"}', NULL, ?, ?)`,
        args: [now, now, now],
      },
    ],
    'write',
  );
}

it('impede a minimização financeira enquanto há reserva de inferência aberta', async () => {
  const connection = await createDatabase({ url: ':memory:' });
  const client = connection.client;
  try {
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    await client.execute({ sql: 'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)', args: ['b','tenant','user','exec','k',JSON.stringify({ status: 'ACTIVE', tenantId: 'tenant', userId: 'user' })] });
    await expect(new AccountClosureBillingRetention(client).minimize({ tenantId:'tenant', userId:'user', tenantPseudonym:'tenant_closed', userPseudonym:'user_closed' })).rejects.toThrow('ACCOUNT_CLOSURE_INFERENCE_PENDING');
    expect((await client.execute('SELECT tenant_id FROM inference_budgets')).rows[0].tenant_id).toBe('tenant');
  } finally { client.close(); }
});

it('minimiza orçamento liberado e chamada liquidada sem perder valores', async () => {
  const { client } = await createDatabase({ url: ':memory:' });
  try {
    await runPersistenceMigrations(client); await runLedgerMigrations(client);
    await client.execute({sql:'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)',args:['b','tenant','user','exec','k',JSON.stringify({tenantId:'tenant',userId:'user',status:'RELEASED',remainingPaidCents:0,remainingPromoCents:0,consumedCents:10})]});
    await client.execute({sql:'INSERT INTO inference_calls(id,tenant_id,execution_id,call_id,operation_key,payload_json) VALUES(?,?,?,?,?,?)',args:['c','tenant','exec','call','op',JSON.stringify({tenantId:'tenant',userId:'user',status:'SETTLED',settlement:{actualCostCents:10},reason:'conteúdo privado'})]});
    await new AccountClosureBillingRetention(client).minimize({tenantId:'tenant',userId:'user',tenantPseudonym:'closed_tenant',userPseudonym:'closed_user'});
    const budgets = (await client.execute('SELECT * FROM inference_budgets')).rows;
    const calls = (await client.execute('SELECT * FROM inference_calls')).rows;
    expect(budgets[0].tenant_id).toBe('closed_tenant');
    expect(budgets[0].user_id).toBe('closed_user');
    expect(JSON.parse(String(budgets[0].payload_json))).toMatchObject({tenantId:'closed_tenant',userId:'closed_user',consumedCents:10});
    expect(calls[0].tenant_id).toBe('closed_tenant');
    expect(JSON.parse(String(calls[0].payload_json))).toMatchObject({tenantId:'closed_tenant',userId:'closed_user',settlement:{actualCostCents:10}});
    expect(JSON.stringify(calls)).not.toContain('conteúdo privado');
  } finally { client.close(); }
});

it('preserva os valores provisionados ao minimizar chamadas', async () => {
  const { client } = await createDatabase({ url: ':memory:' });
  try {
    await runPersistenceMigrations(client); await runLedgerMigrations(client);
    await client.execute({sql:'INSERT INTO inference_calls(id,tenant_id,execution_id,call_id,operation_key,payload_json) VALUES(?,?,?,?,?,?)',args:['c','tenant','exec','call','op',JSON.stringify({tenantId:'tenant',userId:'user',status:'PROVISIONED',provision:{basis:'UPPER_BOUND',amountCents:20,actualCostCents:null,recordedAt:'2026-10-29'}})]});
    await new AccountClosureBillingRetention(client).minimize({tenantId:'tenant',userId:'user',tenantPseudonym:'closed_tenant',userPseudonym:'closed_user'});
    const row = (await client.execute('SELECT payload_json FROM inference_calls')).rows[0];
    expect(JSON.parse(String(row.payload_json)).provision).toMatchObject({basis:'UPPER_BOUND',amountCents:20,actualCostCents:null});
  } finally { client.close(); }
});

it('remove dados privados de chaves de idempotência e operação ao minimizar inferência', async () => {
  const { client } = await createDatabase({url:':memory:'});
  try {
    await runPersistenceMigrations(client); await runLedgerMigrations(client);
    await client.execute({sql:'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)',args:['b','tenant','user','exec','nome-privado',JSON.stringify({status:'RELEASED',remainingPaidCents:0,remainingPromoCents:0})]});
    await client.execute({sql:'INSERT INTO inference_calls(id,tenant_id,execution_id,call_id,operation_key,payload_json) VALUES(?,?,?,?,?,?)',args:['c','tenant','exec','call','nome-privado',JSON.stringify({status:'SETTLED'})]});
    await new AccountClosureBillingRetention(client).minimize({tenantId:'tenant',userId:'user',tenantPseudonym:'closed_tenant',userPseudonym:'closed_user'});
    const retained = [(await client.execute('SELECT * FROM inference_budgets')).rows,(await client.execute('SELECT * FROM inference_calls')).rows];
    expect(JSON.stringify(retained)).not.toContain('nome-privado');
  } finally {client.close();}
});

it('preserva vínculo de cobrança e lançamento ao minimizar chave de inferência', async () => {
  const {client} = await createDatabase({url:':memory:'});
  try {
    await runPersistenceMigrations(client); await runLedgerMigrations(client); await seedFinancialRows(client);
    await client.execute("UPDATE ledger_entries SET idempotency_key='operation_idem' WHERE id='entry_1'");
    await client.execute({sql:'INSERT INTO inference_calls(id,tenant_id,execution_id,call_id,operation_key,payload_json) VALUES(?,?,?,?,?,?)',args:['c','tenant_original','exec','call','operation_idem',JSON.stringify({status:'SETTLED'})]});
    await new AccountClosureBillingRetention(client).minimize({tenantId:'tenant_original',userId:'user_original',tenantPseudonym:'tenant_closed_1',userPseudonym:'user_closed_1'});
    const call=(await client.execute('SELECT operation_key FROM inference_calls')).rows[0];
    const operation=(await client.execute('SELECT idempotency_key FROM billing_operations')).rows[0];
    const entry=(await client.execute('SELECT idempotency_key FROM ledger_entries')).rows[0];
    expect(call.operation_key).toBe(operation.idempotency_key);
    expect(call.operation_key).toBe(entry.idempotency_key);
    expect(call.operation_key).not.toBe('operation_idem');
  } finally {client.close();}
});

it('minimiza identificador de chamada fornecido pelo usuário', async () => {
  const {client}=await createDatabase({url:':memory:'});
  try {
    await runPersistenceMigrations(client); await runLedgerMigrations(client);
    await client.execute({sql:'INSERT INTO inference_calls(id,tenant_id,execution_id,call_id,operation_key,payload_json) VALUES(?,?,?,?,?,?)',args:['c','tenant','exec','nome-privado','op',JSON.stringify({status:'SETTLED',callId:'nome-privado'})]});
    await new AccountClosureBillingRetention(client).minimize({tenantId:'tenant',userId:'user',tenantPseudonym:'closed_tenant',userPseudonym:'closed_user'});
    expect(JSON.stringify((await client.execute('SELECT * FROM inference_calls')).rows)).not.toContain('nome-privado');
  } finally {client.close();}
});
