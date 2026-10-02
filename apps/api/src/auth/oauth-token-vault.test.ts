import { describe, expect, it } from 'vitest';
import { OAuthTokenVault } from './oauth-token-vault.js';

describe('credenciais OAuth restritas ao recurso MCP', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const resource = 'https://nexojuris.ia.br/mcp';
  it('não entrega a credencial nativa e vincula tipo, audiência e validade', () => {
    const vault = new OAuthTokenVault(key, resource);
    const sealed = vault.seal('native-secret', 'access', Date.now() + 60000);
    expect(sealed).not.toContain('native-secret');
    expect(vault.open(sealed, 'access')).toBe('native-secret');
    expect(vault.open(sealed, 'refresh')).toBeNull();
    expect(new OAuthTokenVault(key, 'https://other.example/mcp').open(sealed, 'access')).toBeNull();
    expect(new OAuthTokenVault(Buffer.alloc(32, 8).toString('base64'), resource).open(sealed, 'access')).toBeNull();
    expect(vault.open(sealed.slice(0, -3) + 'aaa', 'access')).toBeNull();
    expect(vault.open(vault.seal('expired', 'access', Date.now() - 1000), 'access')).toBeNull();
  });
  it('não aceita credenciais nativas como tokens ForgeLex e exige chave de 256 bits', () => {
    expect(new OAuthTokenVault(key, resource).open('native-secret', 'access')).toBeNull();
    expect(() => new OAuthTokenVault('weak', resource)).toThrow();
  });
});
