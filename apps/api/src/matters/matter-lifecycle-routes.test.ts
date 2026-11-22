import { it, expect } from 'vitest';
import { caseAccessFixture } from '../../../../packages/persistence/src/repositories/matter-lifecycle-fixture.js';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { LedgerService } from '@forgelex/billing-ledger';
import { journalFixture } from './matter-purge-journal.test.js';
import type { AuthenticatedPrincipal } from '@forgelex/domain';
import { DraftAiReceiptRepository, MatterLifecycleRepository } from '@forgelex/persistence';
import { AuditRecorder } from '@forgelex/audit';
it('never exposes an archived original through draft references to API or OAuth readers', async () => {
  const f = await fixture();
  try {
    await f.repo.replace(f.owner, f.matter.id, {
      ...f.input,
      receivePermission: { enabled: true, destination: { mode: 'NEW' } },
    });
    const saved = await new DraftAiReceiptRepository(f.db).receive(f.reader, {
      matterId: f.matter.id,
      expectedGrantRevision: 1,
      idempotencyKey: 'indirect-source-0001',
      title: 'Minuta sem texto original',
      sections: [{ ordinal: 0, title: 'Fatos', content: 'Texto autoral.' }],
      references: [
        {
          sectionOrdinal: 0,
          kind: 'DOCUMENT',
          itemId: f.doc.document.id,
          documentVersionId: f.doc.version.id,
          anchorId: f.doc.anchors[0].id,
        },
      ],
    });
    await new MatterLifecycleRepository(f.db).transition(
      { tenantId: f.owner.tenantId, matterId: f.matter.id, documentId: f.doc.document.id },
      { userId: f.owner.userId, role: 'member', authType: 'web_session', scopes: ['matter:write'] },
      'archive',
      { expectedLifecycleRevision: 0 },
    );
    const url = `/api/v2/matters/${f.matter.id}/drafts/${saved.draftId}`;
    for (const token of ['api', 'oauth']) {
      const response = await f.app.inject({ url, headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(200);
      expect(response.json().documentReferences[0]).toMatchObject({ available: false });
      expect(response.body).not.toContain(f.doc.anchors[0].text);
    }
    const web = await f.app.inject({ url, headers: { authorization: 'Bearer session' } });
    expect(web.json().documentReferences[0].anchor.text).toBe(f.doc.anchors[0].text);
    expect((await f.repo.catalog(f.owner, f.matter.id, 'DOCUMENT')).items).toEqual([]);
  } finally {
    await f.app.close();
    f.client.close();
  }
});

async function fixture(options: { audit?: boolean } = {}) {
  const f = await caseAccessFixture();
  const auditRecorder = options.audit ? new AuditRecorder(f.db) : undefined;
  const j = journalFixture();
  await j.journal.provisionAnchor();
  const principal: AuthenticatedPrincipal = {
    subjectId: 's',
    ...f.owner,
    roles: ['member'],
    scopes: ['matter:read', 'matter:write'],
    authMethod: 'session',
  };
  const ledger = new LedgerService(f.db, f.client);
  await ledger.runMigrations();
  const app = await buildApp({
    database: f.db,
    databaseClient: f.client,
    ledgerService: ledger,
    environment: { NODE_ENV: 'test', FORGELEX_MATTER_PURGE_KEY_SECRET: 's'.repeat(32) },
    matterPurgeJournal: j.journal,
    ...(auditRecorder ? { auditRecorder } : {}),
    authAdapter: new AuthAdapter({
      verify: async (token) =>
        token === 'session'
          ? principal
          : token === 'owner'
            ? { ...principal, userId: 'manager', roles: ['owner'] }
            : token === 'member'
              ? { ...principal, userId: 'member' }
              : token === 'foreign'
                ? { ...principal, tenantId: 'unrelated' }
                : token === 'api'
                  ? { ...principal, authMethod: 'api_key' }
                  : token === 'oauth'
                    ? {
                        ...principal,
                        authMethod: 'oauth_access_token',
                        oauthClientId: 'app',
                        oauthGrantedAt: '2026-10-06T12:00:00.000Z',
                      }
                    : null,
    }),
  });
  return { ...f, app, journal: j.journal, auditRecorder };
}
it('restricts management and inactive reads to the authorized web session', async () => {
  const f = await fixture();
  try {
    const url = `/api/v2/matters/${f.matter.id}/archive`;
    for (const [token, status] of [
      ['api', 403],
      ['oauth', 403],
      ['member', 403],
      ['foreign', 404],
    ] as const) {
      expect(
        (
          await f.app.inject({
            method: 'POST',
            url,
            headers: { authorization: `Bearer ${token}` },
            payload: { expectedLifecycleRevision: 0 },
          })
        ).statusCode,
      ).toBe(status);
    }
    const archived = await f.app.inject({
      method: 'POST',
      url,
      headers: { authorization: 'Bearer session' },
      payload: { expectedLifecycleRevision: 0 },
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({ lifecycleState: 'ARCHIVED', lifecycleRevision: 1 });
    expect(archived.headers['cache-control']).toBe('no-store');
    expect(archived.json().title).toBeUndefined();
    expect(
      (
        await f.app.inject({ url: '/api/v2/matters?view=archived', headers: { authorization: 'Bearer session' } })
      ).json().items,
    ).toHaveLength(1);
    expect(
      (await f.app.inject({ url: '/api/v2/matters?view=archived', headers: { authorization: 'Bearer api' } }))
        .statusCode,
    ).toBe(403);
    expect(
      (await f.app.inject({ url: `/api/v2/matters/${f.matter.id}`, headers: { authorization: 'Bearer api' } }))
        .statusCode,
    ).toBe(404);
    expect(
      (await f.app.inject({ url: `/api/v2/matters/${f.matter.id}`, headers: { authorization: 'Bearer session' } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `/api/v2/matters/${f.matter.id}/facts`,
          headers: { authorization: 'Bearer session' },
          payload: { statement: 'Must not persist' },
        })
      ).statusCode,
    ).toBe(409);
  } finally {
    await f.app.close();
    f.client.close();
  }
});
it('rejects malformed commands and confirms definitive purge only from trash', async () => {
  const f = await fixture();
  try {
    const url = `/api/v2/matters/${f.matter.id}`;
    const headers = { authorization: 'Bearer session' };
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `${url}/archive`,
          headers,
          payload: { expectedLifecycleRevision: 0, userId: 'other' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `${url}/purge`,
          headers,
          payload: { expectedLifecycleRevision: 0, confirmation: f.matter.title },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await f.app.inject({ method: 'POST', url: `${url}/trash`, headers, payload: { expectedLifecycleRevision: 0 } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `${url}/purge`,
          headers,
          payload: { expectedLifecycleRevision: 1, confirmation: 'wrong' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: `${url}/purge`,
          headers,
          payload: { expectedLifecycleRevision: 1, confirmation: f.matter.title },
        })
      ).statusCode,
    ).toBe(200);
    expect((await f.app.inject({ url, headers })).statusCode).toBe(404);
    expect((await f.app.inject({ url: '/api/v2/matters?view=trash', headers })).json().items).toEqual([]);
    const operations = await f.journal.list();
    const completed = operations.find((event) => event.kind === 'COMPLETED');
    expect(completed?.kind).toBe('COMPLETED');
    if (completed && completed.kind !== 'PREPARED') {
      const statusUrl = `/api/v2/matter-purge-operations/${completed.operationId}`;
      expect((await f.app.inject({ url: statusUrl, headers })).json()).toEqual({ status: 'completed' });
      expect((await f.app.inject({ url: statusUrl, headers: { authorization: 'Bearer foreign' } })).statusCode).toBe(
        404,
      );
      expect((await f.app.inject({ url: statusUrl, headers: { authorization: 'Bearer api' } })).statusCode).toBe(403);
    }
  } finally {
    await f.app.close();
    f.client.close();
  }
});

it('renames an active case only through the authorized web session and audits it', async () => {
  const f = await fixture({ audit: true });
  try {
    const url = `/api/v2/matters/${f.matter.id}`;
    const patch = (token: string, payload: unknown, target = url) =>
      f.app.inject({
        method: 'PATCH',
        url: target,
        headers: { authorization: `Bearer ${token}` },
        payload: payload as object,
      });
    // Chave de API, OAuth e quem não é o autor nem administrador não renomeiam; outro tenant nem enxerga o caso.
    for (const [token, status] of [
      ['api', 403],
      ['oauth', 403],
      ['member', 403],
      ['foreign', 404],
    ] as const)
      expect((await patch(token, { title: 'Nome recusado' })).statusCode, token).toBe(status);
    for (const bad of [
      {},
      { title: 7 },
      { title: 'Novo', extra: true },
      { title: '' },
      { title: 'ab' },
      { title: 'x'.repeat(201) },
    ])
      expect((await patch('session', bad)).statusCode, JSON.stringify(bad).slice(0, 30)).toBe(400);
    expect((await patch('session', { title: 'Nome válido' }, '/api/v2/matters/not-a-guid')).statusCode).toBe(404);

    const renamed = await patch('session', { title: '  Ação de cobrança indevida  ' });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.headers['cache-control']).toBe('no-store');
    expect(renamed.json()).toMatchObject({ id: f.matter.id, title: 'Ação de cobrança indevida', lifecycleRevision: 0 });
    const read = await f.app.inject({ url, headers: { authorization: 'Bearer session' } });
    expect(read.json().matter.title).toBe('Ação de cobrança indevida');
    // Um administrador também pode.
    expect((await patch('owner', { title: 'Nome do administrador' })).statusCode).toBe(200);
    // Cada renomeação aceita deixa um evento; as recusadas não deixam nenhum.
    const events = await f.auditRecorder!.getLogsForSession(`matter_${f.matter.id}`);
    expect(events.map((event) => event.toolName)).toEqual(['matter.renamed', 'matter.renamed']);
    expect(events).toEqual([
      expect.objectContaining({
        toolName: 'matter.renamed',
        tenantId: f.owner.tenantId,
        userId: f.owner.userId,
        status: 'SUCCESS',
      }),
      expect.objectContaining({
        toolName: 'matter.renamed',
        tenantId: f.owner.tenantId,
        userId: 'manager',
        status: 'SUCCESS',
      }),
    ]);

    // Em arquivo ou lixeira o caso só serve para consulta.
    await f.app.inject({
      method: 'POST',
      url: `${url}/archive`,
      headers: { authorization: 'Bearer session' },
      payload: { expectedLifecycleRevision: 0 },
    });
    expect((await patch('session', { title: 'Nome em arquivado' })).statusCode).toBe(409);
    const read2 = await f.app.inject({ url: `${url}?view=active`, headers: { authorization: 'Bearer session' } });
    expect(read2.json().matter.title).toBe('Nome do administrador');
  } finally {
    await f.app.close();
    f.client.close();
  }
});
