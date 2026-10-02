import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { registerOAuthGateway } from './oauth-gateway.js';
import { OAuthTokenVault } from './oauth-token-vault.js';

describe('gateway OAuth MCP', () => {
  const resource = 'https://nexojuris.ia.br/mcp';
  const vault = new OAuthTokenVault(Buffer.alloc(32, 9).toString('base64'), resource);
  it('publica descoberta, exige recurso correto e nunca devolve tokens nativos', async () => {
    const app = Fastify();
    const client = vault.seal(JSON.stringify({ id: 'native-client', secret: 'native-client-secret', redirects: ['https://app.example/callback'] }), 'client', null);
    let calls = 0;
    registerOAuthGateway(app, { origin: 'https://nexojuris.ia.br', resource, supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', secretKey: 'secret-test', vault,
      fetchImpl: async () => { calls++; return new Response(JSON.stringify({ access_token: 'native-access', refresh_token: 'native-refresh', id_token: 'native-id', expires_in: 300, token_type: 'bearer', scope: 'email profile' })); } });
    const discovery = (await app.inject({ url: '/.well-known/oauth-authorization-server' })).json();
    expect(discovery.issuer).toBe('https://nexojuris.ia.br');
    expect(discovery.token_endpoint).toBe('https://nexojuris.ia.br/oauth/token');
    const invalid = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'grant_type=authorization_code&code=test&resource=https://other.example/mcp' });
    expect(invalid.statusCode).toBe(400); expect(calls).toBe(0);
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorization = await app.inject({ url: '/oauth/authorize?' + new URLSearchParams({ client_id: client, redirect_uri: 'https://app.example/callback', response_type: 'code', resource, code_challenge: challenge, code_challenge_method: 'S256', state: 'external-state' }).toString() });
    expect(authorization.statusCode).toBe(302);
    const nativeUrl = new URL(String(authorization.headers.location));
    expect(nativeUrl.searchParams.get('redirect_uri')).toBe('https://nexojuris.ia.br/oauth/callback');
    const callback = await app.inject({ url: '/oauth/callback?' + new URLSearchParams({ code: 'native-code', state: nativeUrl.searchParams.get('state')! }).toString() });
    const hostUrl = new URL(String(callback.headers.location));
    expect(hostUrl.searchParams.get('state')).toBe('external-state');
    expect(hostUrl.searchParams.get('code')).not.toBe('native-code');
    const wrappedCode = hostUrl.searchParams.get('code')!;
    const valid = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'authorization_code', code: wrappedCode, code_verifier: verifier, client_id: client, resource, redirect_uri: 'https://app.example/callback' }).toString() });
    expect(valid.statusCode).toBe(200);
    expect(valid.body).not.toContain('native-');
    expect(valid.json().id_token).toBeUndefined();
    expect(vault.open(valid.json().access_token, 'access')).toBe('native-access');
    expect(JSON.parse(vault.open(valid.json().refresh_token, 'refresh')!)).toEqual({ token: 'native-refresh', clientId: 'native-client' });
    const otherClient = vault.seal(JSON.stringify({ id: 'other-client', secret: 'other-secret', redirects: ['https://app.example/callback'] }), 'client', null);
    const swapped = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'refresh_token', client_id: otherClient, refresh_token: valid.json().refresh_token }).toString() });
    expect(swapped.statusCode).toBe(400);
    const rawCode = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'authorization_code', code: 'native-code', code_verifier: verifier, client_id: client, resource }).toString() });
    expect(rawCode.statusCode).toBe(400);
    const refresh = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'refresh_token', client_id: client, refresh_token: valid.json().refresh_token }).toString() });
    expect(refresh.statusCode).toBe(200);
    const rawRefresh = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'grant_type=refresh_token&refresh_token=native-refresh&client_id=' + encodeURIComponent(client) });
    expect(rawRefresh.statusCode).toBe(400);
    await app.close();
  });
  it('recusa autorização sem PKCE S256 e registro com retorno inseguro', async () => {
    const app = Fastify();
    registerOAuthGateway(app, { origin: 'https://nexojuris.ia.br', resource, supabaseUrl: 'https://project.supabase.co', publishableKey: 'public', secretKey: 'secret-test', vault, fetchImpl: async () => { throw new Error('must not call upstream'); } });
    expect((await app.inject({ url: '/oauth/authorize?response_type=code&resource=' + encodeURIComponent(resource) })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/oauth/register', payload: { redirect_uris: ['http://example.com/callback'] } })).statusCode).toBe(400);
    await app.close();
  });
});
