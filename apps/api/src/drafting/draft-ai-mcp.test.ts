import { it, expect, vi } from 'vitest';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  CaseAiAccessRepository,
  DraftRepository,
} from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { buildApp } from '../app.js';

it('recebe via OAuth sem carteira, repete recibo e exige sessão para adotar', async () => {
  const c = await createDatabase();
  await runPersistenceMigrations(c.client);
  const owner = { tenantId: 'draft-wire-' + Date.now(), userId: 'author' };
  const stamp = '2026-10-06T10:00:00.000Z';
  const principal = {
    ...owner,
    subjectId: 's',
    roles: ['owner'],
    scopes: ['mcp', 'matter:read', 'matter:write', 'draft:write'],
    authMethod: 'oauth_access_token' as const,
    oauthClientId: 'app',
    oauthGrantedAt: stamp,
  };
  const ledger = new LedgerService(c.db, c.client);
  const charge = vi.spyOn(ledger, 'executeOperation');
  const app = await buildApp({
    database: c.db,
    databaseClient: c.client,
    ledgerService: ledger,
    environment: { NODE_ENV: 'test' },
    authAdapter: new AuthAdapter({
      verify: async (token) =>
        token === 'session'
          ? { ...principal, authMethod: 'session' }
          : token === 'api'
            ? { ...principal, authMethod: 'api_key' }
            : principal,
    }),
  });
  try {
    const matters = new MatterRepository(c.db);
    const m = await matters.createMatter({ ...owner, createdBy: owner.userId, title: 'Caso sintético' });
    const doc = await matters.ingestTextDocument({
      ...owner,
      matterId: m.id,
      createdBy: owner.userId,
      title: 'Documento',
      originalFilename: 'd.txt',
      mimeType: 'text/plain',
      content: 'Fonte sintética',
    });
    await new CaseAiAccessRepository(c.db).replace(owner, m.id, {
      oauthClientId: 'app',
      oauthGrantedAt: stamp,
      expectedRevision: 0,
      selection: {
        documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
        factIds: [],
        evidenceIds: [],
        thesisIds: [],
        authorityIds: [],
      },
      receivePermission: { enabled: true, destination: { mode: 'NEW' } },
    });
    const headers = { authorization: 'Bearer oauth' };
    const listed = (
      await app.inject({
        method: 'POST',
        url: '/mcp',
        headers,
        payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      })
    ).json().result.tools;
    expect(listed.find((t: any) => t.name === 'draft.save_from_ai').annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    const input = {
      matterId: m.id,
      expectedGrantRevision: 1,
      idempotencyKey: 'envio-sintetico-001',
      title: 'Peça sintética',
      sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto enviado pela IA' }],
    };
    const call = (args = input, token = 'oauth') =>
      app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { authorization: 'Bearer ' + token },
        payload: {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name: 'draft.save_from_ai', arguments: args },
        },
      });
    const first = (await call()).json();
    expect(first.result.billing).toEqual({ mode: 'FREE', chargedCents: 0, isReplay: false });
    const saved = first.result.structuredContent;
    expect((await call()).json().result.structuredContent).toMatchObject({
      id: saved.id,
      versionId: saved.versionId,
      isReplay: true,
    });
    expect(charge).not.toHaveBeenCalled();
    expect((await call(input, 'session')).json().result.isError).toBe(true);
    expect((await call(input, 'api')).json().result.isError).toBe(true);
    const path = `/api/v2/matters/${m.id}/drafts/${saved.draftId}/ai-receipts`;
    expect((await app.inject({ method: 'GET', url: path, headers })).statusCode).toBe(403);
    const result = await app.inject({ method: 'GET', url: path, headers: { authorization: 'Bearer session' } });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.json()[0].id).toBe(saved.id);
    expect(
      (
        await app.inject({ method: 'GET', url: path + '/' + saved.id, headers: { authorization: 'Bearer session' } })
      ).json().version.version.id,
    ).toBe(saved.versionId);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path + '/' + saved.id + '/adopt',
          headers: { authorization: 'Bearer session' },
          payload: { expectedCurrentVersionId: saved.versionId },
        })
      ).statusCode,
    ).toBe(200);
    expect(await new DraftRepository(c.db).listVersions(owner.tenantId, m.id, saved.draftId)).toHaveLength(1);
  } finally {
    await app.close();
    c.client.close();
  }
}, 20000);
