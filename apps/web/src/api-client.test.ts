import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiKey, getAccountClosurePolicy, getAccountClosureStatus, listApiKeys, requestAccountClosure, requestApi, requestApiWithToken, resolveApiOrigin, revokeApiKey } from './api-client';

describe('api-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('prioriza origem configurada e usa a origem HTTPS do navegador na homologação', () => {
    expect(resolveApiOrigin({
      configured: 'https://api.example/',
      browserOrigin: 'https://hml.example',
    })).toBe('https://api.example');
    expect(resolveApiOrigin({
      configured: '',
      browserOrigin: 'https://hml.nexojuris.ia.br',
    })).toBe('https://hml.nexojuris.ia.br');
  });

  it('mantém a API local separada durante o desenvolvimento HTTP', () => {
    expect(resolveApiOrigin({ configured: undefined, browserOrigin: 'http://localhost:3000' }))
      .toBe('http://localhost:3001');
  });

  it('converte falha de conexão com a API em erro operacional identificável', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => 'legacy-token' } });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const result = requestApi('/health');

    await expect(result).rejects.toMatchObject({
      code: 'API_UNAVAILABLE',
      status: 503,
    });
  });

  it('permite que telas legadas usem uma credencial explícita', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(requestApiWithToken('/api/v2/matters', 'typed-token')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/matters'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer typed-token' }),
      }),
    );
  });

  it('lista, cria e revoga chaves pelos endpoints canônicos', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'key_1', name: 'MCP', keyPrefix: 'flx_live_123', scopes: ['mcp'], createdAt: '2026-09-22T00:00:00.000Z' }], total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: { id: 'key_2', name: 'Pesquisa', keyPrefix: 'flx_live_456', scopes: ['research:read'], token: 'flx_live_secret', createdAt: '2026-09-22T00:00:00.000Z' } }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ key: { id: 'key_2', name: 'Pesquisa', keyPrefix: 'flx_live_456', scopes: ['research:read'], createdAt: '2026-09-22T00:00:00.000Z', revokedAt: '2026-09-22T00:01:00.000Z' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listApiKeys('session-token')).resolves.toMatchObject({ total: 1 });
    await expect(createApiKey({ name: 'Pesquisa', scopes: ['research:read'] }, 'session-token')).resolves.toMatchObject({ key: { token: 'flx_live_secret' } });
    await expect(revokeApiKey('key_2', 'session-token')).resolves.toMatchObject({ key: { revokedAt: '2026-09-22T00:01:00.000Z' } });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('/api/v2/api-keys'),
      expect.stringContaining('/api/v2/api-keys'),
      expect.stringContaining('/api/v2/api-keys/key_2'),
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ name: 'Pesquisa', scopes: ['research:read'] }) });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'DELETE' });
    expect(fetchMock.mock.calls[2][1].headers).not.toHaveProperty('Content-Type');
  });

  it('usa o JWT explícito e a chave idempotente para encerrar a conta', async () => {
    const accepted = { closureId: 'closure-1', statusToken: 'flx_close_secret', status: 'ACCESS_BLOCKED', requestedAt: '2026-09-22T00:00:00Z', policyVersion: '2026-09-22.v1' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(accepted), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(requestAccountClosure({ confirmation: 'ENCERRAR MINHA CONTA' }, 'fresh-jwt', 'closure-key')).resolves.toEqual(accepted);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v2/account/closure'), expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-jwt', 'Idempotency-Key': 'closure-key' }),
      body: JSON.stringify({ confirmation: 'ENCERRAR MINHA CONTA', policyVersion: '2026-09-22.v1' }),
    }));
  });

  it('consulta a política com sessão explícita e o status só com token opaco', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ closureId: 'closure-1', status: 'ACCESS_BLOCKED', requestedAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await getAccountClosurePolicy('session-jwt');
    await getAccountClosureStatus('closure-1', 'flx_close_secret');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer session-jwt' });
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'X-Closure-Token': 'flx_close_secret' });
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v2/account/closure/closure-1');
    expect(fetchMock.mock.calls[1][0]).not.toContain('flx_close_secret');
  });
});
