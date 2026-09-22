import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountClosureRepository, createDatabase, runPersistenceMigrations, type Client } from '@forgelex/persistence';
import { runLedgerMigrations } from '@forgelex/billing-ledger';
import { AccountClosurePurgeService } from './account-closure-purge-service.js';

interface ClosurePurgeFixture {
  tenantId: string;
  userId: string;
  otherTenantId: string;
  matterId: string;
  purchaseId: string;
  jurisprudenceDocumentId: string;
}

const now = '2026-09-22T12:00:00.000Z';

describe('AccountClosurePurgeService', () => {
  let client: Client;
  let databasePath: string;
  let fixture: ClosurePurgeFixture;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `.forgelex-closure-purge-${randomUUID()}.db`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    client = connection.client;
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    fixture = await createFixture(client);
  });

  afterEach(() => {
    client.close();
    try {
      rmSync(databasePath, { force: true });
    } catch {
      /* SQLite pode liberar depois do worker. */
    }
  });

  it('remove todo conteúdo privado sem tocar outro tenant ou corpus global', async () => {
    const service = new AccountClosurePurgeService(client);

    const result = await service.purgePrivateContent({
      tenantId: fixture.tenantId,
      closureId: 'acl_1',
      now,
    });

    expect(result.remainingPrivateRows).toBe(0);
    expect(
      await count(client, 'SELECT COUNT(*) AS count FROM matters WHERE tenant_id = ?', [fixture.otherTenantId]),
    ).toBeGreaterThan(0);
    expect(
      await count(client, 'SELECT COUNT(*) AS count FROM jurisprudence_documents WHERE id = ?', [
        fixture.jurisprudenceDocumentId,
      ]),
    ).toBe(1);
  });

  it('preserva somente a categoria coberta por exceção vigente', async () => {
    await client.execute({
      sql: `INSERT INTO retention_exceptions (
        id, closure_id, category, legal_basis_reference, authority_reference,
        responsible, starts_at, review_at, ends_at, status
      ) VALUES (?, ?, 'MATTERS', 'LEGAL_HOLD', 'case_1', 'legal_team', ?, ?, NULL, 'ACTIVE')`,
      args: ['hold_1', 'acl_1', '2026-09-21T00:00:00.000Z', '2026-10-01T00:00:00.000Z'],
    });

    const result = await new AccountClosurePurgeService(client).purgePrivateContent({
      tenantId: fixture.tenantId,
      closureId: 'acl_1',
      now,
    });

    expect(result.heldCategories).toEqual(['MATTERS']);
    expect(await count(client, 'SELECT COUNT(*) AS count FROM matters WHERE tenant_id = ?', [fixture.tenantId])).toBe(
      1,
    );
    expect(
      await count(client, 'SELECT COUNT(*) AS count FROM research_search_history WHERE tenant_id = ?', [
        fixture.tenantId,
      ]),
    ).toBe(0);
  });

  it('falha fechado quando uma credencial ativa reaparece após o expurgo', async () => {
    const service = new AccountClosurePurgeService(client);
    await service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now });
    await client.execute({
      sql: `INSERT INTO api_keys
        (id, tenant_id, subject_id, user_id, name, key_prefix, token_hash,
         roles, scopes, created_at)
        VALUES ('key_residual', ?, 'subject_disposable', ?, 'residual', 'flx',
          'hash_residual', '[]', '[]', ?)`,
      args: [fixture.tenantId, fixture.userId, now],
    });

    await expect(
      service.verifyResiduals({
        closureId: 'acl_1',
        tenantId: fixture.tenantId,
        tenantPseudonym: 'tenant_closed_1',
        now,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CLOSURE_RESIDUAL_DATA' });
  });

  it('não confirma a remoção local enquanto houver titular financeiro direto', async () => {
    const service = new AccountClosurePurgeService(client);
    await service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now });
    await client.execute({
      sql: `INSERT INTO ledger_accounts
        (id, tenant_id, paid_balance_cents, promotional_balance_cents, created_at, updated_at)
        VALUES ('ledger_unminimized', ?, 100, 0, ?, ?)`,
      args: [fixture.tenantId, now, now],
    });

    await expect(
      service.removeLocalIdentity({
        closureId: 'acl_1',
        tenantId: fixture.tenantId,
        userId: fixture.userId,
        tenantPseudonym: 'tenant_closed_1',
        userPseudonym: 'user_closed_1',
        closurePseudonym: 'closure_acl_1',
        now,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CLOSURE_RESIDUAL_DATA' });
    expect(await row(client, 'SELECT tenant_id FROM account_closures WHERE id = ?', ['acl_1'])).toMatchObject({
      tenant_id: fixture.tenantId,
    });
  });

  it('pseudonimiza auditoria, remove identidade local e aceita retry sem IDs', async () => {
    const service = new AccountClosurePurgeService(client);
    await service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now });
    await client.batch(
      [
        {
          sql: `INSERT INTO forgelex_user_profiles
          (id, supabase_user_id, email, display_name, status, created_at, updated_at)
          VALUES (?, 'subject_disposable', 'private@example.invalid', 'Privado', 'BLOCKED', ?, ?)`,
          args: [fixture.userId, now, now],
        },
        {
          sql: `INSERT INTO forgelex_tenants
          (id, name, status, created_at, updated_at)
          VALUES (?, 'Tenant privado', 'BLOCKED', ?, ?)`,
          args: [fixture.tenantId, now, now],
        },
        {
          sql: `INSERT INTO forgelex_tenant_memberships
          (id, tenant_id, user_id, role, status, created_at, updated_at)
          VALUES ('membership_1', ?, ?, 'OWNER', 'BLOCKED', ?, ?)`,
          args: [fixture.tenantId, fixture.userId, now, now],
        },
        {
          sql: `INSERT INTO audit_logs
          (id, session_id, tenant_id, user_id, duration_ms, status, payload_hash, created_at)
          VALUES ('audit_1', 'session_private', ?, ?, 1, 'SUCCESS', 'hash', ?)`,
          args: [fixture.tenantId, fixture.userId, now],
        },
      ],
      'write',
    );

    const pseudonyms = {
      tenantPseudonym: 'tenant_closed_1',
      userPseudonym: 'user_closed_1',
      closurePseudonym: 'closure_acl_1',
    };
    await service.removeLocalIdentity({
      closureId: 'acl_1',
      tenantId: fixture.tenantId,
      userId: fixture.userId,
      ...pseudonyms,
      now,
    });
    await expect(
      service.removeLocalIdentity({
        closureId: 'acl_1',
        ...pseudonyms,
        now,
      }),
    ).resolves.toBeUndefined();

    expect(
      await row(client, 'SELECT subject_id, user_id, tenant_id FROM account_closures WHERE id = ?', ['acl_1']),
    ).toMatchObject({ subject_id: null, user_id: null, tenant_id: null });
    expect(
      await row(client, 'SELECT session_id, tenant_id, user_id FROM audit_logs WHERE id = ?', ['audit_1']),
    ).toMatchObject({ session_id: 'closure_acl_1', tenant_id: 'tenant_closed_1', user_id: 'user_closed_1' });
    expect(await count(client, 'SELECT COUNT(*) AS count FROM forgelex_tenants WHERE id = ?', [fixture.tenantId])).toBe(
      0,
    );
    expect(
      await count(client, 'SELECT COUNT(*) AS count FROM forgelex_user_profiles WHERE id = ?', [fixture.userId]),
    ).toBe(0);
  });
});

async function count(client: Client, sql: string, args: Array<string>): Promise<number> {
  const result = await client.execute({ sql, args });
  return Number(result.rows[0]?.count ?? 0);
}

async function row(client: Client, sql: string, args: Array<string>): Promise<Record<string, unknown>> {
  return (await client.execute({ sql, args })).rows[0] as Record<string, unknown>;
}

async function createFixture(client: Client): Promise<ClosurePurgeFixture> {
  const fixture: ClosurePurgeFixture = {
    tenantId: 'tenant_disposable',
    userId: 'user_disposable',
    otherTenantId: 'tenant_control',
    matterId: 'matter_disposable',
    purchaseId: 'purchase_disposable',
    jurisprudenceDocumentId: 'jurisprudence_global',
  };
  const repository = new AccountClosureRepository(client);
  await repository.create({
    id: 'acl_1',
    subjectId: 'subject_disposable',
    userId: fixture.userId,
    tenantId: fixture.tenantId,
    subjectHash: 's'.repeat(64),
    userHash: 'u'.repeat(64),
    tenantHash: 't'.repeat(64),
    statusTokenHash: 'k'.repeat(64),
    idempotencyKeyHash: 'i'.repeat(64),
    requestFingerprint: 'f'.repeat(64),
    policyVersion: '2026-09-22.v1',
    requestedAt: now,
  });
  await client.batch(
    [
      {
        sql: `INSERT INTO matters (id, tenant_id, title, status, created_by, created_at, updated_at) VALUES (?, ?, 'Sigiloso', 'OPEN', ?, ?, ?)`,
        args: [fixture.matterId, fixture.tenantId, fixture.userId, now, now],
      },
      {
        sql: `INSERT INTO matters (id, tenant_id, title, status, created_by, created_at, updated_at) VALUES ('matter_control', ?, 'Controle', 'OPEN', 'user_control', ?, ?)`,
        args: [fixture.otherTenantId, now, now],
      },
      {
        sql: `INSERT INTO research_search_history (id, tenant_id, user_id, operation_id, query, court, result_count, billing_mode, charged_cents, created_at) VALUES ('history_target', ?, ?, 'op_target', 'consulta sigilosa', 'STJ', 1, 'METERED', 20, ?)`,
        args: [fixture.tenantId, fixture.userId, now],
      },
      {
        sql: `INSERT INTO sessions (id, tenant_id, user_id, matter_id, status, model, created_at, updated_at) VALUES ('session_target', ?, ?, ?, 'COMPLETED', 'model', ?, ?)`,
        args: [fixture.tenantId, fixture.userId, fixture.matterId, now, now],
      },
      {
        sql: `INSERT INTO session_messages (id, session_id, role, content, created_at) VALUES ('message_target', 'session_target', 'user', 'conteúdo sigiloso', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO webhook_endpoints (id, tenant_id, url, secret_ciphertext, event_types, status, created_at, updated_at) VALUES ('endpoint_target', ?, 'https://example.invalid', 'ciphertext', '[]', 'ACTIVE', ?, ?)`,
        args: [fixture.tenantId, now, now],
      },
      {
        sql: `INSERT INTO webhook_events (id, tenant_id, event_type, payload_json, occurred_at, created_at) VALUES ('event_target', ?, 'test', '{}', ?, ?)`,
        args: [fixture.tenantId, now, now],
      },
      {
        sql: `INSERT INTO webhook_deliveries (id, event_id, endpoint_id, tenant_id, status, next_attempt_at, created_at, updated_at) VALUES ('delivery_target', 'event_target', 'endpoint_target', ?, 'PENDING', ?, ?, ?)`,
        args: [fixture.tenantId, now, now, now],
      },
      {
        sql: `INSERT INTO api_keys (id, tenant_id, subject_id, user_id, name, key_prefix, token_hash, roles, scopes, created_at) VALUES ('key_target', ?, 'subject_disposable', ?, 'key', 'flx', 'hash_target', '[]', '[]', ?)`,
        args: [fixture.tenantId, fixture.userId, now],
      },
      {
        sql: `INSERT INTO jurisprudence_ingestion_runs (id, provider_id, court, status, started_at) VALUES ('run_global', 'provider', 'STJ', 'COMPLETED', ?)`,
        args: [now],
      },
      {
        sql: `INSERT INTO jurisprudence_documents (id, court, process_number, normalized_process_number, search_text, search_identity_text, search_authority_text, search_vector, content_hash, dedupe_key, first_seen_at, last_seen_at, ingestion_run_id, created_at, updated_at) VALUES (?, 'STJ', '1', '1', 'Ementa pública', '1', 'Relator', '', 'hash', 'dedupe_global', ?, ?, 'run_global', ?, ?)`,
        args: [fixture.jurisprudenceDocumentId, now, now, now, now],
      },
    ],
    'write',
  );
  return fixture;
}
