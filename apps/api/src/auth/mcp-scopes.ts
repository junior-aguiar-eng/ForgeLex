import type { AuthenticatedPrincipal } from '@forgelex/domain';

/**
 * The scopes an MCP call is authorized with. An OAuth-connected app also holds `matter:write` here, because the research
 * memo needs it; inside the MCP the user's exact per-matter share is what actually grants access, and it is re-checked on
 * every call. REST routes keep reading `principal.scopes`, which does not include it: giving the token the scope itself
 * would open every REST route that requires `matter:write` to any connected app, with no per-matter share at all.
 */
export function mcpScopes(principal: Pick<AuthenticatedPrincipal, 'authMethod' | 'scopes'>): string[] {
  const scopes = [...principal.scopes];
  if (principal.authMethod === 'oauth_access_token' && !scopes.includes('matter:write')) scopes.push('matter:write');
  return scopes;
}
