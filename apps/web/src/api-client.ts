import { supabase } from './auth/supabase-client';

export class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function getLegacyApiToken(): string {
  if (import.meta.env.VITE_FORGELEX_API_TOKEN) return import.meta.env.VITE_FORGELEX_API_TOKEN;
  try {
    return window.localStorage.getItem('forgelex_api_token') ?? '';
  } catch {
    return '';
  }
}

async function getAccessToken(sessionOnly: boolean, explicitToken?: string): Promise<string> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
  }
  if (sessionOnly) return '';
  if (explicitToken?.trim()) return explicitToken.trim();
  return getLegacyApiToken();
}

export interface RequestApiOptions {
  sessionOnly?: boolean;
  accessToken?: string;
}

export async function requestApi<T>(path: string, init: RequestInit = {}, options: RequestApiOptions = {}): Promise<T> {
  const token = await getAccessToken(options.sessionOnly ?? false, options.accessToken);
  if (!token) {
    throw new ApiRequestError('Entre na sua conta para continuar.', 'UNAUTHENTICATED', 401);
  }

  const apiUrl = import.meta.env.VITE_FORGELEX_API_URL ?? 'http://localhost:3001';
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiRequestError('Não foi possível conectar à API do ForgeLex.', 'API_UNAVAILABLE', 503);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiRequestError(
      typeof body.message === 'string' ? body.message : 'Não foi possível concluir a operação.',
      typeof body.error === 'string' ? body.error : 'API_ERROR',
      response.status,
    );
  }
  return body as T;
}

export function requestApiWithToken<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  return requestApi<T>(path, init, { accessToken });
}
