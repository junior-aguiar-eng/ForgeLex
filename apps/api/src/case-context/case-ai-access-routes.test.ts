import { describe, it, expect } from 'vitest';
import { createDatabase, runPersistenceMigrations, MatterRepository } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { buildApp } from '../app.js';
describe('Permissões da IA REST', () => {
  it('exige sessão, valida concessão ativa e preserva revisão após conflito', async () => {
    const c = await createDatabase();
    await runPersistenceMigrations(c.client);
    const owner = { tenantId: 't', userId: 'u' };
    const principal = {
      ...owner,
      subjectId: 's',
      roles: ['owner'],
      scopes: ['matter:read', 'matter:write', 'mcp'],
      authMethod: 'session' as const,
    };
    let fail = false;
    const app = await buildApp({
      database: c.db,
      databaseClient: c.client,
      ledgerService: new LedgerService(c.db, c.client),
      environment: { NODE_ENV: 'test' },
      oauthClientDirectory: {
        list: async () => {
          if (fail) throw new Error('OAUTH_DIRECTORY_UNAVAILABLE');
          return [{ clientId: 'app', displayName: 'Aplicativo de teste', grantedAt: '2026-10-05T10:00:00.000Z' }];
        },
      },
      authAdapter: new AuthAdapter({
        verify: async (token) =>
          token === 'session' ? principal : token === 'api' ? { ...principal, authMethod: 'api_key' } : null,
      }),
    });
    try {
      const spec=(await app.inject({method:'GET',url:'/openapi.json'})).json();
      const operation=spec.paths['/api/v2/matters/{matterId}/ai-access'].put;
      expect(operation['x-forgelex-session-only']).toBe(true);expect(operation.responses).not.toHaveProperty('402');
      expect(spec.components.schemas.CaseAiMaterial.properties.versionNumber).toMatchObject({type:'integer',minimum:1});
      const m = await new MatterRepository(c.db).createMatter({ ...owner, createdBy: 'u', title: 'Caso de teste' });
      const d = await new MatterRepository(c.db).ingestTextDocument({
        ...owner,
        createdBy: 'u',
        matterId: m.id,
        title: 'Contrato',
        originalFilename: 'c.txt',
        mimeType: 'text/plain',
        content: 'Texto autorizado',
      });
      const url = '/api/v2/matters/' + m.id + '/ai-access';
      const headers = { authorization: 'Bearer session' };
      const materials = await app.inject({ method: 'GET', url: url + '/materials?kind=DOCUMENT&limit=1', headers });
      expect(materials.statusCode).toBe(200);
      expect(materials.json().items[0]).toMatchObject({ kind: 'DOCUMENT', id: d.document.id, versionId: d.version.id });
      expect(JSON.stringify(materials.json())).not.toContain('Texto autorizado');
      const body = {
        oauthClientId: 'app',
        expectedRevision: 0,
        selection: {
          documents: [{ documentId: d.document.id, versionId: d.version.id }],
          factIds: [],
          evidenceIds: [],
          thesisIds: [],
          authorityIds: [],
        },
      };
      expect(
        (await app.inject({ method: 'PUT', url, headers: { authorization: 'Bearer api' }, payload: body })).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({ method: 'POST', url: url + '/preview', headers, payload: { selection: body.selection } })
        ).json().items,
      ).toHaveLength(1);
      expect(
        (await app.inject({ method: 'PUT', url, headers, payload: { ...body, oauthClientId: 'forged' } })).statusCode,
      ).toBe(403);
      const created = await app.inject({ method: 'PUT', url, headers, payload: body });
      expect(created.statusCode, created.body).toBe(200);
      expect(created.json().revision).toBe(1);
      expect((await app.inject({ method: 'PUT', url, headers, payload: body })).statusCode).toBe(409);
      fail = true;
      expect(
        (await app.inject({ method: 'PUT', url, headers, payload: { ...body, expectedRevision: 1 } })).statusCode,
      ).toBe(503);
      const revoked = await app.inject({
        method: 'POST',
        url: url + '/' + created.json().id + '/revoke',
        headers,
        payload: { expectedRevision: 1 },
      });
      expect(revoked.json()).toMatchObject({ status: 'REVOKED', revision: 2 });
    } finally {
      await app.close();
      c.client.close();
    }
  });
});
