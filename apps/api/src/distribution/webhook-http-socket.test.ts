import { EventEmitter } from 'node:events';
import { request } from 'node:https';
import { expect, it, vi } from 'vitest';
import { WebhookHttpClient } from './webhook-http-client.js';

vi.mock('node:https', () => ({ request: vi.fn() }));

it('connects only through the pinned lookup and destroys an unread redirect body', async () => {
  const destroy = vi.fn();
  vi.mocked(request).mockImplementation(((url: URL, options: any, callback: any) => {
    expect(url.hostname).toBe('hooks.example.test');
    expect(options.agent).toBe(false);
    expect(options.family).toBe(4);
    expect(options.maxHeaderSize).toBe(16384);
    const result = vi.fn();
    options.lookup('hooks.example.test', {}, result);
    expect(result).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    const req = new EventEmitter();
    Object.assign(req, {
      end: () => callback({ statusCode: 302, headers: { location: 'http://127.0.0.1' }, destroy }),
    });
    return req;
  }) as any);
  let resolutions = 0;
  const client = new WebhookHttpClient({
    resolve: async () => [{ address: ++resolutions === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }],
  });
  expect(await client.post('https://hooks.example.test/path', {}, '{}', new AbortController().signal)).toBe(302);
  expect(request).toHaveBeenCalledTimes(1);
  expect(resolutions).toBe(1);
  expect(destroy).toHaveBeenCalledTimes(1);
});
