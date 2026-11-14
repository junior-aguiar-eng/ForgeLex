import { describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
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
