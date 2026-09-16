export type AuthMethod = 'session' | 'api_key' | 'oauth_access_token';

export interface AuthenticatedPrincipal {
  subjectId: string;
  tenantId: string;
  userId: string;
  roles: string[];
  scopes: string[];
  authMethod: AuthMethod;
}

export interface TokenVerifier {
  verify(token: string): Promise<AuthenticatedPrincipal | null>;
}
