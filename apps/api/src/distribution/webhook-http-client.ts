import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';

const forbidden = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  forbidden.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const)
  forbidden.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicWebhookAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !forbidden.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !forbidden.check(address, 'ipv6');
}
export class WebhookUrlBlocked extends Error {
  public constructor() {
    super('WEBHOOK_URL_BLOCKED');
  }
}
export function validateWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookUrlBlocked();
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !host ||
    (isIP(host) && !isPublicWebhookAddress(host))
  )
    throw new WebhookUrlBlocked();
  return url;
}
interface Target {
  url: URL;
  address: string;
  family: number;
}
type Transport = (
  target: Target,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
) => Promise<number>;

// https.request never follows redirects. The lookup closure is the only address source
// used by the socket; the original hostname remains in Host, SNI and certificate checks.
const pinnedTransport: Transport = (target, headers, body, signal) =>
  new Promise((resolve, reject) => {
    const req = request(
      target.url,
      {
        method: 'POST',
        headers,
        signal,
        agent: false,
        lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
        maxHeaderSize: 16_384,
        family: target.family,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        response.destroy(); // Never buffer, decode or persist the remote body.
        resolve(status);
      },
    );
    req.on('error', reject);
    req.end(body);
  });

export interface WebhookHttpClientOptions {
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  transport?: Transport;
}
export interface WebhookPoster {
  post(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<number>;
}
export class WebhookHttpClient implements WebhookPoster {
  public constructor(private readonly options: WebhookHttpClientOptions = {}) {}
  public async post(raw: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<number> {
    const url = validateWebhookUrl(raw);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    let onAbort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      signal.addEventListener('abort', onAbort, { once: true });
    });
    const resolving = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : (this.options.resolve ?? ((hostname) => lookup(hostname, { all: true })))(host);
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await Promise.race([resolving, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicWebhookAddress(address)))
      throw new WebhookUrlBlocked();
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return (this.options.transport ?? pinnedTransport)({ url, ...addresses[0]! }, headers, body, signal);
  }
}
