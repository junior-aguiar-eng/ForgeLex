import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { createDatabase, type ForgeLexDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { AccountRepository } from './account-repository.js';

describe('AccountRepository', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: AccountRepository;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(client);
    repository = new AccountRepository(db);
  });

  afterEach(() => client.close());

  it('cria um perfil, um espaço pessoal e um vínculo de proprietário de forma idempotente', async () => {
    const first = await repository.bootstrap({
      supabaseUserId: 'supabase-user-1',
      email: 'Pessoa@Exemplo.com',
      displayName: 'Pessoa Exemplo',
    });
    const replay = await repository.bootstrap({
      supabaseUserId: 'supabase-user-1',
      email: 'pessoa.nova@exemplo.com',
      displayName: 'Pessoa Nova',
    });

    expect(replay.user.id).toBe(first.user.id);
    expect(replay.tenant.id).toBe(first.tenant.id);
    expect(replay.membership.id).toBe(first.membership.id);
    expect(replay.user.email).toBe('pessoa.nova@exemplo.com');
    expect(replay.tenant.name).toBe('Espaço de Pessoa Exemplo');
    expect(replay.membership).toMatchObject({ role: 'OWNER', status: 'ACTIVE' });

    const counts = await client.execute(`
      SELECT
        (SELECT COUNT(*) FROM forgelex_user_profiles) AS users,
        (SELECT COUNT(*) FROM forgelex_tenants) AS tenants,
        (SELECT COUNT(*) FROM forgelex_tenant_memberships) AS memberships
    `);
    expect(counts.rows[0]).toMatchObject({ users: 1, tenants: 1, memberships: 1 });
  });

  it('mantém o isolamento ao consultar usuários diferentes', async () => {
    const first = await repository.bootstrap({ supabaseUserId: 'supabase-user-a', email: 'a@exemplo.com', displayName: 'Pessoa A' });
    const second = await repository.bootstrap({ supabaseUserId: 'supabase-user-b', email: 'b@exemplo.com', displayName: 'Pessoa B' });

    expect(first.tenant.id).not.toBe(second.tenant.id);
    expect(await repository.findBySupabaseUserId('supabase-user-a')).toMatchObject({ user: { email: 'a@exemplo.com' } });
    expect(await repository.findByUserAndTenant(first.user.id, second.tenant.id)).toBeUndefined();
  });
});
