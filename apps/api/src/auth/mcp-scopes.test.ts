import { describe, expect, it } from 'vitest';
import { mcpScopes } from './mcp-scopes.js';

describe('mcpScopes', () => {
  it('adds matter:write to an OAuth connection, which the research memo needs inside the MCP', () => {
    expect(mcpScopes({ authMethod: 'oauth_access_token', scopes: ['mcp', 'research:read'] })).toEqual([
      'mcp',
      'research:read',
      'matter:write',
    ]);
  });

  it.each(['session', 'api_key'] as const)('leaves %s scopes exactly as they are', (authMethod) => {
    expect(mcpScopes({ authMethod, scopes: ['mcp', 'research:read'] })).toEqual(['mcp', 'research:read']);
  });

  it('does not duplicate the scope and does not change the principal it was given', () => {
    const principal = { authMethod: 'oauth_access_token' as const, scopes: ['mcp', 'matter:write'] };

    expect(mcpScopes(principal)).toEqual(['mcp', 'matter:write']);
    const baseline = { authMethod: 'oauth_access_token' as const, scopes: ['mcp'] };
    mcpScopes(baseline);
    expect(baseline.scopes).toEqual(['mcp']);
  });
});
