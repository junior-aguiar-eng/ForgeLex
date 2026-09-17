import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  createDatabase,
  AccountRepository,
  DraftRepository,
  MatterRepository,
  WebhookRepository,
  runPersistenceMigrations,
} from '../packages/persistence/dist/index.js';
import { LedgerService } from '../packages/billing-ledger/dist/index.js';

const databaseUrl = process.env.FORGELEX_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl || !/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error('BLOCKED_DATABASE_URL: defina DATABASE_URL ou FORGELEX_DATABASE_URL com uma URL PostgreSQL.');
  process.exitCode = 2;
} else {
  const tenantId = `smoke_${randomUUID()}`;
  const supabaseUserId = `postgres-smoke-user-${randomUUID()}`;
  let accountTenantId;
  const connection = await createDatabase({ url: databaseUrl });
  const client = connection.client;

  try {
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    const ledger = new LedgerService(connection.db, client);
    await ledger.runMigrations();

    const account = await new AccountRepository(connection.db).bootstrap({
      supabaseUserId,
      email: `${supabaseUserId}@example.test`,
      displayName: 'Postgres Smoke',
    });
    accountTenantId = account.tenant.id;
    await ledger.runMigrations();

    const matter = await new MatterRepository(connection.db).createMatter({
      tenantId,
      createdBy: 'postgres-smoke',
      title: 'Smoke PostgreSQL',
    });
    const ingested = await new MatterRepository(connection.db).ingestTextDocument({
      tenantId,
      matterId: matter.id,
      createdBy: 'postgres-smoke',
      title: 'Documento de smoke',
      originalFilename: 'smoke.txt',
      mimeType: 'text/plain',
      content: 'Conteúdo mínimo para validar a persistência PostgreSQL.',
    });
    const draft = await new DraftRepository(connection.db).createDraft({
      tenantId,
      matterId: matter.id,
      title: 'Rascunho de smoke',
      createdBy: 'postgres-smoke',
    });

    await ledger.provisionAccount(tenantId, { paidBalanceCents: 100, promotionalBalanceCents: 0 });
    const execution = await ledger.executeBillableOperation({
      tenantId,
      userId: 'postgres-smoke',
      idempotencyKey: `postgres-smoke-${randomUUID()}`,
      costCents: 15,
      usage: { capability: 'postgres.smoke', toolName: 'postgres.smoke', units: 1 },
      operation: async () => ({ ok: true }),
    });

    const webhookRepository = new WebhookRepository(client);
    const endpoint = await webhookRepository.createEndpoint({
      id: randomUUID(),
      tenantId,
      url: 'https://example.test/postgres-smoke',
      secretCiphertext: 'smoke-ciphertext',
      eventTypes: ['matter.created'],
    });
    const eventId = await webhookRepository.enqueueEvent({
      tenantId,
      eventType: 'matter.created',
      payloadJson: JSON.stringify({ id: randomUUID(), type: 'matter.created', tenantId }),
      endpointIds: [endpoint.id],
    });

    const counts = await client.execute({
      sql: `SELECT
        (SELECT COUNT(*) FROM matters WHERE tenant_id = ?) AS matters,
        (SELECT COUNT(*) FROM legal_documents WHERE tenant_id = ?) AS documents,
        (SELECT COUNT(*) FROM drafts WHERE tenant_id = ?) AS drafts,
        (SELECT COUNT(*) FROM usage_events WHERE tenant_id = ?) AS usage_events,
        (SELECT COUNT(*) FROM webhook_events WHERE tenant_id = ?) AS webhook_events,
        (SELECT COUNT(*) FROM webhook_deliveries WHERE tenant_id = ?) AS webhook_deliveries,
        (SELECT COUNT(*) FROM forgelex_user_profiles WHERE supabase_user_id = ?) AS account_users,
        (SELECT COUNT(*) FROM forgelex_tenant_memberships WHERE user_id = ?) AS account_memberships`,
      args: [tenantId, tenantId, tenantId, tenantId, tenantId, tenantId, supabaseUserId, account.user.id],
    });
    const row = counts.rows[0];
    assert.equal(Number(row.matters), 1);
    assert.equal(Number(row.documents), 1);
    assert.equal(Number(row.drafts), 1);
    assert.equal(Number(row.usage_events), 1);
    assert.equal(Number(row.webhook_events), 1);
    assert.equal(Number(row.webhook_deliveries), 1);
    assert.equal(Number(row.account_users), 1);
    assert.equal(Number(row.account_memberships), 1);
    assert.equal(execution.data.ok, true);
    assert.equal(ingested.document.matterId, matter.id);
    assert.equal(draft.matterId, matter.id);
    assert.ok(eventId);

    console.log(JSON.stringify({
      status: 'passed',
      driver: 'postgres',
      checks: ['migrations_idempotent', 'matter', 'document', 'draft', 'ledger', 'webhook_outbox'],
    }));
  } catch (error) {
    console.error(`POSTGRES_SMOKE_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  } finally {
    const cleanupStatements = [
      'DELETE FROM webhook_deliveries WHERE tenant_id = ?',
      'DELETE FROM webhook_events WHERE tenant_id = ?',
      'DELETE FROM webhook_endpoints WHERE tenant_id = ?',
      'DELETE FROM draft_review_findings WHERE tenant_id = ?',
      'DELETE FROM citation_anchors WHERE tenant_id = ?',
      'DELETE FROM draft_sections WHERE tenant_id = ?',
      'DELETE FROM draft_approval_decisions WHERE tenant_id = ?',
      'DELETE FROM draft_approval_tokens WHERE tenant_id = ?',
      'DELETE FROM draft_approval_requests WHERE tenant_id = ?',
      'DELETE FROM draft_versions WHERE tenant_id = ?',
      'DELETE FROM drafts WHERE tenant_id = ?',
      'DELETE FROM research_memos WHERE tenant_id = ?',
      'DELETE FROM legal_theses WHERE tenant_id = ?',
      'DELETE FROM legal_issues WHERE tenant_id = ?',
      'DELETE FROM matter_authorities WHERE tenant_id = ?',
      'DELETE FROM fact_source_links WHERE tenant_id = ?',
      'DELETE FROM evidence_source_links WHERE tenant_id = ?',
      'DELETE FROM evidence_links WHERE tenant_id = ?',
      'DELETE FROM timeline_events WHERE tenant_id = ?',
      'DELETE FROM facts WHERE tenant_id = ?',
      'DELETE FROM evidence_items WHERE tenant_id = ?',
      'DELETE FROM document_anchors WHERE document_version_id IN (SELECT dv.id FROM document_versions dv JOIN legal_documents ld ON ld.id = dv.document_id WHERE ld.tenant_id = ?)',
      'DELETE FROM document_versions WHERE document_id IN (SELECT id FROM legal_documents WHERE tenant_id = ?)',
      'DELETE FROM legal_documents WHERE tenant_id = ?',
      'DELETE FROM matters WHERE tenant_id = ?',
      'DELETE FROM ledger_entries WHERE account_id IN (SELECT id FROM ledger_accounts WHERE tenant_id = ?)',
      'DELETE FROM usage_events WHERE tenant_id = ?',
      'DELETE FROM ledger_accounts WHERE tenant_id = ?',
      'DELETE FROM audit_logs WHERE tenant_id = ?',
    ];
    for (const sql of cleanupStatements) {
      try {
        await client.execute({ sql, args: [tenantId] });
      } catch {
        // A partial setup may not have created every table before failing.
      }
    }
    if (accountTenantId) {
      for (const [sql, argument] of [
        ['DELETE FROM forgelex_tenant_memberships WHERE user_id IN (SELECT id FROM forgelex_user_profiles WHERE supabase_user_id = ?)', supabaseUserId],
        ['DELETE FROM forgelex_tenants WHERE id = ?', accountTenantId],
        ['DELETE FROM forgelex_user_profiles WHERE supabase_user_id = ?', supabaseUserId],
      ]) {
        try {
          await client.execute({ sql, args: [argument] });
        } catch {
          // A partial setup may not have created every table before failing.
        }
      }
    }
    client.close();
  }
}
