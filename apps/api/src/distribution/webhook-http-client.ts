import { Resolver } from 'node:dns/promises';
import { BlockList, isIP, type LookupFunction } from 'node:net';
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
export interface Target {
  url: URL;
  address: string;
  family: number;
}
export type Transport = (
  target: Target,
  headers: Record<string, string>,
  body: string,
  signal: AbortSignal,
) => Promise<number>;

/**
 * The only address source used by the socket. It answers both shapes Node may ask for: the single-address form, and the
 * list form used when `all` is set (autoSelectFamily). Relying on the `family` option alone to avoid the list form is
 * fragile: without it the single-address answer fails with ERR_INVALID_IP_ADDRESS.
 */
export function pinnedLookup(address: string, family: number): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

// https.request never follows redirects. The pinned lookup is the only address source used by the socket; the original
// hostname remains in Host, SNI and certificate checks. `tls.ca` exists so tests can trust a throwaway certificate.
export function createPinnedTransport(tls: { ca?: string | Buffer } = {}): Transport {
  return (target, headers, body, signal) =>
    new Promise((resolve, reject) => {
      const req = request(
        target.url,
        {
          method: 'POST',
          headers,
          signal,
          agent: false,
          lookup: pinnedLookup(target.address, target.family),
          maxHeaderSize: 16_384,
          family: target.family,
          ...(tls.ca ? { ca: tls.ca } : {}),
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
}
const pinnedTransport = createPinnedTransport();

// DNS goes through c-ares with explicit timeout and tries, not getaddrinfo: a getaddrinfo lookup cannot be cancelled and
// keeps one of libuv's four threads busy after our abort, which would starve fs and crypto in the same process.
export interface DnsResolver {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
}
const NO_RECORDS = new Set(['ENODATA', 'ENOTFOUND']);

export async function resolveHostAddresses(
  resolver: DnsResolver,
  hostname: string,
): Promise<Array<{ address: string; family: number }>> {
  const [v4, v6] = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
  const answers: Array<{ address: string; family: number }> = [];
  const failures: unknown[] = [];
  for (const [result, family] of [
    [v6, 6],
    [v4, 4],
  ] as const) {
    if (result.status === 'fulfilled') answers.push(...result.value.map((address) => ({ address, family })));
    else failures.push(result.reason);
  }
  // "No records" for one family is normal; any other failure must not be hidden behind the other family's answer.
  const real = failures.find((error) => !NO_RECORDS.has(String((error as { code?: string })?.code)));
  if (real) throw real;
  if (!answers.length) throw failures[0] ?? Object.assign(new Error('ENODATA'), { code: 'ENODATA' });
  return answers;
}
let sharedResolver: Resolver | undefined;
const defaultResolve = (hostname: string) =>
  resolveHostAddresses((sharedResolver ??= new Resolver({ timeout: 3_000, tries: 2 })), hostname);

// Only errors from establishing the connection may move on to the next address. Anything later (reset, TLS failure,
// abort) may happen after the request was sent, and resending it elsewhere would duplicate the delivery.
const CONNECT_ERRORS = new Set(['ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'EADDRNOTAVAIL', 'ETIMEDOUT']);

export interface WebhookHttpClientOptions {
  resolve?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  transport?: Transport;
}
export interface WebhookPoster {
  post(url: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<number>;
  /** Resolves the destination and verifies it is public, without sending anything. Throws WebhookUrlBlocked otherwise. */
  check?(url: string, signal: AbortSignal): Promise<void>;
}
export class WebhookHttpClient implements WebhookPoster {
  public constructor(private readonly options: WebhookHttpClientOptions = {}) {}
  public async check(raw: string, signal: AbortSignal): Promise<void> {
    await this.validatedTargets(raw, signal);
  }

  /** Validates the URL, resolves it with the abort signal bounding the wait, and refuses unless every address is public. */
  private async validatedTargets(
    raw: string,
    signal: AbortSignal,
  ): Promise<{ url: URL; addresses: Array<{ address: string; family: number }> }> {
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
      : (this.options.resolve ?? defaultResolve)(host);
    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await Promise.race([resolving, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    if (!addresses.length || addresses.some(({ address }) => !isPublicWebhookAddress(address)))
      throw new WebhookUrlBlocked();
    if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return { url, addresses };
  }

  public async post(raw: string, headers: Record<string, string>, body: string, signal: AbortSignal): Promise<number> {
    const { url, addresses } = await this.validatedTargets(raw, signal);
    const transport = this.options.transport ?? pinnedTransport;
    let lastError: unknown;
    for (const address of addresses) {
      try {
        return await transport({ url, ...address }, headers, body, signal);
      } catch (error) {
        if (!CONNECT_ERRORS.has(String((error as { code?: string })?.code)) || signal.aborted) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }
}
