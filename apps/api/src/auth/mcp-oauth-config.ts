export interface McpOAuthConfiguration {
  resource: string;
  metadataUrl: string;
  authorizationServers: string[];
  enabled: boolean;
}

export function resolveMcpOAuthConfiguration(environment: Record<string, string | undefined>): McpOAuthConfiguration {
  const origin = (environment.FORGELEX_PUBLIC_URL ?? 'https://nexojuris.ia.br').trim().replace(/\/$/, '');
  const resource = (environment.FORGELEX_MCP_RESOURCE_URL ?? `${origin}/mcp`).trim().replace(/\/$/, '');
  const urls = [origin, resource];
  for (const value of urls) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && environment.NODE_ENV === 'production')) throw new Error('MCP_PUBLIC_URL_INVALID');
  }
  const enabled = environment.FORGELEX_MCP_OAUTH_ENABLED === 'true';
  const configured = environment.FORGELEX_OAUTH_AUTHORIZATION_SERVERS
    ?? origin;
  const authorizationServers = enabled ? configured.split(',').map((value) => value.trim().replace(/\/$/, '')).filter(Boolean) : [];
  if (enabled && authorizationServers.length === 0) throw new Error('MCP_AUTHORIZATION_SERVER_REQUIRED');
  for (const value of authorizationServers) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && environment.NODE_ENV === 'production')) throw new Error('MCP_AUTHORIZATION_SERVER_INVALID');
  }
  return { resource, metadataUrl: `${new URL(resource).origin}/.well-known/oauth-protected-resource/mcp`, authorizationServers, enabled };
}
