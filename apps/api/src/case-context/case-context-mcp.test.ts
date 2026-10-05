import { describe, it, expect, vi } from 'vitest';
import { AuditRecorder } from '@forgelex/audit';
import {
  createDatabase,
  runPersistenceMigrations,
  MatterRepository,
  CaseAiAccessRepository,
} from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { buildApp } from '../app.js';
describe('Contexto MCP autenticado', () => {
  it('revogação na auditoria descarta o resultado; envelope completo fica abaixo de 24 KiB', async () => {
    const c = await createDatabase();
    await runPersistenceMigrations(c.client);
    const owner = { tenantId: 'wire-' + Date.now(), userId: 'author' };
    const stamp = '2026-10-05T10:00:00.000Z';
    const principal = {
      ...owner,
      subjectId: 's',
      roles: ['owner'],
      scopes: ['mcp', 'research:read'],
      authMethod: 'oauth_access_token' as const,
      oauthClientId: 'app',
      oauthGrantedAt: stamp,
    };
    const repo = new CaseAiAccessRepository(c.db);
    const audit = new AuditRecorder(c.db);
    let revokeDuringAudit = false;
    let grantId = '';
    const original = audit.recordEvent.bind(audit);
    vi.spyOn(audit, 'recordEvent').mockImplementation(async (event) => {
      if (revokeDuringAudit && event.toolName === 'case.read_item' && event.status === 'SUCCESS') {
        revokeDuringAudit = false;
        await repo.revoke(owner, (event.payload as { matterId: string }).matterId, grantId, 1);
      }
      return original(event);
    });
    const app = await buildApp({
      database: c.db,
      databaseClient: c.client,
      ledgerService: new LedgerService(c.db, c.client),
      auditRecorder: audit,
      environment: { NODE_ENV: 'test' },
      authAdapter: new AuthAdapter({ verify: async () => principal }),
    });
    try {
      const matter = await new MatterRepository(c.db).createMatter({
        ...owner,
        createdBy: 'author',
        title: 'Caso de orçamento',
      });
      const text = 'Linha "citada" \\ 😀\n'.repeat(2000);
      const doc = await new MatterRepository(c.db).ingestTextDocument({
        ...owner,
        matterId: matter.id,
        createdBy: 'author',
        title: 'Documento longo',
        originalFilename: 'l.txt',
        mimeType: 'text/plain',
        content: text,
      });
      const grant = await repo.replace(owner, matter.id, {
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
      });
      grantId = grant.id;
      const call = (cursor?: string) =>
        app.inject({
          method: 'POST',
          url: '/mcp',
          headers: { authorization: 'Bearer app' },
          payload: {
            jsonrpc: '2.0',
            id: 'request',
            method: 'tools/call',
            params: {
              name: 'case.read_item',
              arguments: { matterId: matter.id, kind: 'DOCUMENT', itemId: doc.document.id, cursor },
            },
          },
        });
      let cursor: string | undefined;
      let joined = '';
      let pages = 0;
      do {
        const response = await call(cursor);
        expect(response.statusCode).toBe(200);
        expect(Buffer.byteLength(response.body)).toBeLessThanOrEqual(24576);
        const data = response.json().result.structuredContent;
        joined += data.parts
          .filter((p: any) => p.field === 'content')
          .map((p: any) => p.text)
          .join('');
        cursor = data.nextCursor;
        pages++;
      } while (cursor && pages < 100);
      expect(cursor).toBeUndefined();
      expect(joined).toBe(text);
      revokeDuringAudit = true;
      const denied = await call();
      expect(denied.json().error.data.code).toBe('CASE_CONTEXT_NOT_AUTHORIZED');
      expect(denied.body).not.toContain('Linha');
    } finally {
      await app.close();
      c.client.close();
    }
  },20000);
  it('leitura gratuita sem carteira, seleção isolada, identidade não falsificável e revogação sem replay', async () => {
    const c = await createDatabase();
    await runPersistenceMigrations(c.client);
    const owner = { tenantId: 'mcp-case', userId: 'author' };
    const stamp = '2026-10-05T10:00:00.000Z';
    let revokedOAuth = false;
    const principal = {
      ...owner,
      subjectId: 'subject',
      roles: ['owner'],
      scopes: ['mcp', 'research:read'],
      authMethod: 'oauth_access_token' as const,
      oauthClientId: 'app-one',
      oauthGrantedAt: stamp,
    };
    const app = await buildApp({
      database: c.db,
      databaseClient: c.client,
      ledgerService: new LedgerService(c.db, c.client),
      environment: { NODE_ENV: 'test' },
      authAdapter: new AuthAdapter({
        verify: async (token) =>
          revokedOAuth
            ? null
            : token === 'app-one'
              ? principal
              : token === 'app-two'
                ? { ...principal, oauthClientId: 'app-two' }
                : token === 'session'
                  ? { ...principal, authMethod: 'session', oauthClientId: undefined, oauthGrantedAt: undefined }
                  : null,
      }),
    });
    try {
      const matter = await new MatterRepository(c.db).createMatter({
        ...owner,
        createdBy: 'author',
        title: 'Caso permitido',
      });
      const doc = await new MatterRepository(c.db).ingestTextDocument({
        ...owner,
        matterId: matter.id,
        createdBy: 'author',
        title: 'Fonte selecionada',
        originalFilename: 'c.txt',
        mimeType: 'text/plain',
        content: 'MATERIAL PRIVADO AUTORIZADO',
      });
      const access = new CaseAiAccessRepository(c.db);
      const call = (name: string, args: object = {}, token = 'app-one') =>
        app.inject({
          method: 'POST',
          url: '/mcp',
          headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': 'same-key' },
          payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
        });
      const listed = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { authorization: 'Bearer app-one' },
        payload: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      });
      const tool = listed.json().result.tools.find((t: any) => t.name === 'case.read_item');
      expect(tool).toMatchObject({ annotations: { readOnlyHint: true, openWorldHint: false } });
      expect(tool.inputSchema.properties).not.toHaveProperty('idempotencyKey');
      expect((await call('case.get_context', { matterId: matter.id })).json().error.data.code).toBe(
        'CASE_CONTEXT_NOT_AUTHORIZED',
      );
      const grant = await access.replace(owner, matter.id, {
        oauthClientId: 'app-one',
        oauthGrantedAt: stamp,
        expectedRevision: 0,
        selection: {
          documents: [{ documentId: doc.document.id, versionId: doc.version.id }],
          factIds: [],
          evidenceIds: [],
          thesisIds: [],
          authorityIds: [],
        },
      });
      const input = { matterId: matter.id, kind: 'DOCUMENT', itemId: doc.document.id };
      const ok = await call('case.read_item', input);
      expect(ok.headers['cache-control']).toBe('no-store');
      expect(ok.json().result).toMatchObject({ billing: { mode: 'FREE', chargedCents: 0, isReplay: false } });
      expect(JSON.stringify(ok.json().result)).toContain('MATERIAL PRIVADO AUTORIZADO');
      expect((await c.client.execute('SELECT * FROM ledger_accounts')).rows).toHaveLength(0);
      expect((await call('case.read_item', input, 'app-two')).json().error.data.code).toBe(
        'CASE_CONTEXT_NOT_AUTHORIZED',
      );
      expect((await call('case.read_item', input, 'session')).json().error.data.code).toBe(
        'CASE_CONTEXT_NOT_AUTHORIZED',
      );
      expect(
        (
          await call('case.read_item', {
            ...input,
            tenantId: owner.tenantId,
            userId: owner.userId,
            clientId: 'app-one',
          })
        ).json().error.data.code,
      ).toBe('INVALID_INPUT');
      await access.revoke(owner, matter.id, grant.id, 1);
      expect((await call('case.read_item', input)).json().error.data.code).toBe('CASE_CONTEXT_NOT_AUTHORIZED');
      expect(
        (await new MatterRepository(c.db).getDocumentVersion(owner.tenantId, doc.document.id))?.version.content,
      ).toBe('MATERIAL PRIVADO AUTORIZADO');
      revokedOAuth = true;
      expect((await call('case.list_shared')).statusCode).toBe(401);
    } finally {
      await app.close();
      c.client.close();
    }
  });
});
