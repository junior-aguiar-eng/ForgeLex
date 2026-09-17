import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

function fetchWithSupabaseApiKey(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const apiKey = headers.get('apikey');
  const authorization = headers.get('Authorization');

  // New Supabase publishable keys are API keys, not JWTs. The Auth client
  // still supplies the legacy Bearer fallback, which the gateway rejects.
  // Keep the session Bearer token when one exists and remove only the
  // duplicated Bearer form of the public API key.
  if (apiKey?.startsWith('sb_publishable_') && authorization === `Bearer ${apiKey}`) {
    headers.delete('Authorization');
  }

  return globalThis.fetch(input, { ...init, headers });
}

export const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey, {
    global: { fetch: fetchWithSupabaseApiKey },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;
