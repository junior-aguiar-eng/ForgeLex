import { describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations } from '@forgelex/persistence';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import { LedgerService } from '@forgelex/billing-ledger';

async function fixture() {
  const c = await createDatabase();
  await runPersistenceMigrations(c.client);
  const ledger = new LedgerService(c.db, c.client);
  await ledger.runMigrations();
  const principal: AuthenticatedPrincipal = {
    subjectId: 's',
    tenantId: 'review-route',
    userId: 'author',
    roles: ['lawyer'],
    scopes: ['matter:read', 'matter:write', 'draft:write'],
    authMethod: 'api_key',
  };
  const app = await buildApp({
    database: c.db,
    databaseClient: c.client,
    ledgerService: ledger,
    environment: { NODE_ENV: 'test' },
    authAdapter: new AuthAdapter({
      verify: async (token) =>
        token === 'full'
          ? principal
          : token === 'read'
            ? { ...principal, scopes: ['matter:read'] }
            : token === 'other'
              ? { ...principal, tenantId: 'other' }
              : null,
    }),
  });
  const headers = { authorization: 'Bearer full' };
  const matterResponse = await app.inject({
    method: 'POST',
    url: '/api/v2/matters',
    headers,
    payload: { title: 'Caso de conferência' },
  });
  expect(matterResponse.statusCode, matterResponse.body).toBe(200);
  const matter = matterResponse.json();
  const root = `/api/v2/matters/${matter.id}`;
  const draft = (
    await app.inject({
      method: 'POST',
      url: `${root}/drafts`,
      headers,
      payload: {
        title: 'Minuta de teste',
        sections: [
          { ordinal: 0, title: 'Fatos', content: 'Texto' },
          { ordinal: 1, title: 'Pedidos', content: 'Texto' },
        ],
      },
    })
  ).json();
  return { ...c, app, headers, root, draft, url: `${root}/drafts/${draft.draft.id}` };
}
describe('Revisão REST', () => {
  it('exige escrita e revisão completa para aprovar; histórico é isolado', async () => {
    const f = await fixture();
    try {
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: `${f.url}/review`,
            headers: { authorization: 'Bearer read' },
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await f.app.inject({ method: 'POST', url: `${f.url}/approval`, headers: f.headers, payload: {} })).statusCode,
      ).toBe(409);
      const result = (
        await f.app.inject({ method: 'POST', url: `${f.url}/review`, headers: f.headers, payload: { type: 'all' } })
      ).json();
      expect(result.run).toMatchObject({ state: 'COMPLETE', draftVersionId: f.draft.version.id });
      expect(
        (await f.app.inject({ method: 'GET', url: `${f.url}/review-runs`, headers: f.headers })).json().items,
      ).toHaveLength(1);
      expect(
        (await f.app.inject({ method: 'GET', url: `${f.url}/review-runs`, headers: { authorization: 'Bearer other' } }))
          .statusCode,
      ).toBe(404);
      expect(
        (await f.app.inject({ method: 'POST', url: `${f.url}/review`, headers: f.headers, payload: { type: 'bogus' } }))
          .statusCode,
      ).toBe(400);
      expect(
        (await f.app.inject({ method: 'POST', url: `${f.url}/approval`, headers: f.headers, payload: {} })).statusCode,
      ).toBe(200);
    } finally {
      await f.app.close();
      f.client.close();
    }
  });
  it('nova versão fica sem resultados antigos e exige sua própria conferência', async () => {
    const f = await fixture();
    try {
      await f.app.inject({ method: 'POST', url: `${f.url}/review`, headers: f.headers, payload: {} });
      const v2 = (
        await f.app.inject({
          method: 'POST',
          url: `${f.url}/versions`,
          headers: f.headers,
          payload: { title: 'Minuta de teste', sections: [{ ordinal: 0, title: 'Fatos', content: 'Nova versão' }] },
        })
      ).json();
      const details = (await f.app.inject({ method: 'GET', url: f.url, headers: f.headers })).json();
      expect(details.reviewFindings).toEqual([]);
      expect(details.currentReviewRun).toBeUndefined();
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url: `${f.url}/approval`,
            headers: f.headers,
            payload: { versionId: v2.version.id },
          })
        ).statusCode,
      ).toBe(409);
    } finally {
      await f.app.close();
      f.client.close();
    }
  });
});
