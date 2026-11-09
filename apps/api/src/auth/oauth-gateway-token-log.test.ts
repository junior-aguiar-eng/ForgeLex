import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerOAuthGateway } from './oauth-gateway.js';
import { OAuthTokenVault } from './oauth-token-vault.js';

const resource = 'https://nexojuris.ia.br/mcp';
const vault = new OAuthTokenVault(Buffer.alloc(32, 9).toString('base64'), resource);
const clientOf = (id: string) =>
  vault.seal(
    JSON.stringify({ id, secret: `${id}-secret`, redirects: ['https://app.example/callback'] }),
    'client',
    null,
  );
const refreshOf = (clientId: string) =>
  vault.seal(JSON.stringify({ token: 'native-refresh-secret', clientId }), 'refresh', null);

type Line = Record<string, unknown>;
let lines: Line[] = [];
let raw = '';

beforeEach(() => {
  lines = [];
  raw = '';
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    const text = String(chunk);
    raw += text;
    for (const part of text.split('\n').filter(Boolean)) {
      try {
        lines.push(JSON.parse(part));
      } catch {
        /* saída que não é log estruturado */
      }
    }
    return true;
  }) as typeof process.stdout.write);
});
afterEach(() => vi.restoreAllMocks());

function build(fetchImpl: typeof fetch) {
  const app = Fastify();
  registerOAuthGateway(app, {
    origin: 'https://nexojuris.ia.br',
    resource,
    supabaseUrl: 'https://project.supabase.co',
    publishableKey: 'public',
    secretKey: 'secret-test',
    vault,
    fetchImpl,
  });
  return app;
}
const form = (fields: Record<string, string>) => ({
  method: 'POST' as const,
  url: '/oauth/token',
  headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Claude-User' },
  payload: new URLSearchParams(fields).toString(),
});
const rejected = () => lines.filter((line) => line.message === 'oauth.token_rejected');
const never = (async () => {
  throw new Error('não deveria chamar o Supabase');
}) as unknown as typeof fetch;

describe('motivo de cada recusa em /oauth/token', () => {
  it('distingue recurso divergente sem registrar o valor enviado', async () => {
    const app = build(never);
    const sent = 'https://evil.example/mcp?x=segredo';
    const res = await app.inject(
      form({ grant_type: 'refresh_token', client_id: clientOf('c1'), refresh_token: refreshOf('c1'), resource: sent }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_target' });
    expect(rejected()).toEqual([
      expect.objectContaining({
        level: 'warn',
        status: 400,
        error: 'invalid_target',
        reason: 'RESOURCE_MISMATCH',
        grant: 'refresh_token',
        resourceSent: true,
        agent: 'Claude-User',
      }),
    ]);
    expect(raw).not.toContain('evil.example');
    expect(raw).not.toContain('segredo');
    await app.close();
  });

  it('separa recurso ausente na troca de código, grant desconhecido e corpo vazio', async () => {
    const app = build(never);
    await app.inject(form({ grant_type: 'authorization_code', client_id: clientOf('c1'), code: 'x' }));
    await app.inject(form({ grant_type: 'password', client_id: clientOf('c1') }));
    await app.inject({ method: 'POST', url: '/oauth/token' });
    expect(rejected().map((line) => [line.reason, line.grant])).toEqual([
      ['RESOURCE_REQUIRED', 'authorization_code'],
      ['GRANT_TYPE_UNSUPPORTED', 'other'],
      ['BODY_MISSING', 'other'],
    ]);
    await app.close();
  });

  it('recusa cliente ilegível com 401 e sem identificar o cliente', async () => {
    const app = build(never);
    const res = await app.inject(form({ grant_type: 'refresh_token', client_id: 'flx_oauth_v1.lixo' }));
    expect(res.statusCode).toBe(401);
    expect(rejected()).toEqual([
      expect.objectContaining({ status: 401, error: 'invalid_client', reason: 'CLIENT_ENVELOPE_INVALID' }),
    ]);
    expect(rejected()[0]).not.toHaveProperty('clientId', expect.anything());
    await app.close();
  });

  it('separa refresh token ilegível de refresh token de outro cliente, e nunca o registra', async () => {
    const app = build(never);
    const garbage = await app.inject(
      form({ grant_type: 'refresh_token', client_id: clientOf('c1'), refresh_token: 'native-refresh-secret' }),
    );
    const swapped = await app.inject(
      form({ grant_type: 'refresh_token', client_id: clientOf('c2'), refresh_token: refreshOf('c1') }),
    );
    expect([garbage.statusCode, swapped.statusCode]).toEqual([400, 400]);
    expect(rejected().map((line) => [line.reason, line.clientId])).toEqual([
      ['REFRESH_ENVELOPE_INVALID', 'c1'],
      ['REFRESH_CLIENT_MISMATCH', 'c2'],
    ]);
    expect(raw).not.toContain('native-refresh-secret');
    expect(raw).not.toContain('flx_oauth_v1');
    await app.close();
  });

  it('registra a rejeição do Supabase com status e código, sem repassar texto livre', async () => {
    const app = build(
      (async () =>
        new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh Token Not Found' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        })) as unknown as typeof fetch,
    );
    const res = await app.inject(
      form({ grant_type: 'refresh_token', client_id: clientOf('c1'), refresh_token: refreshOf('c1') }),
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_grant' });
    expect(rejected()).toEqual([
      expect.objectContaining({
        status: 400,
        reason: 'UPSTREAM_REJECTED',
        upstreamStatus: 400,
        upstreamError: 'invalid_grant',
        clientId: 'c1',
      }),
    ]);
    expect(raw).not.toContain('Refresh Token Not Found');
    await app.close();
  });

  it('classifica Supabase fora do ar e resposta inválida como 503 com motivos diferentes', async () => {
    const down = build((async () => {
      throw new Error('ECONNRESET db.internal.example');
    }) as unknown as typeof fetch);
    const a = await down.inject(
      form({ grant_type: 'refresh_token', client_id: clientOf('c1'), refresh_token: refreshOf('c1') }),
    );
    const bad = build((async () => new Response('<html>502</html>', { status: 200 })) as unknown as typeof fetch);
    const b = await bad.inject(
      form({ grant_type: 'refresh_token', client_id: clientOf('c1'), refresh_token: refreshOf('c1') }),
    );
    expect([a.statusCode, b.statusCode]).toEqual([503, 503]);
    expect(rejected().map((line) => line.reason)).toEqual(['UPSTREAM_UNREACHABLE', 'UPSTREAM_RESPONSE_UNREADABLE']);
    expect(raw).not.toContain('db.internal.example');
    await down.close();
    await bad.close();
  });

  it('registra a emissão sem token algum e mantém a resposta de sucesso', async () => {
    const app = build(
      (async () =>
        new Response(
          JSON.stringify({ access_token: 'native-access-secret', refresh_token: 'native-next', expires_in: 3600 }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )) as unknown as typeof fetch,
    );
    const res = await app.inject(
      form({ grant_type: 'refresh_token', client_id: clientOf('c1'), refresh_token: refreshOf('c1') }),
    );
    expect(res.statusCode).toBe(200);
    expect(vault.open(res.json().access_token, 'access')).toBe('native-access-secret');
    expect(rejected()).toEqual([]);
    expect(lines.filter((line) => line.message === 'oauth.token_issued')).toEqual([
      expect.objectContaining({ level: 'info', status: 200, grant: 'refresh_token', clientId: 'c1', expiresIn: 3600 }),
    ]);
    expect(raw).not.toContain('native-access-secret');
    expect(raw).not.toContain('native-next');
    await app.close();
  });

  it('atende o alias /token na raiz com as mesmas regras e registra o caminho usado', async () => {
    const app = build(
      (async () =>
        new Response(
          JSON.stringify({ access_token: 'native-access-secret', refresh_token: 'next', expires_in: 3600 }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )) as unknown as typeof fetch,
    );
    const ok = await app.inject({
      ...form({ grant_type: 'refresh_token', client_id: clientOf('c1'), refresh_token: refreshOf('c1') }),
      url: '/token',
    });
    expect(ok.statusCode).toBe(200);
    expect(vault.open(ok.json().access_token, 'access')).toBe('native-access-secret');
    const refused = await app.inject({
      ...form({
        grant_type: 'refresh_token',
        client_id: clientOf('c1'),
        refresh_token: refreshOf('c1'),
        resource: 'https://evil.example/mcp',
      }),
      url: '/token?x=1',
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({ error: 'invalid_target' });
    expect(lines.filter((line) => line.message === 'oauth.token_issued')).toEqual([
      expect.objectContaining({ path: '/token', clientId: 'c1' }),
    ]);
    expect(rejected()).toEqual([expect.objectContaining({ path: '/token', reason: 'RESOURCE_MISMATCH' })]);
    await app.close();
  });
});
