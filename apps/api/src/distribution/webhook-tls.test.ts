import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPinnedTransport } from './webhook-http-client.js';

// A real loopback TLS server: the mocked-https test cannot prove SNI, certificate checking or the pinned lookup.
// The certificate is generated here instead of being committed, so no private key lives in the repository.
function opensslAvailable(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!opensslAvailable())('pinned transport against a real TLS server', () => {
  let directory: string;
  let server: Server;
  let port: number;
  let ca: string;
  const seen: Array<{ sni: string | undefined; body: string; header: string | undefined }> = [];

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'webhook-tls-'));
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        join(directory, 'key.pem'),
        '-out',
        join(directory, 'cert.pem'),
        '-days',
        '2',
        '-subj',
        '/CN=hooks.example.test',
        '-addext',
        'subjectAltName=DNS:hooks.example.test',
      ],
      { stdio: 'ignore' },
    );
    ca = readFileSync(join(directory, 'cert.pem'), 'utf8');
    server = createServer({ key: readFileSync(join(directory, 'key.pem')), cert: ca }, (request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        seen.push({
          sni: (request.socket as unknown as { servername?: string }).servername,
          body,
          header: request.headers['x-test'] as string | undefined,
        });
        response.statusCode = 204;
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  });

  it('connects to the pinned address, sends the hostname as SNI and delivers body and headers', async () => {
    const transport = createPinnedTransport({ ca });

    const status = await transport(
      { url: new URL(`https://hooks.example.test:${port}/hook`), address: '127.0.0.1', family: 4 },
      { 'x-test': 'yes', 'content-type': 'application/json' },
      '{"ok":true}',
      new AbortController().signal,
    );

    expect(status).toBe(204);
    expect(seen.at(-1)).toEqual({ sni: 'hooks.example.test', body: '{"ok":true}', header: 'yes' });
  });

  it('verifies the certificate against the hostname, not against the pinned IP', async () => {
    const transport = createPinnedTransport({ ca });

    await expect(
      transport(
        { url: new URL(`https://other.example.test:${port}/hook`), address: '127.0.0.1', family: 4 },
        {},
        '{}',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
  });
});
