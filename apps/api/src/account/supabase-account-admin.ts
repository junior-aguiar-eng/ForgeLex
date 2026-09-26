import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AccountIdentityAdmin {
  deleteUser(subjectId: string): Promise<{ alreadyMissing: boolean }>;
}

interface SupabaseAdminError {
  status?: number;
  code?: string;
}

function accountDeleteFailed(): Error & { code: string } {
  return Object.assign(new Error('SUPABASE_ACCOUNT_DELETE_FAILED'), {
    code: 'SUPABASE_ACCOUNT_DELETE_FAILED',
  });
}

export class SupabaseAccountAdmin implements AccountIdentityAdmin {
  private readonly client: SupabaseClient;

  public constructor(options: { baseUrl?: string; secretKey?: string; client?: SupabaseClient }) {
    if (options.client) {
      this.client = options.client;
      return;
    }
    if (!options.baseUrl?.trim() || !options.secretKey?.trim()) {
      throw new Error('SUPABASE_ACCOUNT_ADMIN_CONFIG_REQUIRED');
    }
    this.client = createClient(options.baseUrl, options.secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  public async deleteUser(subjectId: string): Promise<{ alreadyMissing: boolean }> {
    let error: unknown;
    try {
      ({ error } = await this.client.auth.admin.deleteUser(subjectId, false));
    } catch {
      throw accountDeleteFailed();
    }
    if (!error) return { alreadyMissing: false };

    const details = error as SupabaseAdminError;
    if (details.code === 'user_not_found') {
      return { alreadyMissing: true };
    }

    throw accountDeleteFailed();
  }
}
