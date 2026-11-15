import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, WebhookRepository } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { WebhookService } from './webhook-service.js';

const principal = (scopes: string[]): AuthenticatedPrincipal => ({
  subjectId: 's',
  userId: 'u',
  tenantId: 'tenant',
  roles: ['owner'],
  scopes,
  authMethod: 'api_key',
});

afterEach(() => vi.restoreAllMocks());

const fixture = async (scopes = ['webhooks:read', 'webhooks:write', 'matter:read'], environment: Record<string, string> = {}) => {
  const connection = await createDatabase({ url: 'file::memory:' });
  await runPersistenceMigrations(connection.client);
  const app = await buildApp({
    database: connection.db,
    databaseClient: connection.client,
    ledgerService: new LedgerService(connection.db, connection.client),
    authAdapter: new AuthAdapter({ verify: async () => principal(scopes) }),
    environment: { NODE_ENV: 'test', FORGELEX_WEBHOOK_MASTER_KEY: 'synthetic-test-key', ...environment },
  });
  const repository = new WebhookRepository(connection.client);
  const endpoint = (id: string, url: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' = 'ACTIVE') =>
    repository
      .createEndpoint({ id, tenantId: 'tenant', url, secretCiphertext: 'ciphertext', eventTypes: ['matter.created'] })
      .then(() =>
        connection.client.execute({ sql: 'UPDATE webhook_endpoints SET status = ? WHERE id = ?', args: [status, id] }),
      );
  const call = (method: 'POST' | 'GET', url: string) =>
    app.inject({ method, url, headers: { authorization: 'Bearer test' } });
  return {
    app,
    connection,
    repository,
    endpoint,
    call,
    close: async () => {
      await app.close();
      connection.client.close();
    },
  };
};

describe('POST /api/v2/webhooks/endpoints/:id/reactivate', () => {
  it('reactivates a suspended endpoint whose address is public again', async () => {
    const f = await fixture();
    try {
      await f.endpoint('ep', 'https://8.8.8.8/hook', 'SUSPENDED');

      const response = await f.call('POST', '/api/v2/webhooks/endpoints/ep/reactivate');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ reactivated: true });
      expect((await f.repository.findEndpoint('tenant', 'ep'))?.status).toBe('ACTIVE');
    } finally {
      await f.close();
    }
  });

  it('refuses with 422 while the address is still blocked and leaves the endpoint suspended', async () => {
    const f = await fixture();
    try {
      await f.endpoint('ep', 'https://127.0.0.1/hook', 'SUSPENDED');

      const response = await f.call('POST', '/api/v2/webhooks/endpoints/ep/reactivate');

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: 'WEBHOOK_URL_BLOCKED' });
      expect((await f.repository.findEndpoint('tenant', 'ep'))?.status).toBe('SUSPENDED');
    } finally {
      await f.close();
    }
  });

  it.each([['ACTIVE'], ['REVOKED']] as const)('answers 409 for a %s endpoint', async (status) => {
    const f = await fixture();
    try {
      await f.endpoint('ep', 'https://8.8.8.8/hook', status);

      const response = await f.call('POST', '/api/v2/webhooks/endpoints/ep/reactivate');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: 'WEBHOOK_ENDPOINT_NOT_SUSPENDED' });
    } finally {
      await f.close();
    }
  });

  it('refuses with 403 when the caller may write webhooks but cannot subscribe to the endpoint\'s events', async () => {
    const f = await fixture(['webhooks:write']);
    try {
      await f.endpoint('ep', 'https://8.8.8.8/hook', 'SUSPENDED');

      const response = await f.call('POST', '/api/v2/webhooks/endpoints/ep/reactivate');

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: 'INSUFFICIENT_EVENT_SCOPE' });
      expect((await f.repository.findEndpoint('tenant', 'ep'))?.status).toBe('SUSPENDED');
    } finally {
      await f.close();
    }
  });

  it('answers 404 for an unknown endpoint and 403 without the webhook scope', async () => {
    const allowed = await fixture();
    const denied = await fixture(['research:read']);
    try {
      expect((await allowed.call('POST', '/api/v2/webhooks/endpoints/missing/reactivate')).statusCode).toBe(404);
      await denied.endpoint('ep', 'https://8.8.8.8/hook', 'SUSPENDED');
      expect((await denied.call('POST', '/api/v2/webhooks/endpoints/ep/reactivate')).statusCode).toBe(403);
    } finally {
      await allowed.close();
      await denied.close();
    }
  });
});

describe('POST /api/v2/webhooks/endpoints/:id/test', () => {
  it('answers 404 when the endpoint stopped being active before the event could be queued', async () => {
    const f = await fixture();
    try {
      await f.endpoint('ep', 'https://8.8.8.8/hook');
      vi.spyOn(WebhookService.prototype, 'enqueue').mockRejectedValue(new Error('WEBHOOK_ENDPOINT_NOT_ACTIVE'));

      const response = await f.call('POST', '/api/v2/webhooks/endpoints/ep/test');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: 'WEBHOOK_ENDPOINT_NOT_FOUND' });
    } finally {
      await f.close();
    }
  });
});

describe('webhook worker configuration', () => {
  it('warns when the configured timeout is above the cap that keeps a delivery inside its lease', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as never);
    const f = await fixture(['billing:read'], { FORGELEX_WEBHOOK_TIMEOUT_MS: '60000' });
    try {
      const warning = writes
        .map((line) => {
          try {
            return JSON.parse(line) as Record<string, unknown>;
          } catch {
            return undefined;
          }
        })
        .find((entry) => entry?.message === 'webhook.timeout.capped');
      expect(warning).toMatchObject({ level: 'warn', configuredMs: 60000, appliedMs: 10000 });
    } finally {
      await f.close();
    }
  });

  it('records every result of a worker tick in the metrics', async () => {
    vi.useFakeTimers();
    try {
      const results: string[] = [];
      vi.spyOn(WebhookService.prototype, 'tick').mockResolvedValue(['delivered', 'retrying', 'failed']);
      const f = await fixture(['billing:read'], { FORGELEX_WEBHOOK_WORKER_ENABLED: 'true' });
      const { RequestMetrics } = await import('../observability.js');
      vi.spyOn(RequestMetrics.prototype, 'observeWebhookDelivery').mockImplementation((status) => {
        results.push(status);
      });

      await vi.advanceTimersByTimeAsync(1_100);

      expect(results).toEqual(['delivered', 'retrying', 'failed']);
      await f.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
