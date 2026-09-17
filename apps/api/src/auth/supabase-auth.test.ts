import { describe, expect, it } from 'vitest';
import type { AccountRepository, StoredAccount } from '@forgelex/persistence';
import {
  SupabaseIdentityVerifier,
  SupabaseTokenVerifier,
  createSupabaseIdentityVerifier,
} from './fastify-auth.js';

const activeAccount: StoredAccount = {
  user: {
    id: 'user_1',
    supabaseUserId: 'supabase-user-1',
    email: 'pessoa@exemplo.com',
    displayName: 'Pessoa Exemplo',
    status: 'ACTIVE',
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  },
  tenant: {
    id: 'tenant_1',
    name: 'Espaço de Pessoa Exemplo',
    status: 'ACTIVE',
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  },
  membership: {
    id: 'membership_1',
    role: 'OWNER',
    status: 'ACTIVE',
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
  },
};

function verifierFor(body: unknown, status = 200) {
  return new SupabaseIdentityVerifier({
    baseUrl: 'https://project.supabase.co',
    publishableKey: 'publishable-key',
    fetchImpl: async (input, init) => {
      expect(input).toBe('https://project.supabase.co/auth/v1/user');
      expect(init?.headers).toMatchObject({ apikey: 'publishable-key', Authorization: 'Bearer access-token' });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    },
  });
}

describe('Supabase authentication', () => {
  it('valida a identidade, exige e-mail confirmado e produz o principal do espaço', async () => {
    const identityVerifier = verifierFor({
      id: 'supabase-user-1',
      email: 'Pessoa@Exemplo.com',
      email_confirmed_at: '2026-09-17T00:00:00.000Z',
      user_metadata: { full_name: 'Pessoa Exemplo' },
    });
    const accountRepository = { findBySupabaseUserId: async () => activeAccount } as unknown as AccountRepository;
    const principal = await new SupabaseTokenVerifier(identityVerifier, accountRepository).verify('access-token');

    expect(principal).toMatchObject({
      subjectId: 'supabase-user-1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      authMethod: 'session',
      roles: ['owner'],
      scopes: ['mcp', 'research:read', 'matter:read', 'matter:write', 'draft:write', 'billing:read'],
    });
  });

  it('recusa e-mail não confirmado, conta desativada e resposta inválida', async () => {
    const unconfirmed = verifierFor({ id: 'supabase-user-1', email: 'pessoa@exemplo.com', email_confirmed_at: null });
    const accountRepository = { findBySupabaseUserId: async () => activeAccount } as unknown as AccountRepository;
    expect(await new SupabaseTokenVerifier(unconfirmed, accountRepository).verify('access-token')).toBeNull();

    const disabledAccount = { ...activeAccount, user: { ...activeAccount.user, status: 'DISABLED' as const } };
    const confirmed = verifierFor({ id: 'supabase-user-1', email: 'pessoa@exemplo.com', email_confirmed_at: 'now' });
    const disabledRepository = { findBySupabaseUserId: async () => disabledAccount } as unknown as AccountRepository;
    expect(await new SupabaseTokenVerifier(confirmed, disabledRepository).verify('access-token')).toBeNull();

    const malformed = verifierFor({ id: 123, email: 'pessoa@exemplo.com' });
    expect(await malformed.verify('access-token')).toBeNull();
  });

  it('falha fechado em timeout ou indisponibilidade e não exige configuração ausente', async () => {
    const unavailable = new SupabaseIdentityVerifier({
      baseUrl: 'https://project.supabase.co',
      publishableKey: 'publishable-key',
      timeoutMs: 1,
      fetchImpl: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    });
    expect(await unavailable.verify('access-token')).toBeNull();
    expect(createSupabaseIdentityVerifier({})).toBeUndefined();
    expect(createSupabaseIdentityVerifier({ FORGELEX_SUPABASE_URL: 'https://project.supabase.co' })).toBeUndefined();
  });
});
