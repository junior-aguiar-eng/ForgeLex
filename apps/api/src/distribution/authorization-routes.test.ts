import { describe, expect, it, vi } from 'vitest';
import { createDatabase, runPersistenceMigrations, WebhookRepository } from '@forgelex/persistence';
import { WebhookService } from './webhook-service.js';
import { LedgerService } from '@forgelex/billing-ledger';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import type { AuthenticatedPrincipal } from '@forgelex/domain';

const base: AuthenticatedPrincipal = {
  subjectId: 's',
  userId: 'u',
  tenantId: 't',
  roles: ['owner'],
  scopes: ['billing:read'],
  authMethod: 'api_key',
};
const routes = [
  ['POST', '/api/v2/api-keys', { name: 'forbidden', scopes: [] }],
  ['DELETE', '/api/v2/api-keys/other', undefined],
  ['POST', '/api/v2/webhooks/endpoints', { url: 'https://example.test', eventTypes: ['matter.created'] }],
  ['DELETE', '/api/v2/webhooks/endpoints/other', undefined],
  ['POST', '/api/v2/webhooks/endpoints/other/test', {}],
  ['POST', '/api/v2/webhooks/deliveries/other/retry', {}],
] as const;

describe('integration authorization', () => {
  it.each(routes)('billing:read cannot %s %s', async (method, url, payload) => {
    const connection = await createDatabase();
    await runPersistenceMigrations(connection.client);
    const app = await buildApp({
      database: connection.db,
      databaseClient: connection.client,
      ledgerService: new LedgerService(connection.db, connection.client),
      authAdapter: new AuthAdapter({ verify: async () => base }),
      environment: { NODE_ENV: 'test', FORGELEX_WEBHOOK_MASTER_KEY: 'synthetic-test-key' },
    });
    try {
      const response = await app.inject({ method, url, payload, headers: { authorization: 'Bearer test' } });
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
      connection.client.close();
    }
  });

  it('an API key cannot administer credentials even with write scope and owner role', async () => {
    const app = await buildApp({
      authAdapter: new AuthAdapter({
        verify: async () => ({ ...base, scopes: ['billing:read', 'credentials:write'] }),
      }),
      environment: { NODE_ENV: 'test' },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v2/api-keys',
        payload: { name: 'forbidden', scopes: [] },
        headers: { authorization: 'Bearer test' },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });

  it('webhook write scope alone cannot subscribe to legal events', async () => {
    const app = await buildApp({
      authAdapter: new AuthAdapter({ verify: async () => ({ ...base, scopes: ['billing:read', 'webhooks:write'] }) }),
      environment: { NODE_ENV: 'test' },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v2/webhooks/endpoints',
        payload: { url: 'https://example.test', eventTypes: ['matter.created'] },
        headers: { authorization: 'Bearer test' },
      });
      expect(response.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

import { canSubscribeWebhook } from './integration-authorization.js';
describe('webhook event families', () => {
  describe('webhook subscription input', () => {
    const subscribe = async (scopes: string[], payload: Record<string, unknown>) => {
      const app = await buildApp({
        authAdapter: new AuthAdapter({ verify: async () => ({ ...base, scopes }) }),
        environment: { NODE_ENV: 'test' },
      });
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v2/webhooks/endpoints',
          payload: { url: 'https://example.test', ...payload },
          headers: { authorization: 'Bearer test' },
        });
        return { status: response.statusCode, body: response.json() as Record<string, unknown> };
      } finally {
        await app.close();
      }
    };
    const everything = ['webhooks:write', 'matter:read', 'research:read', 'billing:read', 'draft:write'];

    it.each([
      ['a string instead of a list', 'billing.usage.recorded'],
      ['an empty list', []],
      ['an unknown event type', ['matter.created', 'matter.deleted']],
      ['a non-string entry', [42]],
    ])('answers 400 WEBHOOK_EVENT_TYPE_INVALID for %s, not a permission error', async (_name, eventTypes) => {
      const { status, body } = await subscribe(everything, { eventTypes });

      expect(status).toBe(400);
      expect(body.error).toBe('WEBHOOK_EVENT_TYPE_INVALID');
    });

    it('names the missing scopes when a valid subscription is not authorized', async () => {
      const { status, body } = await subscribe(['webhooks:write', 'billing:read'], {
        eventTypes: ['matter.created', 'research.authority.verified'],
      });

      expect(status).toBe(403);
      expect(body).toMatchObject({ error: 'INSUFFICIENT_EVENT_SCOPE' });
      expect([...(body.missingScopes as string[])].sort()).toEqual(['matter:read', 'research:read']);
    });

    it('explains which scopes an omitted event list would need', async () => {
      const { status, body } = await subscribe(['webhooks:write', 'research:read'], {});

      expect(status).toBe(403);
      expect([...(body.missingScopes as string[])].sort()).toEqual(['billing:read', 'draft:write', 'matter:read']);
    });

    it('lets a valid and authorized subscription through to the service', async () => {
      // This app has no webhook master key, so the service answering 503 for it proves validation and authorization passed.
      const { status, body } = await subscribe(everything, {
        eventTypes: ['matter.created', 'billing.usage.recorded'],
      });

      expect(status).toBe(503);
      expect(body.error).toBe('WEBHOOK_MASTER_KEY_NOT_CONFIGURED');
    });
  });

  describe('credential administration requires an owner session', () => {
    const principalFor = (overrides: Partial<AuthenticatedPrincipal>) => ({
      ...base,
      scopes: ['credentials:read', 'credentials:write'],
      authMethod: 'session' as const,
      ...overrides,
    });
    const request = async (
      principal: AuthenticatedPrincipal,
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
      payload?: Record<string, unknown>,
    ) => {
      const app = await buildApp({
        authAdapter: new AuthAdapter({ verify: async () => principal }),
        environment: { NODE_ENV: 'test' },
      });
      try {
        const response = await app.inject({ method, url, payload, headers: { authorization: 'Bearer test' } });
        return { status: response.statusCode, body: response.json() as Record<string, unknown> };
      } finally {
        await app.close();
      }
    };

    it.each([
      ['POST', '/api/v2/api-keys', { name: 'k', scopes: [] }],
      ['DELETE', '/api/v2/api-keys/some-key', undefined],
    ] as const)('refuses an API key with write scope on %s %s', async (method, url, payload) => {
      const { status, body } = await request(principalFor({ authMethod: 'api_key' }), method, url, payload);

      expect(status).toBe(403);
      expect(body.error).toBe('CREDENTIAL_ADMIN_SESSION_REQUIRED');
    });

    it.each([
      ['POST', '/api/v2/api-keys', { name: 'k', scopes: [] }],
      ['DELETE', '/api/v2/api-keys/some-key', undefined],
    ] as const)('refuses a non-owner session with write scope on %s %s', async (method, url, payload) => {
      const { status, body } = await request(principalFor({ roles: ['member'] }), method, url, payload);

      expect(status).toBe(403);
      expect(body.error).toBe('CREDENTIAL_ADMIN_SESSION_REQUIRED');
    });

    it.each([
      ['POST', '/api/v2/api-keys', { name: 'k', scopes: [] }, 201],
      ['DELETE', '/api/v2/api-keys/some-key', undefined, 404],
    ] as const)('lets an owner session reach the handler on %s %s', async (method, url, payload, expected) => {
      const { status } = await request(principalFor({}), method, url, payload);

      expect(status).toBe(expected);
    });

    it('does not apply the owner-session rule to listing, which only needs credentials:read', async () => {
      const { status } = await request(
        principalFor({ authMethod: 'api_key', roles: ['member'], scopes: ['credentials:read'] }),
        'GET',
        '/api/v2/api-keys',
      );

      expect(status).toBe(200);
    });
  });

  describe('webhook routes look rows up by id', () => {
    const all = ['webhooks:read', 'webhooks:write', 'matter:read', 'billing:read', 'research:read', 'draft:write'];
    const fixture = async (scopes: string[]) => {
      const tenantId = `t_${Math.random().toString(36).slice(2)}`;
      const connection = await createDatabase();
      await runPersistenceMigrations(connection.client);
      const app = await buildApp({
        database: connection.db,
        databaseClient: connection.client,
        ledgerService: new LedgerService(connection.db, connection.client),
        authAdapter: new AuthAdapter({ verify: async () => ({ ...base, tenantId, scopes }) }),
        environment: { NODE_ENV: 'test', FORGELEX_WEBHOOK_MASTER_KEY: 'synthetic-test-key' },
      });
      const repository = new WebhookRepository(connection.client);
      const id = (name: string) => `${tenantId}_${name}`;
      const endpoint = async (name: string, eventTypes: string[]) =>
        repository.createEndpoint({
          id: id(name),
          tenantId,
          url: 'https://example.test/hook',
          secretCiphertext: 'ciphertext',
          eventTypes,
        });
      const delivery = async (name: string, eventType: string) => {
        await repository.enqueueEvent({ tenantId, eventType, payloadJson: '{}', endpointIds: [id(name)] });
        return (await repository.listDeliveries(tenantId, id(name)))[0]!;
      };
      const call = (method: 'GET' | 'POST' | 'DELETE', url: string) =>
        app.inject({ method, url, headers: { authorization: 'Bearer test' } });
      return {
        app,
        connection,
        tenantId,
        id,
        endpoint,
        delivery,
        call,
        close: async () => {
          await app.close();
          connection.client.close();
        },
      };
    };

    it('sends the test event as webhook.test, never as a real event type of the endpoint', async () => {
      const f = await fixture(all);
      try {
        await f.endpoint('billing', ['billing.usage.recorded']);

        const response = await f.call('POST', `/api/v2/webhooks/endpoints/${f.id('billing')}/test`);

        expect(response.statusCode).toBe(202);
        const events = await f.connection.client.execute({
          sql: 'SELECT event_type FROM webhook_events WHERE tenant_id = ?',
          args: [f.tenantId],
        });
        expect(events.rows.map((row) => row.event_type)).toEqual(['webhook.test']);
      } finally {
        await f.close();
      }
    });

    it('answers 404 for a test on an unknown or revoked endpoint and 403 when its family is not authorized', async () => {
      const f = await fixture(['webhooks:write', 'matter:read']);
      try {
        await f.endpoint('billing', ['billing.usage.recorded']);
        await f.endpoint('matter', ['matter.created']);
        await f.call('DELETE', `/api/v2/webhooks/endpoints/${f.id('matter')}`);

        expect((await f.call('POST', `/api/v2/webhooks/endpoints/${f.id('missing')}/test`)).statusCode).toBe(404);
        expect((await f.call('POST', `/api/v2/webhooks/endpoints/${f.id('matter')}/test`)).statusCode).toBe(404);
        expect((await f.call('POST', `/api/v2/webhooks/endpoints/${f.id('billing')}/test`)).statusCode).toBe(403);
      } finally {
        await f.close();
      }
    });

    it('revokes only authorized endpoints and reports an unknown one as not revoked', async () => {
      const f = await fixture(['webhooks:write', 'matter:read']);
      try {
        await f.endpoint('billing', ['billing.usage.recorded']);
        await f.endpoint('matter', ['matter.created']);

        expect((await f.call('DELETE', `/api/v2/webhooks/endpoints/${f.id('billing')}`)).statusCode).toBe(403);
        expect((await f.call('DELETE', `/api/v2/webhooks/endpoints/${f.id('missing')}`)).json()).toEqual({
          revoked: false,
        });
        expect((await f.call('DELETE', `/api/v2/webhooks/endpoints/${f.id('matter')}`)).json()).toEqual({
          revoked: true,
        });
      } finally {
        await f.close();
      }
    });

    it('retries only deliveries whose endpoint family is authorized', async () => {
      const f = await fixture(['webhooks:write', 'matter:read']);
      try {
        await f.endpoint('billing', ['billing.usage.recorded']);
        await f.endpoint('matter', ['matter.created']);
        const billing = await f.delivery('billing', 'billing.usage.recorded');
        const matter = await f.delivery('matter', 'matter.created');

        expect((await f.call('POST', `/api/v2/webhooks/deliveries/${billing.id}/retry`)).statusCode).toBe(403);
        expect((await f.call('POST', `/api/v2/webhooks/deliveries/${matter.id}/retry`)).statusCode).toBe(200);
        expect((await f.call('POST', '/api/v2/webhooks/deliveries/missing/retry')).json()).toEqual({ requeued: false });
      } finally {
        await f.close();
      }
    });

    it('lists deliveries only for authorized endpoints and asks the store for just those', async () => {
      const f = await fixture(['webhooks:read', 'matter:read']);
      const spy = vi.spyOn(WebhookService.prototype, 'listDeliveries');
      try {
        await f.endpoint('billing', ['billing.usage.recorded']);
        await f.endpoint('matter', ['matter.created']);
        await f.delivery('billing', 'billing.usage.recorded');
        await f.delivery('matter', 'matter.created');

        const response = await f.call('GET', '/api/v2/webhooks/deliveries');

        expect((response.json() as Array<{ endpointId: string }>).map((item) => item.endpointId)).toEqual([
          f.id('matter'),
        ]);
        expect(spy).toHaveBeenCalledWith(f.tenantId, [f.id('matter')]);
      } finally {
        spy.mockRestore();
        await f.close();
      }
    });

    it('does not load every endpoint or delivery of the tenant to act on a single row', async () => {
      const f = await fixture(all);
      const endpoints = vi.spyOn(WebhookService.prototype, 'listEndpoints');
      const deliveries = vi.spyOn(WebhookService.prototype, 'listDeliveries');
      try {
        await f.endpoint('a', ['matter.created']);
        const target = await f.delivery('a', 'matter.created');

        await f.call('POST', `/api/v2/webhooks/deliveries/${target.id}/retry`);
        await f.call('POST', `/api/v2/webhooks/endpoints/${f.id('a')}/test`);
        await f.call('DELETE', `/api/v2/webhooks/endpoints/${f.id('a')}`);

        expect(deliveries).not.toHaveBeenCalled();
        expect(endpoints).not.toHaveBeenCalled();
      } finally {
        endpoints.mockRestore();
        deliveries.mockRestore();
        await f.close();
      }
    });
  });

  it('billing visibility does not authorize legal metadata', () => {
    expect(canSubscribeWebhook(['billing:read'], ['billing.debit.recorded'])).toBe(true);
    expect(canSubscribeWebhook(['billing:read'], ['billing.debit.recorded', 'matter.created'])).toBe(false);
    expect(canSubscribeWebhook(['matter:read'], ['matter.created', 'document.ingested'])).toBe(true);
    expect(canSubscribeWebhook(['matter:read'], ['draft.created'])).toBe(false);
    for (const invalid of [[], ['unknown'], 'billing.debit.recorded', [null]])
      expect(canSubscribeWebhook(['billing:read'], invalid)).toBe(false);
  });
});

describe('authorized integration operations', () => {
  it('a billing webhook cannot overwrite its authenticated tenant through JSON', async () => {
    const c = await createDatabase();
    await runPersistenceMigrations(c.client);
    const app = await buildApp({
      database: c.db,
      databaseClient: c.client,
      ledgerService: new LedgerService(c.db, c.client),
      authAdapter: new AuthAdapter({
        verify: async () => ({ ...base, scopes: ['webhooks:read', 'webhooks:write', 'billing:read'] }),
      }),
      environment: { NODE_ENV: 'test', FORGELEX_WEBHOOK_MASTER_KEY: 'synthetic-only-test-key' },
    });
    try {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v2/webhooks/endpoints',
        headers: { authorization: 'Bearer key' },
        payload: { tenantId: 'other-tenant', url: 'https://example.test', eventTypes: ['billing.debit.recorded'] },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().tenantId).toBe('t');
      const endpoints = await app.inject({
        method: 'GET',
        url: '/api/v2/webhooks/endpoints',
        headers: { authorization: 'Bearer key' },
      });
      expect(endpoints.json()).toHaveLength(1);
    } finally {
      await app.close();
      c.client.close();
    }
  });
});
