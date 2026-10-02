import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { OAuthTokenVault } from './oauth-token-vault.js';

interface Options {
  origin: string;
  resource: string;
  supabaseUrl: string;
  publishableKey: string;
  secretKey: string;
  vault: OAuthTokenVault;
  fetchImpl?: typeof fetch;
}
const allowedScopes = new Set(['email', 'profile', 'offline_access']);
function secureRedirect(value: unknown): boolean {
  try { const url = new URL(String(value)); return url.protocol === 'https:' && !url.username && !url.password && !url.hash; }
  catch { return false; }
}

/** Supabase mantém identidade, consentimento e PKCE. Os hosts recebem somente
 * envelopes ForgeLex: nenhuma credencial nativa pode ser usada no Auth remoto. */
export function registerOAuthGateway(app: FastifyInstance, options: Options): void {
  const upstream = `${options.supabaseUrl.replace(/\/$/, '')}/auth/v1/oauth`;
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { apikey: options.publishableKey };
  const registrations = new Map<string, { count: number; resetAt: number }>();
  function readClient(value: unknown): { id: string; secret: string; redirects: string[] } | null {
    if (typeof value !== 'string') return null;
    const raw = options.vault.open(value, 'client');
    if (!raw) return null;
    try { const data = JSON.parse(raw); return typeof data.id === 'string' && typeof data.secret === 'string' && Array.isArray(data.redirects) && data.redirects.every(secureRedirect) ? data : null; }
    catch { return null; }
  }
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });
  app.get('/.well-known/oauth-authorization-server', async (_, reply) => {
    reply.header('Cache-Control', 'no-store');
    return {
      issuer: options.origin,
      authorization_endpoint: `${options.origin}/oauth/authorize`,
      token_endpoint: `${options.origin}/oauth/token`,
      registration_endpoint: `${options.origin}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      scopes_supported: [...allowedScopes],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
    };
  });
  app.get('/oauth/authorize', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const client = readClient(query.client_id);
    if (query.resource !== options.resource || query.response_type !== 'code'
      || query.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(query.code_challenge ?? '')
      || !client || !client.redirects.includes(query.redirect_uri)
      || (query.scope ?? '').split(' ').filter(Boolean).some((scope) => !allowedScopes.has(scope))) {
      return reply.code(400).send({ error: 'invalid_request', error_description: 'Recurso, retorno ou PKCE inválidos.' });
    }
    const forwarded = new URLSearchParams();
    for (const field of ['client_id', 'redirect_uri', 'response_type', 'code_challenge', 'code_challenge_method', 'scope', 'state', 'resource']) {
      if (query[field]) forwarded.set(field, query[field]);
    }
    const nativeVerifier = randomBytes(32).toString('base64url');
    forwarded.set('code_challenge', createHash('sha256').update(nativeVerifier).digest('base64url'));
    forwarded.set('client_id', client!.id);
    forwarded.set('redirect_uri', `${options.origin}/oauth/callback`);
    forwarded.set('state', options.vault.seal(JSON.stringify({ clientId: client!.id, challenge: query.code_challenge, nativeVerifier, redirect: query.redirect_uri, state: query.state ?? '' }), 'authorization', Date.now() + 600000));
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(`${upstream}/authorize?${forwarded}`);
  });
  app.get('/oauth/callback', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const raw = typeof query.state === 'string' && options.vault.open(query.state, 'authorization');
    if (!raw) return reply.code(400).send({ error: 'invalid_request' });
    try {
      const receipt = JSON.parse(raw);
      if (!secureRedirect(receipt.redirect) || typeof receipt.clientId !== 'string' || typeof receipt.challenge !== 'string' || typeof receipt.nativeVerifier !== 'string' || typeof receipt.state !== 'string') throw new Error('invalid receipt');
      const destination = new URL(receipt.redirect);
      destination.searchParams.set('state', receipt.state);
      if (typeof query.code === 'string' && query.code) destination.searchParams.set('code', options.vault.seal(JSON.stringify({ code: query.code, clientId: receipt.clientId, challenge: receipt.challenge, nativeVerifier: receipt.nativeVerifier, redirect: receipt.redirect }), 'code', Date.now() + 300000));
      else destination.searchParams.set('error', query.error === 'access_denied' ? 'access_denied' : 'server_error');
      reply.header('Cache-Control', 'no-store');
      return reply.redirect(destination.href);
    } catch { return reply.code(400).send({ error: 'invalid_request' }); }
  });
  app.post('/oauth/register' , async (request, reply) => {
    const now = Date.now();
    const current = registrations.get(request.ip);
    if (current && current.resetAt > now && current.count >= 10) return reply.code(429).send({ error: 'rate_limit_exceeded' });
    if (registrations.size >= 10000) for (const [ip, entry] of registrations) if (entry.resetAt <= now) registrations.delete(ip);
    if (registrations.size >= 10000 && !current) return reply.code(503).send({ error: 'temporarily_unavailable' });
    registrations.set(request.ip, { count: current && current.resetAt > now ? current.count + 1 : 1, resetAt: current && current.resetAt > now ? current.resetAt : now + 3600000 });
    const body = request.body as Record<string, unknown> | null;
    if (!body || !Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 10
      || !body.redirect_uris.every(secureRedirect)) return reply.code(400).send({ error: 'invalid_client_metadata' });
    // Metadata estritamente OAuth; não encaminhar atributos administrativos.
    const forwarded = { ...Object.fromEntries(['client_name', 'redirect_uris', 'client_uri', 'logo_uri'].filter((key) => key in body).map((key) => [key, body[key]])), redirect_uris: [`${options.origin}/oauth/callback`], client_type: 'confidential', token_endpoint_auth_method: 'client_secret_post', grant_types: ['authorization_code', 'refresh_token'] };
    try {
      const response = await fetchImpl(`${options.supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/oauth/clients`, { method: 'POST', headers: { apikey: options.secretKey, Authorization: `Bearer ${options.secretKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(forwarded), signal: AbortSignal.timeout(10000) });
      const data = await response.json() as Record<string, unknown>;
      reply.header('Cache-Control', 'no-store');
      if (!response.ok || typeof data.client_id !== 'string' || typeof data.client_secret !== 'string') return reply.code(response.ok ? 503 : response.status).send({ error: 'invalid_client_metadata' });
      return reply.code(201).send({ client_id: options.vault.seal(JSON.stringify({ id: data.client_id, secret: data.client_secret, redirects: body.redirect_uris }), 'client', null), client_name: body.client_name, redirect_uris: body.redirect_uris, token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] });
    } catch { return reply.code(503).send({ error: 'temporarily_unavailable' }); }
  });
  app.post('/oauth/token', async (request, reply) => {
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
    const body = request.body as Record<string, string> | null;
    if (!body || !['authorization_code', 'refresh_token'].includes(body.grant_type)
      || (body.resource !== undefined && body.resource !== options.resource)
      || (body.grant_type === 'authorization_code' && body.resource !== options.resource)) return reply.code(400).send({ error: 'invalid_target' });
    const client = readClient(body.client_id);
    if (!client) return reply.code(401).send({ error: 'invalid_client' });
    const forwarded = new URLSearchParams();
    for (const field of ['grant_type', 'code', 'client_id', 'client_secret', 'redirect_uri', 'code_verifier', 'resource']) {
      if (typeof body[field] === 'string') forwarded.set(field, body[field]);
    }
    forwarded.set('client_id', client.id);
    forwarded.set('client_secret', client.secret);
    if (body.grant_type === 'authorization_code') {
      const raw = typeof body.code === 'string' && options.vault.open(body.code, 'code');
      if (!raw || !/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier ?? '')) return reply.code(400).send({ error: 'invalid_grant' });
      try {
        const receipt = JSON.parse(raw);
        const expected = Buffer.from(receipt.challenge ?? '');
        const actual = Buffer.from(createHash('sha256').update(body.code_verifier).digest('base64url'));
        if (receipt.clientId !== client.id || typeof receipt.code !== 'string' || expected.length !== actual.length || !timingSafeEqual(expected, actual) || body.redirect_uri !== receipt.redirect || typeof receipt.nativeVerifier !== 'string') throw new Error('invalid grant');
        forwarded.set('code', receipt.code);
        forwarded.set('code_verifier', receipt.nativeVerifier);
        forwarded.set('redirect_uri', `${options.origin}/oauth/callback`);
      } catch { return reply.code(400).send({ error: 'invalid_grant' }); }
    }
    if (body.grant_type === 'refresh_token') {
      const refresh = typeof body.refresh_token === 'string' && options.vault.open(body.refresh_token, 'refresh');
      if (!refresh) return reply.code(400).send({ error: 'invalid_grant' });
      try { const receipt = JSON.parse(refresh); if (receipt.clientId !== client.id || typeof receipt.token !== 'string') throw new Error('invalid refresh'); forwarded.set('refresh_token', receipt.token); } catch { return reply.code(400).send({ error: 'invalid_grant' }); }
    }
    try {
      const response = await fetchImpl(`${upstream}/token`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: forwarded.toString(), signal: AbortSignal.timeout(10000),
      });
      const data = await response.json() as Record<string, unknown>;
      if (!response.ok) return reply.code(response.status).send({ error: typeof data.error === 'string' ? data.error : 'invalid_grant' });
      if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number'
        || !Number.isFinite(data.expires_in) || data.expires_in <= 0) return reply.code(503).send({ error: 'temporarily_unavailable' });
      return {
        access_token: options.vault.seal(data.access_token, 'access', Date.now() + data.expires_in * 1000),
        token_type: 'Bearer', expires_in: data.expires_in,
        ...(typeof data.refresh_token === 'string' ? { refresh_token: options.vault.seal(JSON.stringify({ token: data.refresh_token, clientId: client.id }), 'refresh', null) } : {}),
        ...(typeof data.scope === 'string' ? { scope: data.scope } : {}),
      };
    } catch { return reply.code(503).send({ error: 'temporarily_unavailable' }); }
  });
}
