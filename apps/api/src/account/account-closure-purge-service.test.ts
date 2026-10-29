import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AccountClosureRepository,
  createDatabase,
  DraftRepository,
  DraftReviewRunRepository,
  MatterRepository,
  runPersistenceMigrations,
  type Client,
} from '@forgelex/persistence';
import { runLedgerMigrations } from '@forgelex/billing-ledger';
import { executarMigrationsAnalise } from '@forgelex/analise-juridica';
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
    for (const tenant of [fixture.tenantId, fixture.otherTenantId]) {
      await client.execute({
        sql: 'INSERT INTO saved_research_collections (tenant_id,user_id) VALUES (?,?)',
        args: [tenant, fixture.userId],
      });
      for (let slot = 1; slot <= 6; slot++)
        await client.execute({
          sql: 'INSERT INTO saved_research (id,tenant_id,user_id,slot,operation_id,result_snapshot,criteria_json,result_count,searched_at,saved_at) VALUES (?,?,?,?,?,?,?,0,?,?)',
          args: [
            randomUUID(),
            tenant,
            fixture.userId,
            slot,
            'saved-' + slot,
            '{"items":[]}',
            '{"query":"consulta","limit":10}',
            now,
            now,
          ],
        });
      await client.execute({
        sql: 'INSERT INTO saved_research_permissions (tenant_id,user_id,oauth_client_id,oauth_granted_at,enabled,updated_at) VALUES (?,?,?,?,1,?)',
        args: [tenant, fixture.userId, 'app', now, now],
      });
    }
    await client.execute({
      sql: 'INSERT INTO matter_lifecycle_purge_operations(operation_id,tenant_id,matter_id,expected_lifecycle_revision,fingerprint,local_state,prepared_at,completed_at) VALUES(?,?,?,1,?,?,?,?)',
      args: ['a'.repeat(64), fixture.tenantId, fixture.matterId, 'b'.repeat(64), 'COMMITTED', now, now],
    });

    const result = await service.purgePrivateContent({
      tenantId: fixture.tenantId,
      closureId: 'acl_1',
      now,
    });

    expect(result.remainingPrivateRows).toBe(0);
    for (const table of ['saved_research', 'saved_research_collections', 'saved_research_permissions']) {
      expect(
        await count(client, `SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`, [fixture.tenantId]),
      ).toBe(0);
      expect(
        await count(client, `SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`, [fixture.otherTenantId]),
      ).toBeGreaterThan(0);
    }
    const proofs = await client.execute({
      sql: 'SELECT tenant_id,local_state FROM matter_lifecycle_purge_operations WHERE operation_id=?',
      args: ['a'.repeat(64)],
    });
    expect(proofs.rows).toHaveLength(1);
    expect(proofs.rows[0].tenant_id).not.toBe(fixture.tenantId);
    expect(proofs.rows[0].local_state).toBe('COMMITTED');
    expect(
      await count(client, 'SELECT COUNT(*) AS count FROM matters WHERE tenant_id = ?', [fixture.otherTenantId]),
    ).toBeGreaterThan(0);
    expect(
      await count(client, 'SELECT COUNT(*) AS count FROM jurisprudence_documents WHERE id = ?', [
        fixture.jurisprudenceDocumentId,
      ]),
    ).toBe(1);
  });

  it('expurga análise opcional por tenant, filhos antes das sessões, mesmo com módulo desligado', async () => {
    await seedAnalysis(client, fixture.tenantId);
    await seedAnalysis(client, fixture.otherTenantId);
    const result = await new AccountClosurePurgeService(client).purgePrivateContent({
      tenantId: fixture.tenantId,
      closureId: 'acl_1',
      now,
    });
    expect(result.remainingPrivateRows).toBe(0);
    for (const table of analysisTables) {
      expect(await analysisCount(client, table, fixture.tenantId)).toBe(0);
      expect(await analysisCount(client, table, fixture.otherTenantId)).toBe(1);
    }
  });

  it('aceita instalação de análise sem a tabela opcional de operações', async () => {
    await seedAnalysis(client, fixture.tenantId);
    await client.execute('DROP TABLE analise_operacoes');
    const service = new AccountClosurePurgeService(client);
    await expect(
      service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now }),
    ).resolves.toMatchObject({ remainingPrivateRows: 0 });
    for (const table of analysisTables.filter((table) => table !== 'analise_operacoes'))
      expect(await analysisCount(client, table, fixture.tenantId)).toBe(0);
    await expect(
      service.verifyResiduals({ closureId: 'acl_1', tenantId: fixture.tenantId, tenantPseudonym: 'closed', now }),
    ).resolves.toMatchObject({ privateRows: 0 });
  });

  it.each(analysisTables)('bloqueia remoção de identidade se %s reaparece após o expurgo', async (table) => {
    const service = new AccountClosurePurgeService(client);
    await service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now });
    await seedAnalysis(client, fixture.tenantId);
    // Keep only the selected residual and, for FK children, its owning session.
    for (const other of analysisTables.filter((candidate) => candidate !== table && candidate !== 'analise_sessoes')) {
      await client.execute(`DELETE FROM ${other}`);
    }
    if (table !== 'analise_achados' && table !== 'analise_combos' && table !== 'analise_sessoes') {
      await client.execute('DELETE FROM analise_sessoes');
    }
    await expect(
      service.removeLocalIdentity({
        closureId: 'acl_1',
        tenantId: fixture.tenantId,
        tenantPseudonym: 'closed',
        userPseudonym: 'closed_user',
        closurePseudonym: 'closed_closure',
        now,
      }),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CLOSURE_RESIDUAL_DATA' });
    await service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now });
    await expect(
      service.verifyResiduals({ closureId: 'acl_1', tenantId: fixture.tenantId, tenantPseudonym: 'closed', now }),
    ).resolves.toMatchObject({ privateRows: 0 });
  });

  it('contabiliza resíduo de análise se uma exclusão não remover a linha', async () => {
    await seedAnalysis(client, fixture.tenantId);
    await client.execute(
      `CREATE TRIGGER keep_analysis_consumption BEFORE DELETE ON analise_consumos BEGIN SELECT RAISE(IGNORE); END`,
    );
    const result = await new AccountClosurePurgeService(client).purgePrivateContent({
      tenantId: fixture.tenantId,
      closureId: 'acl_1',
      now,
    });
    expect(result.remainingPrivateRows).toBe(1);
  });

  it.each(['SESSIONS', 'MATTERS'])('aplica a retenção %s à categoria correta da análise', async (category) => {
    const service = new AccountClosurePurgeService(client);
    await service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now });
    await seedAnalysis(client, fixture.tenantId);
    await client.execute({
      sql: `INSERT INTO retention_exceptions (id,closure_id,category,legal_basis_reference,authority_reference,responsible,starts_at,review_at,status) VALUES ('analysis_hold','acl_1',?,'LEGAL_HOLD','case','Boni',?,?,'ACTIVE')`,
      args: [category, now, now],
    });
    const result = await service.purgePrivateContent({ tenantId: fixture.tenantId, closureId: 'acl_1', now });
    expect(result.heldCategories).toEqual([category]);
    for (const table of analysisTables)
      expect(await analysisCount(client, table, fixture.tenantId)).toBe(category === 'SESSIONS' ? 1 : 0);
    await expect(
      service.verifyResiduals({ closureId: 'acl_1', tenantId: fixture.tenantId, tenantPseudonym: 'closed', now }),
    ).resolves.toMatchObject({ privateRows: 0 });
  });
  it('expurga execuções e seus achados antes das versões referenciadas', async () => {
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    try {
      const matter = await new MatterRepository(connection.db).createMatter({
        tenantId: fixture.tenantId,
        createdBy: fixture.userId,
        title: 'Caso com conferência',
      });
      const context = { tenantId: fixture.tenantId, userId: fixture.userId, matterId: matter.id };
      const drafts = new DraftRepository(connection.db);
      const draft = await drafts.createDraft({ ...context, createdBy: fixture.userId, title: 'Minuta' });
      const version = await drafts.createVersion({
        ...context,
        draftId: draft.id,
        createdBy: fixture.userId,
        title: 'Minuta',
        source: 'HUMAN',
        contentHash: 'a'.repeat(64),
        sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto' }],
      });
      const runs = new DraftReviewRunRepository(connection.db);
      const run = await runs.start(context, version.version, 'ALL', 'b'.repeat(64));
      await runs.finish(context, run.id, {
        state: 'COMPLETE',
        status: 'WARNINGS',
        checks: [],
        findings: [
          {
            ...context,
            draftId: draft.id,
            draftVersionId: version.version.id,
            reviewType: 'CITATION',
            severity: 'WARNING',
            code: 'CITATIONS_MISSING',
            message: 'Nenhuma referência cadastrada.',
          },
        ],
      });
      expect(
        await count(client, 'SELECT COUNT(*) AS count FROM draft_review_runs WHERE tenant_id = ?', [fixture.tenantId]),
      ).toBe(1);
      await client.execute({
        sql: "INSERT INTO case_ai_access_grants (id,tenant_id,user_id,oauth_client_id,oauth_granted_at,matter_id,revision,status,selection_json,created_at,updated_at) VALUES (?,?,?,?,?,?,1,'ACTIVE',?,?,?)",
        args: [
          randomUUID(),
          fixture.tenantId,
          fixture.userId,
          'app',
          now,
          matter.id,
          JSON.stringify({ documents: [], factIds: [], evidenceIds: [], thesisIds: [], authorityIds: [] }),
          now,
          now,
        ],
      });
      const grants = await client.execute({
        sql: 'SELECT id FROM case_ai_access_grants WHERE matter_id = ?',
        args: [matter.id],
      });
      await client.execute({
        sql: `INSERT INTO draft_ai_receipts (id,tenant_id,user_id,oauth_client_id,oauth_granted_at,matter_id,grant_id,grant_revision,draft_id,version_id,version_number,destination_json,key_hash,payload_hash,references_json,received_at) VALUES (?,?,?,?,?,?,?,1,?,?,1,?,?,?,'[]',?)`,
        args: [
          randomUUID(),
          fixture.tenantId,
          fixture.userId,
          'app',
          now,
          matter.id,
          String(grants.rows[0].id),
          draft.id,
          version.version.id,
          '{"mode":"EXISTING"}',
          'a'.repeat(64),
          'b'.repeat(64),
          now,
        ],
      });
      await new AccountClosurePurgeService(client).purgePrivateContent({
        tenantId: fixture.tenantId,
        closureId: 'acl_1',
        now,
      });
      expect(
        await count(client, 'SELECT COUNT(*) AS count FROM draft_ai_receipts WHERE tenant_id = ?', [fixture.tenantId]),
      ).toBe(0);
      expect(
        await count(client, 'SELECT COUNT(*) AS count FROM case_ai_access_grants WHERE tenant_id = ?', [
          fixture.tenantId,
        ]),
      ).toBe(0);
      expect(
        await count(client, 'SELECT COUNT(*) AS count FROM draft_review_runs WHERE tenant_id = ?', [fixture.tenantId]),
      ).toBe(0);
      expect(
        await count(client, 'SELECT COUNT(*) AS count FROM draft_review_findings WHERE tenant_id = ?', [
          fixture.tenantId,
        ]),
      ).toBe(0);
    } finally {
      connection.client.close();
    }
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

const analysisTables = [
  'analise_achados',
  'analise_combos',
  'analise_consumos',
  'analise_operacoes',
  'analise_sessoes',
] as const;

async function analysisCount(client: Client, table: string, tenantId: string): Promise<number> {
  const predicate =
    table === 'analise_achados'
      ? 'sessao_analitica_id IN (SELECT sessao_analitica_id FROM analise_sessoes WHERE tenant_id = ?)'
      : 'tenant_id = ?';
  return count(client, `SELECT COUNT(*) AS count FROM ${table} WHERE ${predicate}`, [tenantId]);
}

async function seedAnalysis(client: Client, tenantId: string): Promise<void> {
  await executarMigrationsAnalise(client);
  const session = `analysis_${tenantId}`;
  await client.execute({
    sql: `INSERT INTO analise_sessoes (sessao_analitica_id,tenant_id,usuario_id,numero_processo,criada_em,atualizada_em) VALUES (?,?,?,'sigiloso',?,?)`,
    args: [session, tenantId, 'user', now, now],
  });
  await client.execute({
    sql: `INSERT INTO analise_achados (id,sessao_analitica_id,ordem,tipo_analise,resumo,registrado_em) VALUES (?,?,1,'PROVA','privado',?)`,
    args: [`finding_${tenantId}`, session, now],
  });
  await client.execute({
    sql: `INSERT INTO analise_combos (id,tenant_id,usuario_id,sessao_analitica_id,combo,tools_restantes,preco_cents,ativado_em) VALUES (?,?,?,?,'completo','[]',100,?)`,
    args: [`combo_${tenantId}`, tenantId, 'user', session, now],
  });
  await client.execute({
    sql: `INSERT INTO analise_consumos (id,tenant_id,idempotency_key,sessao_analitica_id,tool,combo_id,resultado,criado_em) VALUES (?,?,?,?,'prova',?,'privado',?)`,
    args: [`consumption_${tenantId}`, tenantId, 'key', session, `combo_${tenantId}`, now],
  });
  await client.execute({
    sql: `INSERT INTO analise_operacoes (id,tenant_id,usuario_id,idempotency_key,sessao_analitica_id,tool,fingerprint,status,resultado,criado_em,atualizado_em) VALUES (?,?,?,'key',?,'prova','fingerprint','COMPLETED','privado',?,?)`,
    args: [`operation_${tenantId}`, tenantId, 'user', session, now, now],
  });
}

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

it('remove dados agênticos no encerramento preservando outro tenant', async () => {
  const connection = await createDatabase({ url: ':memory:' });
  const client = connection.client;
  try {
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    for (const tenant of ['encerrado', 'outro']) {
      await client.execute({ sql: 'INSERT INTO agentic_conversations(id,tenant_id,user_id,objective,matter_id,context_revision,created_at) VALUES(?,?,?,?,NULL,1,?)', args: [tenant, tenant, 'user', 'conteúdo privado', now] });
      await client.execute({ sql: 'INSERT INTO agentic_contexts(id,conversation_id,revision,payload_json,created_at) VALUES(?,?,1,?,?)', args: [tenant,tenant,'{}',now] });
      await client.execute({ sql: 'INSERT INTO agentic_executions(id,tenant_id,user_id,conversation_id,idempotency_key,input_hash,payload_json,event_sequence) VALUES(?,?,?,?,?,?,?,0)', args: [tenant,tenant,'user',tenant,tenant,tenant,'{}'] });
      await client.execute({ sql: 'INSERT INTO agentic_events(id,execution_id,sequence,type,payload_json,created_at) VALUES(?,?,1,?,?,?)', args: [tenant,tenant,'INTERNAL','{}',now] });
      await client.execute({ sql: 'INSERT INTO agentic_command_owners(id,tenant_id,user_id,version) VALUES(?,?,?,0)', args: [tenant,tenant,'user'] });
      await client.execute({ sql: 'INSERT INTO agentic_commands(id,tenant_id,user_id,idempotency_key,input_hash,execution_id,created_at) VALUES(?,?,?,?,?,?,?)', args: [tenant,tenant,'user',tenant,tenant,tenant,now] });
    }
    const service = new AccountClosurePurgeService(client);
    await expect(service.verifyResiduals({ closureId: 'closure', tenantId: 'encerrado', tenantPseudonym: 'pseudonimo', now })).rejects.toThrow('ACCOUNT_CLOSURE_RESIDUAL_DATA');
    await service.purgePrivateContent({ tenantId: 'encerrado', closureId: 'closure', now });
    for (const table of ['agentic_conversations','agentic_contexts','agentic_executions','agentic_events','agentic_commands','agentic_command_owners']) {
      expect((await client.execute(`SELECT id FROM ${table}`)).rows.map(row => row.id)).toEqual(['outro']);
    }
  } finally { client.close(); }
});

it('não apaga execução com trabalho agêntico em andamento durante encerramento', async () => {
  const connection = await createDatabase({ url: ':memory:' });
  const client = connection.client;
  try {
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    await client.execute({ sql: 'INSERT INTO agentic_conversations(id,tenant_id,user_id,objective,context_revision,created_at) VALUES(?,?,?,?,1,?)', args: ['c','encerrado','user','privado',now] });
    await client.execute({ sql: 'INSERT INTO agentic_executions(id,tenant_id,user_id,conversation_id,idempotency_key,input_hash,payload_json,event_sequence) VALUES(?,?,?,?,?,?,?,0)', args: ['e','encerrado','user','c','k','h','{}'] });
    await client.execute({ sql: 'INSERT INTO agentic_execution_jobs(execution_id,tenant_id,user_id,state,payload_json,created_at) VALUES(?,?,?,?,?,?)', args: ['e','encerrado','user','LEASED','{}',now] });
    await expect(new AccountClosurePurgeService(client).purgePrivateContent({ tenantId:'encerrado', closureId:'closure', now })).rejects.toThrow('ACCOUNT_CLOSURE_AGENTIC_PENDING');
    expect((await client.execute('SELECT id FROM agentic_executions')).rows).toHaveLength(1);
  } finally { client.close(); }
});

it('preserva conteúdo enquanto a conciliação financeira de inferência está pendente', async () => {
  const connection = await createDatabase({ url: ':memory:' });
  const client = connection.client;
  try {
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    await client.execute({ sql: 'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)', args: ['b','encerrado','user','e','k',JSON.stringify({ status:'ACTIVE' })] });
    await expect(new AccountClosurePurgeService(client).purgePrivateContent({ tenantId:'encerrado', closureId:'closure', now })).rejects.toThrow('ACCOUNT_CLOSURE_INFERENCE_PENDING');
  } finally { client.close(); }
});

it('detecta orçamento de inferência residual antes de concluir encerramento', async () => {
  const { client } = await createDatabase({ url: ':memory:' });
  try {
    await runPersistenceMigrations(client);
    await runLedgerMigrations(client);
    await client.execute({ sql: 'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)', args: ['b','encerrado','user','e','k','{"status":"RELEASED"}'] });
    await expect(new AccountClosurePurgeService(client).verifyResiduals({ closureId:'closure', tenantId:'encerrado', tenantPseudonym:'closed', now })).rejects.toThrow('ACCOUNT_CLOSURE_RESIDUAL_DATA');
  } finally { client.close(); }
});

it('permite expurgo de conteúdo com orçamento já liberado', async () => {
  const { client } = await createDatabase({ url: ':memory:' });
  try {
    await runPersistenceMigrations(client); await runLedgerMigrations(client);
    await client.execute({sql:'INSERT INTO inference_budgets(id,tenant_id,user_id,execution_id,idempotency_key,payload_json) VALUES(?,?,?,?,?,?)',args:['b','tenant','user','e','k',JSON.stringify({status:'RELEASED',remainingPaidCents:0,remainingPromoCents:0})]});
    await expect(new AccountClosurePurgeService(client).purgePrivateContent({tenantId:'tenant',closureId:'closure',now})).resolves.toMatchObject({remainingPrivateRows:0});
    expect((await client.execute('SELECT id FROM inference_budgets')).rows).toHaveLength(1);
  } finally { client.close(); }
});
