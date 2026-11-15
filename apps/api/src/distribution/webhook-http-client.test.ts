import { describe, expect, it } from 'vitest';
import {
  isPublicWebhookAddress,
  pinnedLookup,
  resolveHostAddresses,
  WebhookHttpClient,
} from './webhook-http-client.js';

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

describe('address fallback', () => {
  const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
  const dualStack = async () => [
    { address: '2606:4700:4700::1111', family: 6 },
    { address: '8.8.8.8', family: 4 },
  ];

  it('tries the next validated address when the first one cannot be reached', async () => {
    const tried: string[] = [];
    const client = new WebhookHttpClient({
      resolve: dualStack,
      transport: async (target) => {
        tried.push(target.address);
        if (target.family === 6) throw refused();
        return 204;
      },
    });

    expect(await client.post('https://example.test', {}, '{}', new AbortController().signal)).toBe(204);
    expect(tried).toEqual(['2606:4700:4700::1111', '8.8.8.8']);
  });

  it('reports the last connection error when no address can be reached', async () => {
    const tried: string[] = [];
    const client = new WebhookHttpClient({
      resolve: dualStack,
      transport: async (target) => {
        tried.push(target.address);
        throw Object.assign(refused(), { address: target.address });
      },
    });

    await expect(client.post('https://example.test', {}, '{}', new AbortController().signal)).rejects.toMatchObject({
      code: 'ECONNREFUSED',
      address: '8.8.8.8',
    });
    expect(tried).toHaveLength(2);
  });

  it('does not resend after the request may already have reached the server', async () => {
    const tried: string[] = [];
    const client = new WebhookHttpClient({
      resolve: dualStack,
      transport: async (target) => {
        tried.push(target.address);
        throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
      },
    });

    await expect(client.post('https://example.test', {}, '{}', new AbortController().signal)).rejects.toMatchObject({
      code: 'ECONNRESET',
    });
    expect(tried).toHaveLength(1);
  });

  it('treats any HTTP answer as final and does not retry it on another address', async () => {
    const tried: string[] = [];
    const client = new WebhookHttpClient({
      resolve: dualStack,
      transport: async (target) => {
        tried.push(target.address);
        return 503;
      },
    });

    expect(await client.post('https://example.test', {}, '{}', new AbortController().signal)).toBe(503);
    expect(tried).toEqual(['2606:4700:4700::1111']);
  });

  it('does not move on to another address after the delivery was aborted', async () => {
    const tried: string[] = [];
    const client = new WebhookHttpClient({
      resolve: dualStack,
      transport: async (target) => {
        tried.push(target.address);
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      },
    });

    await expect(client.post('https://example.test', {}, '{}', new AbortController().signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(tried).toHaveLength(1);
  });

  it('still refuses the whole host when any resolved address is private, before connecting to any', async () => {
    let calls = 0;
    const client = new WebhookHttpClient({
      resolve: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.5', family: 4 },
      ],
      transport: async () => {
        calls++;
        return 200;
      },
    });

    await expect(client.post('https://example.test', {}, '{}', new AbortController().signal)).rejects.toThrow(
      'WEBHOOK_URL_BLOCKED',
    );
    expect(calls).toBe(0);
  });
});

describe('pinned lookup contract', () => {
  it('answers the single-address form by default', () => {
    const answers: unknown[][] = [];
    pinnedLookup('8.8.8.8', 4)('example.test', {}, (...args: unknown[]) => answers.push(args));
    expect(answers).toEqual([[null, '8.8.8.8', 4]]);
  });

  it('answers the list form when the caller asks for all addresses, as autoSelectFamily does', () => {
    const answers: unknown[][] = [];
    pinnedLookup('8.8.8.8', 4)('example.test', { all: true }, (...args: unknown[]) => answers.push(args));
    expect(answers).toEqual([[null, [{ address: '8.8.8.8', family: 4 }]]]);
  });
});

describe('DNS resolution without the shared thread pool', () => {
  const dnsError = (code: string) => Object.assign(new Error(`query ${code}`), { code });

  it('merges IPv6 and IPv4 answers, IPv6 first, asking both families at the same time', async () => {
    const order: string[] = [];
    const resolver = {
      resolve4: async () => {
        order.push('4');
        return ['8.8.8.8'];
      },
      resolve6: async () => {
        order.push('6');
        return ['2606:4700:4700::1111'];
      },
    };

    expect(await resolveHostAddresses(resolver, 'example.test')).toEqual([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ]);
    expect(order.sort()).toEqual(['4', '6']);
  });

  it.each(['ENODATA', 'ENOTFOUND'])('uses the other family when one answers %s', async (code) => {
    const resolver = {
      resolve4: async () => ['8.8.8.8'],
      resolve6: async () => {
        throw dnsError(code);
      },
    };

    expect(await resolveHostAddresses(resolver, 'example.test')).toEqual([{ address: '8.8.8.8', family: 4 }]);
  });

  it('fails with the resolver error when neither family has an answer', async () => {
    const resolver = {
      resolve4: async () => {
        throw dnsError('ENOTFOUND');
      },
      resolve6: async () => {
        throw dnsError('ENODATA');
      },
    };

    await expect(resolveHostAddresses(resolver, 'example.test')).rejects.toMatchObject({
      code: expect.stringMatching(/ENOTFOUND|ENODATA/),
    });
  });

  it("does not hide a real failure of one family behind the other family's answer", async () => {
    const resolver = {
      resolve4: async () => ['8.8.8.8'],
      resolve6: async () => {
        throw dnsError('ETIMEOUT');
      },
    };

    await expect(resolveHostAddresses(resolver, 'example.test')).rejects.toMatchObject({ code: 'ETIMEOUT' });
  });
});
