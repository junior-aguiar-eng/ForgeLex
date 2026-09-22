import { createHash, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Client } from '@libsql/client';
import type { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import { AccountClosureRepository, createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { buildApp } from '../app.js';
import { AuthAdapter, ClosureAwareTokenVerifier, SupabaseIdentityVerifier } from '../auth/fastify-auth.js';
import { ACCOUNT_CLOSURE_POLICY } from './account-closure-policy.js';

const secret = 's'.repeat(64);
let subjectId: string;
let principal: AuthenticatedPrincipal;

function jwt(passwordAgeSeconds = 10, method = 'password'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode({ amr: [{ method, timestamp: Math.floor(Date.now() / 1_000) - passwordAgeSeconds }] })}.`;
}

class FixtureVerifier implements TokenVerifier {
  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    if (token === 'invalid') return null;
    if (token === 'api-key') return { ...principal, authMethod: 'api_key' };
    return principal;
  }
}

const body = { confirmation: ACCOUNT_CLOSURE_POLICY.confirmation, policyVersion: ACCOUNT_CLOSURE_POLICY.version };
const headers = (token: string, key = 'key-1') => ({ authorization: `Bearer ${token}`, 'idempotency-key': key });

describe('account closure HTTP', () => {
  let app: FastifyInstance | undefined;
  let client: Client | undefined;

  afterEach(async () => {
    await app?.close();
    client?.close();
    app = undefined;
    client = undefined;
  });

  async function setup(enabled: boolean, sharedTenant = false) {
    subjectId = `supabase_${randomUUID()}`;
    const suffix = createHash('sha256').update(subjectId).digest('hex').slice(0, 32);
    principal = {
      subjectId,
      userId: `user_${suffix}`,
      tenantId: `tenant_${suffix}`,
      roles: ['owner'],
      scopes: ['matter:read'],
      authMethod: 'session',
    };
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    client = connection.client;
    await runPersistenceMigrations(client);
    const ledgerService = new LedgerService(connection.db, client);
    await ledgerService.runMigrations();
    const fixture = new FixtureVerifier();
    const repository = new AccountClosureRepository(client);
    const identityVerifier = new SupabaseIdentityVerifier({
      baseUrl: 'https://project.supabase.co',
      publishableKey: 'public-key',
      fetchImpl: async (_url, init) =>
        new Response(
          init?.headers && (init.headers as Record<string, string>).Authorization === 'Bearer invalid'
            ? null
            : JSON.stringify({
                id:
                  (init?.headers as Record<string, string>).Authorization === 'Bearer mismatch'
                    ? 'other-subject'
                    : subjectId,
                email: 'pessoa@exemplo.com',
                email_confirmed_at: new Date().toISOString(),
              }),
          {
            status:
              init?.headers && (init.headers as Record<string, string>).Authorization === 'Bearer invalid' ? 401 : 200,
          },
        ),
    });
    app = await buildApp({
      database: connection.db,
      databaseClient: client,
      ledgerService,
      authAdapter: new AuthAdapter(new ClosureAwareTokenVerifier(fixture, repository)),
      supabaseIdentityVerifier: identityVerifier,
      environment: {
        NODE_ENV: 'test',
        FORGELEX_ACCOUNT_CLOSURE_ENABLED: String(enabled),
        FORGELEX_ACCOUNT_CLOSURE_STATUS_TOKEN_SECRET: secret,
        FORGELEX_ACCOUNT_CLOSURE_SUBJECT_HASH_SECRET: 'h'.repeat(64),
      },
    });
    const bootstrap = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/bootstrap',
      headers: headers(jwt()),
      payload: { displayName: 'Pessoa Exemplo' },
    });
    expect(bootstrap.statusCode).toBe(200);
    if (sharedTenant) {
      const otherUserId = `user_${randomUUID()}`;
      await client.execute({
        sql: `INSERT INTO forgelex_user_profiles (id, supabase_user_id, email, display_name, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`,
        args: [
          otherUserId,
          randomUUID(),
          `${otherUserId}@example.com`,
          'Other',
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      });
      await client.execute({
        sql: `INSERT INTO forgelex_tenant_memberships (id, tenant_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'MEMBER', 'ACTIVE', ?, ?)`,
        args: [randomUUID(), principal.tenantId, otherUserId, new Date().toISOString(), new Date().toISOString()],
      });
    }
    return { app, repository };
  }

  it('expõe política autenticada, mas mantém a operação desligada por padrão', async () => {
    const { app } = await setup(false);
    const policy = await app.inject({ method: 'GET', url: '/api/v2/account/closure-policy', headers: headers(jwt()) });
    expect(policy.statusCode).toBe(200);
    expect(policy.json()).toMatchObject({
      enabled: false,
      version: ACCOUNT_CLOSURE_POLICY.version,
      confirmation: ACCOUNT_CLOSURE_POLICY.confirmation,
      retention: expect.arrayContaining([
        { category: 'private_content', disposition: 'delete', deadline: '7d' },
        { category: 'financial_records', disposition: 'minimize_and_retain', deadline: 'provisional_5y' },
      ]),
    });
    const close = await app.inject({
      method: 'POST',
      url: '/api/v2/account/closure',
      headers: headers(jwt()),
      payload: body,
    });
    expect(close.statusCode).toBe(404);
    expect(close.json().error).toBe('ACCOUNT_CLOSURE_DISABLED');
  });

  it('exige sessão, identidade coincidente, senha recente e confirmação exata', async () => {
    const { app } = await setup(true);
    const post = (token: string, payload = body) =>
      app.inject({ method: 'POST', url: '/api/v2/account/closure', headers: headers(token), payload });
    expect((await app.inject({ method: 'POST', url: '/api/v2/account/closure', payload: body })).statusCode).toBe(401);
    expect((await post('invalid')).statusCode).toBe(401);
    expect((await post('mismatch')).statusCode).toBe(401);
    expect((await post('api-key')).json().error).toBe('SESSION_REQUIRED');
    expect((await post(jwt(301))).json().error).toBe('ACCOUNT_CLOSURE_REAUTH_REQUIRED');
    expect((await post(jwt(10, 'token_refresh'))).json().error).toBe('ACCOUNT_CLOSURE_REAUTH_REQUIRED');
    expect((await post(jwt(), { ...body, confirmation: 'ENCERRAR' })).json().error).toBe(
      'ACCOUNT_CLOSURE_CONFIRMATION_INVALID',
    );
    expect((await post(jwt(), { ...body, policyVersion: 'old' })).json().error).toBe(
      'ACCOUNT_CLOSURE_POLICY_VERSION_MISMATCH',
    );
  });

  it('bloqueia tenant compartilhado sem criar encerramento', async () => {
    const { app } = await setup(true, true);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/account/closure',
      headers: headers(jwt()),
      payload: body,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER');
  });

  it('recusa sessão de workspace que não seja o espaço pessoal determinístico', async () => {
    const { app } = await setup(true);
    principal = { ...principal, tenantId: 'tenant_organizacional' };
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/account/closure',
      headers: headers(jwt()),
      payload: body,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER');
  });

  it('recusa encerrar o perfil que ainda participa de outro workspace', async () => {
    const { app } = await setup(true);
    const otherTenantId = `tenant_${randomUUID()}`;
    const now = new Date().toISOString();
    await client!.execute({
      sql: `INSERT INTO forgelex_tenants (id, name, status, created_at, updated_at) VALUES (?, 'Outro espaço', 'ACTIVE', ?, ?)`,
      args: [otherTenantId, now, now],
    });
    await client!.execute({
      sql: `INSERT INTO forgelex_tenant_memberships (id, tenant_id, user_id, role, status, created_at, updated_at) VALUES (?, ?, ?, 'MEMBER', 'ACTIVE', ?, ?)`,
      args: [randomUUID(), otherTenantId, principal.userId, now, now],
    });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/account/closure',
      headers: headers(jwt()),
      payload: body,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('ACCOUNT_CLOSURE_REQUIRES_OWNERSHIP_TRANSFER');
  });

  it('aceita, reproduz sem duplicar e expõe apenas andamento pelo token opaco', async () => {
    const { app, repository } = await setup(true);
    const token = jwt();
    const first = await app.inject({
      method: 'POST',
      url: '/api/v2/account/closure',
      headers: headers(token),
      payload: body,
    });
    expect(first.statusCode, first.body).toBe(202);
    const { closureId, statusToken } = first.json();
    expect(first.json()).toMatchObject({ status: 'ACCESS_BLOCKED', policyVersion: ACCOUNT_CLOSURE_POLICY.version });
    const bootstrap = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/bootstrap',
      headers: headers(token),
      payload: { displayName: 'Pessoa Exemplo' },
    });
    expect(bootstrap.statusCode).toBe(403);
    expect(bootstrap.json().error).toBe('ACCOUNT_CLOSED');
    const replay = await app.inject({
      method: 'POST',
      url: '/api/v2/account/closure',
      headers: headers(token),
      payload: body,
    });
    expect(replay.statusCode).toBe(202);
    expect(replay.json()).toMatchObject({ closureId, statusToken });
    expect((await app.inject({ method: 'GET', url: '/api/v2/auth/me', headers: headers(token) })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v2/matters', headers: headers(token) })).statusCode).toBe(401);
    const conflict = await app.inject({
      method: 'POST',
      url: '/api/v2/account/closure',
      headers: headers(token, 'other-key'),
      payload: body,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe('ACCOUNT_CLOSURE_IDEMPOTENCY_CONFLICT');
    const status = await app.inject({
      method: 'GET',
      url: `/api/v2/account/closure/${closureId}`,
      headers: { 'x-closure-token': statusToken },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ closureId, status: 'ACCESS_BLOCKED' });
    expect(status.body).not.toContain(subjectId);
    expect(status.body).not.toContain('pessoa@exemplo.com');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v2/account/closure/${closureId}`,
          headers: { 'x-closure-token': 'wrong' },
        })
      ).statusCode,
    ).toBe(401);
    expect(await repository.findById(closureId)).toBeDefined();
    expect((await app.inject({ method: 'DELETE', url: '/api/v2/account', headers: headers(token) })).statusCode).toBe(
      404,
    );
  });
});
