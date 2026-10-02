import { describe, expect, it } from 'vitest';
import { resolveMcpOAuthConfiguration } from './mcp-oauth-config.js';

describe('descoberta MCP no ambiente publicado', () => {
  it('usa domínio real e servidor Supabase, sem domínios fictícios', () => {
    expect(resolveMcpOAuthConfiguration({
      FORGELEX_PUBLIC_URL: 'https://nexojuris.ia.br/',
      FORGELEX_SUPABASE_URL: 'https://project.supabase.co/',
      FORGELEX_MCP_OAUTH_ENABLED: 'true',
    })).toEqual({ resource: 'https://nexojuris.ia.br/mcp', metadataUrl: 'https://nexojuris.ia.br/.well-known/oauth-protected-resource/mcp', authorizationServers: ['https://nexojuris.ia.br'], enabled: true });
  });
  it('não anuncia autorização inexistente quando OAuth está desativado', () => {
    expect(resolveMcpOAuthConfiguration({}).authorizationServers).toEqual([]);
    expect(resolveMcpOAuthConfiguration({}).enabled).toBe(false);
  });
  it('recusa configuração produtiva não HTTPS', () => {
    expect(() => resolveMcpOAuthConfiguration({ NODE_ENV: 'production', FORGELEX_PUBLIC_URL: 'http://example.com' })).toThrow();
  });
});
