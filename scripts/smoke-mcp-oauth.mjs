import { createRequire } from 'node:module';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { registerOAuthGateway } from '../apps/api/dist/auth/oauth-gateway.js';
import { OAuthTokenVault } from '../apps/api/dist/auth/oauth-token-vault.js';
import { SupabaseIdentityVerifier, SupabaseTokenVerifier } from '../apps/api/dist/auth/fastify-auth.js';
const require = createRequire(new URL('../apps/api/dist/app.js', import.meta.url));
const Fastify = require('fastify');
const base = process.env.FORGELEX_SMOKE_SUPABASE_URL;
if (!base || !/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(base)) throw new Error('invalid Supabase test URL');
const resource = 'https://nexojuris.ia.br/mcp';
const secret = process.env.FORGELEX_SMOKE_SUPABASE_SECRET;
const publicKey = process.env.FORGELEX_SMOKE_SUPABASE_PUBLIC;
if (!secret || !publicKey) throw new Error('missing test configuration');
const adminHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
const clientHeaders = { apikey: publicKey, 'Content-Type': 'application/json' };
const vault = new OAuthTokenVault(randomBytes(32).toString('base64'), resource);
const app = Fastify();
registerOAuthGateway(app, { origin: 'https://nexojuris.ia.br', resource, supabaseUrl: base, secretKey: secret, publishableKey: publicKey, vault });
let userId;
const clientIds = [];
const assertions = [];
function assert(condition, name) { if (!condition) throw new Error(name); assertions.push(name); }
async function native(path, init = {}) { return fetch(base + '/auth/v1' + path, init); }
try {
  const email = `mcp-smoke-${randomUUID()}@forgelex.test`;
  const password = randomBytes(24).toString('base64url') + '!aA9';
  const createdResponse = await native('/admin/users', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password, email_confirm: true }) });
  const user = await createdResponse.json();
  assert(createdResponse.ok && user.id, 'synthetic account created'); userId = user.id;
  const loginResponse = await native('/token?grant_type=password', { method: 'POST', headers: clientHeaders, body: JSON.stringify({ email, password }) });
  const login = await loginResponse.json(); assert(loginResponse.ok && login.access_token, 'password session established');
  const userHeaders = { ...clientHeaders, Authorization: `Bearer ${login.access_token}`, Origin: 'https://nexojuris.ia.br' };
  async function register(name) {
    const registered = await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: name, redirect_uris: ['https://example.test/mcp/callback', 'https://example.test/other/callback'], token_endpoint_auth_method: 'none' } });
    assert(registered.statusCode === 201, 'gateway registration ' + name + ' HTTP ' + registered.statusCode);
    const client = registered.json();
    const internal = JSON.parse(vault.open(client.client_id, 'client')); clientIds.push(internal.id);
    assert(!registered.body.includes(internal.secret) && client.token_endpoint_auth_method === 'none', 'native client secret retained');
    const stored = await (await native('/admin/oauth/clients/' + internal.id, { headers: adminHeaders })).json();
    assert(stored.client_type === 'confidential' && stored.token_endpoint_auth_method === 'client_secret_post', 'upstream client is confidential');
    return { client, internal };
  }
  const a = await register('ForgeLex synthetic A');
  const b = await register('ForgeLex synthetic B');
  const proof = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(proof).digest('base64url');
  const authorize = await app.inject({ url: '/oauth/authorize?' + new URLSearchParams({ client_id: a.client.client_id, redirect_uri: 'https://example.test/mcp/callback', resource, response_type: 'code', scope: 'email profile', code_challenge: challenge, code_challenge_method: 'S256', state: 'synthetic-state' }) });
  assert(authorize.statusCode === 302, 'gateway authorization redirect');
  const upstreamAuthorize = await fetch(authorize.headers.location, { redirect: 'manual' });
  assert(upstreamAuthorize.status === 302, 'native authorization redirect HTTP ' + upstreamAuthorize.status);
  const consentUrl = new URL(upstreamAuthorize.headers.get('location'));
  const authorizationId = consentUrl.searchParams.get('authorization_id');
  assert(authorizationId, 'consent authorization id');
  const detailResponse = await native('/oauth/authorizations/' + authorizationId, { headers: userHeaders });
  const details = await detailResponse.json();
  assert(detailResponse.ok && details.client.id === a.internal.id, 'native consent identifies app');
  const approvedResponse = await native('/oauth/authorizations/' + authorizationId + '/consent', { method: 'POST', headers: userHeaders, body: JSON.stringify({ action: 'approve' }) });
  const approved = await approvedResponse.json(); assert(approvedResponse.ok && approved.redirect_url, 'synthetic consent approved');
  const callback = new URL(approved.redirect_url);
  const nativeCode = callback.searchParams.get('code');
  const noSecretResponse = await native('/oauth/token', { method: 'POST', headers: { apikey: publicKey, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: a.internal.id, code: nativeCode, redirect_uri: 'https://nexojuris.ia.br/oauth/callback', code_verifier: proof, resource }) });
  assert(!noSecretResponse.ok, 'native exchange without confidential secret rejected');
  const returned = await app.inject({ url: callback.pathname + callback.search });
  assert(returned.statusCode === 302, 'gateway callback redirect');
  const host = new URL(returned.headers.location);
  const wrongReturn = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'authorization_code', client_id: a.client.client_id, code: host.searchParams.get('code'), redirect_uri: 'https://example.test/other/callback', code_verifier: proof, resource }).toString() });
  assert(wrongReturn.statusCode === 400, 'code cannot change registered external return');
  const exchange = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'authorization_code', client_id: a.client.client_id, code: host.searchParams.get('code'), redirect_uri: 'https://example.test/mcp/callback', code_verifier: proof, resource }).toString() });
  assert(exchange.statusCode === 200, 'gateway code exchange HTTP ' + exchange.statusCode);
  const tokens = exchange.json();
  const underlying = vault.open(tokens.access_token, 'access');
  assert(underlying && !exchange.body.includes(underlying), 'native access token never returned');
  const oauthIdentity = new SupabaseIdentityVerifier({ baseUrl: base, publishableKey: publicKey });
  const identity = await oauthIdentity.verify(underlying);
  assert(identity && await oauthIdentity.verifyOAuthGrant(underlying, identity) === a.internal.id, 'hosted OAuth user and active grant verified');
  for (const path of ['/user', '/user/oauth/grants']) {
    const rejected = await native(path, { headers: { ...clientHeaders, Authorization: `Bearer ${tokens.access_token}` } });
    assert(!rejected.ok, 'ForgeLex envelope rejected by native ' + path);
  }
  const account = { user: { id: 'synthetic', status: 'ACTIVE' }, tenant: { id: 'synthetic', status: 'ACTIVE' }, membership: { role: 'OWNER', status: 'ACTIVE' } };
  const verifier = new SupabaseTokenVerifier(oauthIdentity, { findBySupabaseUserId: async () => account }, vault);
  assert((await verifier.verify(tokens.access_token))?.authMethod === 'oauth_access_token', 'hosted token verifies as restricted principal');
  assert(await verifier.verify(underlying) === null, 'native OAuth token rejected by ForgeLex');
  const swapped = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'refresh_token', client_id: b.client.client_id, refresh_token: tokens.refresh_token }).toString() });
  assert(swapped.statusCode === 400, 'cross client refresh rejected');
  const refresh = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'refresh_token', client_id: a.client.client_id, refresh_token: tokens.refresh_token }).toString() });
  assert(refresh.statusCode === 200, 'hosted refresh succeeded');
  const refreshed = refresh.json();
  const alteredProof = randomBytes(32).toString('base64url');
  const alteredChallenge = createHash('sha256').update(alteredProof).digest('base64url');
  const intended = await app.inject({ url: '/oauth/authorize?' + new URLSearchParams({ client_id: b.client.client_id, redirect_uri: 'https://example.test/mcp/callback', resource, response_type: 'code', scope: 'email profile', code_challenge: alteredChallenge, code_challenge_method: 'S256', state: 'tamper-state' }) });
  const tampered = new URL(intended.headers.location);
  tampered.searchParams.set('code_challenge', alteredProof);
  tampered.searchParams.set('code_challenge_method', 'plain');
  const maliciousAuthorize = await fetch(tampered, { redirect: 'manual' });
  assert(maliciousAuthorize.status === 302, 'native plain request reaches consent for negative test');
  const maliciousId = new URL(maliciousAuthorize.headers.get('location')).searchParams.get('authorization_id');
  assert(maliciousId, 'negative flow contains authorization id');
  const negativeDetailsResponse = await native('/oauth/authorizations/' + maliciousId, { headers: userHeaders });
  assert(negativeDetailsResponse.ok, 'negative flow details loaded HTTP ' + negativeDetailsResponse.status);
  const maliciousConsent = await native('/oauth/authorizations/' + maliciousId + '/consent', { method: 'POST', headers: userHeaders, body: JSON.stringify({ action: 'approve' }) });
  const maliciousConsentData = await maliciousConsent.json();
  assert(maliciousConsent.ok && maliciousConsentData.redirect_url, 'negative test consent issued HTTP ' + maliciousConsent.status + ' ' + String(maliciousConsentData.error_code ?? maliciousConsentData.code ?? ''));
  const maliciousCallback = new URL(maliciousConsentData.redirect_url);
  const maliciousHostReturn = await app.inject({ url: maliciousCallback.pathname + maliciousCallback.search });
  const maliciousHostCode = new URL(maliciousHostReturn.headers.location).searchParams.get('code');
  const blockedPlain = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'authorization_code', client_id: b.client.client_id, code: maliciousHostCode, redirect_uri: 'https://example.test/mcp/callback', code_verifier: alteredProof, resource }).toString() });
  assert(blockedPlain.statusCode !== 200, 'tampered upstream plain flow cannot issue ForgeLex token');
  const directDcr = await native('/oauth/clients/register', { method: 'POST', headers: clientHeaders, body: JSON.stringify({ client_name: 'ForgeLex synthetic direct-disabled', redirect_uris: ['https://example.test/mcp/callback'], token_endpoint_auth_method: 'none' }) });
  if (directDcr.ok) { const accidental = await directDcr.json(); if (accidental.client_id) clientIds.push(accidental.client_id); }
  assert(!directDcr.ok, 'native dynamic registration remains disabled');
  const revoked = await native('/user/oauth/grants?client_id=' + a.internal.id, { method: 'DELETE', headers: userHeaders });
  assert(revoked.ok, 'hosted grant revoked');
  assert(await verifier.verify(refreshed.access_token) === null, 'issued access denied after revocation');
  const deniedRefresh = await app.inject({ method: 'POST', url: '/oauth/token', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams({ grant_type: 'refresh_token', client_id: a.client.client_id, refresh_token: refreshed.refresh_token }).toString() });
  assert(deniedRefresh.statusCode !== 200, 'refresh denied after revocation');
  console.log(JSON.stringify({ status: 'PASS', assertionCount: assertions.length, assertions, account: 'synthetic only', legalSearchExecuted: false }, null, 2));
} finally {
  for (const id of clientIds) { const removed = await native('/admin/oauth/clients/' + id, { method: 'DELETE', headers: adminHeaders }); if (!removed.ok) throw new Error('synthetic client cleanup failed'); }
  if (userId) { const removed = await native('/admin/users/' + userId, { method: 'DELETE', headers: adminHeaders }); if (!removed.ok) throw new Error('synthetic user cleanup failed'); }
  await app.close();
}
