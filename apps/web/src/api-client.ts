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
  try {
    return window.localStorage.getItem('forgelex_api_token') ?? '';
  } catch {
    return '';
  }
}

export interface ApiOriginInput {
  configured?: string;
  browserOrigin?: string;
}

export function resolveApiOrigin(input: ApiOriginInput = {}): string {
  const configured = input.configured ?? import.meta.env.VITE_FORGELEX_API_URL;
  if (configured?.trim()) return configured.trim().replace(/\/$/, '');

  const browserOrigin = input.browserOrigin
    ?? (typeof window !== 'undefined' ? window.location?.origin : undefined);
  if (browserOrigin) {
    try {
      const parsed = new URL(browserOrigin);
      if (parsed.protocol === 'https:') return parsed.origin;
    } catch {
      // Origem inválida cai no endpoint local seguro de desenvolvimento.
    }
  }
  return 'http://localhost:3001';
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

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export interface McpConnectionStatusResponse {
  serviceAvailable: boolean;
  mcpUrl: string;
  authenticatedCredential: boolean;
  scopes: string[];
  lastMcpUseAt: string | null;
  billableOperationExecuted: boolean;
}

export interface PublicApiKey {
  id: string;
  tenantId?: string;
  subjectId?: string;
  userId?: string;
  name: string;
  keyPrefix: string;
  roles?: string[];
  scopes: string[];
  createdAt: string;
  revokedAt?: string | null;
}

export interface CreatedApiKey extends PublicApiKey {
  token: string;
}

export interface ApiKeyListResponse {
  items: PublicApiKey[];
  total: number;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
}

export interface CreateApiKeyResponse {
  key: CreatedApiKey;
  warning?: string;
}

export async function requestApiResponse<T>(path: string, init: RequestInit = {}, options: RequestApiOptions = {}): Promise<ApiResponse<T>> {
  const token = await getAccessToken(options.sessionOnly ?? false, options.accessToken);
  if (!token) {
    throw new ApiRequestError('Entre na sua conta para continuar.', 'UNAUTHENTICATED', 401);
  }

  const apiUrl = resolveApiOrigin();
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
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
  return { data: body as T, status: response.status, headers: response.headers };
}

export async function requestApi<T>(path: string, init: RequestInit = {}, options: RequestApiOptions = {}): Promise<T> {
  return (await requestApiResponse<T>(path, init, options)).data;
}

export function requestApiWithToken<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  return requestApi<T>(path, init, { accessToken });
}

export function getMcpConnectionStatus(): Promise<McpConnectionStatusResponse> {
  return requestApi<McpConnectionStatusResponse>('/api/v2/mcp/connection-status', {}, { sessionOnly: true });
}

export function listApiKeys(accessToken?: string): Promise<ApiKeyListResponse> {
  return requestApi<ApiKeyListResponse>('/api/v2/api-keys', {}, { sessionOnly: !accessToken, accessToken });
}

export function createApiKey(input: CreateApiKeyInput, accessToken?: string): Promise<CreateApiKeyResponse> {
  return requestApi<CreateApiKeyResponse>('/api/v2/api-keys', {
    method: 'POST',
    body: JSON.stringify(input),
  }, { sessionOnly: !accessToken, accessToken });
}

export function revokeApiKey(keyId: string, accessToken?: string): Promise<{ key: PublicApiKey }> {
  return requestApi<{ key: PublicApiKey }>(`/api/v2/api-keys/${encodeURIComponent(keyId)}`, {
    method: 'DELETE',
  }, { sessionOnly: !accessToken, accessToken });
}
