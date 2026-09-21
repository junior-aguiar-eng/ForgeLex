import { describe, expect, it, vi } from 'vitest';
import { createRemoteHttpClient, runLimitedRemoteLoad, runRemoteSmoke, validateRemoteEnvironment } from './remote-http.mjs';

describe('remote HTTP', () => {
  it('exige HTTPS e chave', () => {
    expect(() => validateRemoteEnvironment({ baseUrl: 'http://example.test', apiKey: 'x' })).toThrow('HTTPS_REQUIRED');
    expect(() => validateRemoteEnvironment({ baseUrl: 'https://example.test', apiKey: '' })).toThrow('API_KEY_REQUIRED');
  });

  it('limita operações, aborta 5xx e classifica 401 e timeout', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 401 }));
    const client = createRemoteHttpClient({ baseUrl: 'https://example.test', apiKey: 'key', fetcher, maxOperations: 1, timeoutMs: 10 });
    await expect(client.request('/healthz')).rejects.toThrow('REMOTE_HTTP_401');
    await expect(client.request('/readyz')).rejects.toThrow('REMOTE_OPERATION_LIMIT');
    const serverError = createRemoteHttpClient({ baseUrl: 'https://example.test', apiKey: 'key', fetcher: async () => new Response('{}', { status: 503 }) });
    await expect(serverError.request('/healthz')).rejects.toThrow('REMOTE_HTTP_5XX');
  });

  it('cancela chamada excedida', async () => {
    const client = createRemoteHttpClient({ baseUrl: 'https://example.test', apiKey: 'key', timeoutMs: 5, fetcher: (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) });
    await expect(client.request('/healthz')).rejects.toThrow('REMOTE_HTTP_TIMEOUT');
  });

  it('usa a rota de saúde compatível com Cloud Run', async () => {
    const statuses = [200, 200, 200, 200, 200, 200, 422, 200];
    const request = vi.fn(async () => ({ status: statuses.shift(), headers: {}, body: {}, latencyMs: 1 }));
    const client = { request };
    await runRemoteSmoke(client, 'metrics-token', 'operation');
    expect(request.mock.calls[0]?.[0]).toBe('/health');
    expect(JSON.parse(String(request.mock.calls[4]?.[1]?.body))).toMatchObject({
      query: 'vazamento', court: 'STJ', limit: 1,
    });
  });

  it('executa carga limitada com concorrência fixa e cobra cada operação', async () => {
    let active = 0;
    let peak = 0;
    const client = {
      request: vi.fn(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return { status: 200, headers: { 'x-credits-charged': '0.2' }, body: {}, latencyMs: 10 };
      }),
    };
    const result = await runLimitedRemoteLoad(client, 'load', { requests: 5, concurrency: 2 });
    expect(client.request).toHaveBeenCalledTimes(5);
    expect(peak).toBe(2);
    expect(result).toMatchObject({ status: 'passed', requests: 5, concurrency: 2, chargedCents: 100 });
  });
});
