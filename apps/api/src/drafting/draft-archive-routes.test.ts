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
    tenantId: 'archive-route',
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
  const matter = (
    await app.inject({ method: 'POST', url: '/api/v2/matters', headers, payload: { title: 'Caso de arquivamento' } })
  ).json();
  const root = `/api/v2/matters/${matter.id}`;
  const draft = (
    await app.inject({
      method: 'POST',
      url: `${root}/drafts`,
      headers,
      payload: { title: 'Minuta', sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto' }] },
    })
  ).json();
  return { ...c, app, headers, root, draft, url: `${root}/drafts/${draft.draft.id}` };
}

describe('arquivar e restaurar rascunho por REST (U4)', () => {
  it('arquiva, lista a lixeira, bloqueia nova versão e restaura sem perder a versão salva', async () => {
    const f = await fixture();
    try {
      const archived = await f.app.inject({ method: 'POST', url: `${f.url}/archive`, headers: f.headers });
      expect(archived.statusCode, archived.body).toBe(200);
      expect(archived.json().draft.status).toBe('ARCHIVED');
      expect((await f.app.inject({ method: 'GET', url: `${f.root}/drafts`, headers: f.headers })).json().items).toEqual(
        [],
      );
      const trash = await f.app.inject({ method: 'GET', url: `${f.root}/drafts?archived=true`, headers: f.headers });
      expect(trash.json().items.map((item: { id: string }) => item.id)).toEqual([f.draft.draft.id]);

      const blocked = await f.app.inject({
        method: 'POST',
        url: `${f.url}/versions`,
        headers: f.headers,
        payload: { title: 'Outra', sections: [{ ordinal: 0, title: 'Fatos', content: 'Novo' }] },
      });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error).toBe('DRAFT_ARCHIVED');

      const restored = await f.app.inject({ method: 'POST', url: `${f.url}/restore`, headers: f.headers });
      expect(restored.statusCode, restored.body).toBe(200);
      expect(restored.json().draft.status).not.toBe('ARCHIVED');
      const detail = (await f.app.inject({ method: 'GET', url: f.url, headers: f.headers })).json();
      expect(detail.currentVersion.version.id).toBe(f.draft.version.id);
      expect((await f.app.inject({ method: 'GET', url: `${f.root}/drafts`, headers: f.headers })).json().total).toBe(1);
    } finally {
      await f.app.close();
      f.client.close();
    }
  });

  it('exige escrita, isola o tenant e valida o alvo', async () => {
    const f = await fixture();
    try {
      const send = (url: string, token: string) =>
        f.app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` } });
      expect((await send(`${f.url}/archive`, 'read')).statusCode).toBe(403);
      expect((await send(`${f.url}/archive`, 'other')).statusCode).toBe(404);
      expect((await send(`${f.root}/drafts/não-é-guid/archive`, 'full')).statusCode).toBe(400);
      expect((await send(`${f.root}/drafts/${crypto.randomUUID()}/archive`, 'full')).statusCode).toBe(404);
      expect((await send(`${f.url}/restore`, 'full')).statusCode).toBe(200); // não arquivado: nada a fazer
    } finally {
      await f.app.close();
      f.client.close();
    }
  });

  it('aprovação pendente impede arquivar', async () => {
    const f = await fixture();
    try {
      await f.app.inject({ method: 'POST', url: `${f.url}/review`, headers: f.headers, payload: {} });
      const approval = await f.app.inject({
        method: 'POST',
        url: `${f.url}/approval`,
        headers: f.headers,
        payload: {},
      });
      expect(approval.statusCode, approval.body).toBe(200);
      const refused = await f.app.inject({ method: 'POST', url: `${f.url}/archive`, headers: f.headers });
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error).toBe('DRAFT_APPROVAL_PENDING');
    } finally {
      await f.app.close();
      f.client.close();
    }
  });
});
