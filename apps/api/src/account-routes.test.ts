import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Client } from '@libsql/client';
import type { AuthenticatedPrincipal, TokenVerifier } from '@forgelex/domain';
import { AuthAdapter, SupabaseIdentityVerifier } from './auth/fastify-auth.js';
import { buildApp } from './app.js';
import { createDatabase, runPersistenceMigrations, type ForgeLexDatabase } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';

const sessionPrincipal: AuthenticatedPrincipal = {
  subjectId: 'supabase-user-1',
  tenantId: `tenant_${createHash('sha256').update('supabase-user-1', 'utf8').digest('hex').slice(0, 32)}`,
  userId: `user_${createHash('sha256').update('supabase-user-1', 'utf8').digest('hex').slice(0, 32)}`,
  roles: ['owner'],
  scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read'],
  authMethod: 'session',
};

class SessionVerifier implements TokenVerifier {
  public async verify(token: string): Promise<AuthenticatedPrincipal | null> {
    return token === 'access-token' ? sessionPrincipal : null;
  }
}

describe('Account routes', () => {
  let app: FastifyInstance;
  let client: Client;
  let database: ForgeLexDatabase;

  beforeAll(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    database = connection.db;
    client = connection.client;
    await runPersistenceMigrations(client);
    const ledgerService = new LedgerService(database, client);
    await ledgerService.runMigrations();
    const identityVerifier = new SupabaseIdentityVerifier({
      baseUrl: 'https://project.supabase.co',
      publishableKey: 'publishable-key',
      fetchImpl: async () => new Response(JSON.stringify({
        id: 'supabase-user-1',
        email: 'pessoa@exemplo.com',
        email_confirmed_at: '2026-09-17T00:00:00.000Z',
        user_metadata: { full_name: 'Pessoa Exemplo' },
      }), { status: 200 }),
    });
    app = await buildApp({
      database,
      databaseClient: client,
      ledgerService,
      authAdapter: new AuthAdapter(new SessionVerifier()),
      supabaseIdentityVerifier: identityVerifier,
      environment: { NODE_ENV: 'test', FORGELEX_ALLOWED_ORIGINS: 'http://localhost:3000' },
    });
  });

  afterAll(async () => {
    await app.close();
    client.close();
  });

  it('cria a conta e ignora IDs, espaço, papel e permissões enviados pelo navegador', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v2/auth/bootstrap',
      headers: { authorization: 'Bearer access-token' },
      payload: {
        displayName: 'Pessoa Exemplo',
        userId: 'outro-usuario',
        tenantId: 'outro-espaco',
        role: 'admin',
        scopes: ['billing:write'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      user: { email: 'pessoa@exemplo.com', displayName: 'Pessoa Exemplo' },
      workspace: { name: 'Espaço de Pessoa Exemplo' },
      membership: { role: 'OWNER', status: 'ACTIVE' },
    });
    expect(JSON.parse(response.body).workspace.id).not.toBe('outro-espaco');
  });

  it('retorna apenas a conta vinculada à sessão autenticada', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v2/auth/me',
      headers: { authorization: 'Bearer access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({ user: { email: 'pessoa@exemplo.com' }, membership: { role: 'OWNER' } });
  });
});
