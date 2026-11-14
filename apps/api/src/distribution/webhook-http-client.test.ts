import { describe, expect, it } from 'vitest';
import { isPublicWebhookAddress, WebhookHttpClient } from './webhook-http-client.js';

describe('webhook network boundary', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '192.0.2.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    '2002:7f00:1::',
  ])('blocks reserved address %s', (ip) => {
    expect(isPublicWebhookAddress(ip)).toBe(false);
  });
  it.each(['8.8.8.8', '2606:4700:4700::1111'])('permits public address %s', (ip) =>
    expect(isPublicWebhookAddress(ip)).toBe(true),
  );
  it('rejects private DNS and insecure schemes before transport', async () => {
    let calls = 0;
    const client = new WebhookHttpClient({
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      transport: async () => {
        calls++;
        return 200;
      },
    });
    for (const url of ['https://example.test', 'http://localhost', 'file:///tmp/a', 'https://[::ffff:127.0.0.1]']) {
      await expect(client.post(url, {}, '{}', new AbortController().signal)).rejects.toThrow('WEBHOOK_URL_BLOCKED');
    }
    expect(calls).toBe(0);
  });
  it('pins a validated address with hostname and never follows redirects', async () => {
    let resolutions = 0;
    const client = new WebhookHttpClient({
      resolve: async () => [{ address: ++resolutions === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }],
      transport: async (target) => {
        expect(target.url.hostname).toBe('example.test');
        expect(target.address).toBe('8.8.8.8');
        return 302;
      },
    });
    expect(await client.post('https://example.test', {}, '{}', new AbortController().signal)).toBe(302);
    expect(resolutions).toBe(1);
  });
});

it('bounds DNS waiting by the delivery abort signal', async () => {
  const controller = new AbortController();
  const client = new WebhookHttpClient({ resolve: async () => await new Promise(() => undefined) });
  const pending = client.post('https://example.test', {}, '{}', controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
}, 1000);
