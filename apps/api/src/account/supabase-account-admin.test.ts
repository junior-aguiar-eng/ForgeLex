import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAccountAdmin } from './supabase-account-admin.js';

function clientReturning(input: { error: unknown; user?: { id: string } }): SupabaseClient {
  return {
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({
          data: { user: input.user ?? null },
          error: input.error,
        }),
      },
    },
  } as unknown as SupabaseClient;
}

function clientThrowing(error: Error): SupabaseClient {
  return {
    auth: { admin: { deleteUser: vi.fn().mockRejectedValue(error) } },
  } as unknown as SupabaseClient;
}

describe('SupabaseAccountAdmin', () => {
  it('exclui a identidade sem soft delete', async () => {
    const client = clientReturning({ error: null, user: { id: 'supabase_1' } });
    const admin = new SupabaseAccountAdmin({ client });

    await expect(admin.deleteUser('supabase_1')).resolves.toEqual({ alreadyMissing: false });
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith('supabase_1', false);
  });

  it('trata usuário já ausente como exclusão idempotente', async () => {
    const client = clientReturning({
      error: { status: 404, code: 'user_not_found', message: 'User not found' },
    });
    const admin = new SupabaseAccountAdmin({ client });

    await expect(admin.deleteUser('supabase_1')).resolves.toEqual({ alreadyMissing: true });
  });

  it('não interpreta todo HTTP 404 como usuário ausente', async () => {
    const admin = new SupabaseAccountAdmin({
      client: clientReturning({
        error: { status: 404, code: 'route_not_found', message: 'Admin endpoint not found' },
      }),
    });

    await expect(admin.deleteUser('supabase_1')).rejects.toMatchObject({
      message: 'SUPABASE_ACCOUNT_DELETE_FAILED',
      code: 'SUPABASE_ACCOUNT_DELETE_FAILED',
    });
  });

  it('não mascara indisponibilidade do Supabase', async () => {
    const client = clientReturning({
      error: { status: 503, code: 'service_unavailable', message: 'upstream unavailable' },
    });
    const admin = new SupabaseAccountAdmin({ client });

    await expect(admin.deleteUser('supabase_1')).rejects.toMatchObject({
      message: 'SUPABASE_ACCOUNT_DELETE_FAILED',
      code: 'SUPABASE_ACCOUNT_DELETE_FAILED',
    });
  });

  it('normaliza falha de transporte sem propagar detalhes do provedor', async () => {
    const admin = new SupabaseAccountAdmin({
      client: clientThrowing(new Error('fetch failed for secret upstream endpoint')),
    });

    await expect(admin.deleteUser('supabase_1')).rejects.toMatchObject({
      message: 'SUPABASE_ACCOUNT_DELETE_FAILED',
      code: 'SUPABASE_ACCOUNT_DELETE_FAILED',
    });
  });
});
