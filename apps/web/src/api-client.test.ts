import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestApi, requestApiWithToken } from './api-client';

describe('api-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
});
