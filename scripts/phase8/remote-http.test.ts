import { describe, expect, it, vi } from 'vitest';
import { createRemoteHttpClient, validateRemoteEnvironment } from './remote-http.mjs';

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
});
