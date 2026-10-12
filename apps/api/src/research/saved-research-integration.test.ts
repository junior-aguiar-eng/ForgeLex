import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { createDatabase, runPersistenceMigrations, IngestionRunRepository, JurisprudenceRepository } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { CANONICAL_CASE_LAW_FIXTURES } from '@forgelex/legal-tools';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import type { AuthenticatedPrincipal } from '@forgelex/domain';

describe('saved research site and MCP integration', () => {
  it('shares six owned snapshots, requires a new grant, keeps reads free and retains data when disabled', async () => {
    const path = join(tmpdir(), `saved-api-${randomUUID()}.db`);
    const c = await createDatabase({ url: pathToFileURL(path).toString() });
    await runPersistenceMigrations(c.client);
    const ledger = new LedgerService(c.db, c.client); await ledger.runMigrations();
    const principal: AuthenticatedPrincipal = { tenantId: 'collection-api', userId: 'user', subjectId: 'subject', scopes: ['mcp', 'research:read'], roles: ['owner'], authMethod: 'session' };
    await ledger.provisionAccount(principal.tenantId, { paidBalanceCents: 1000, promotionalBalanceCents: 0 });
    let oauthActive = true; let grantedAt = '2026-10-11T12:00:00.000Z';
    const auth = new AuthAdapter({ verify: async token => token === 'owner' ? principal : token === 'foreign' ? { ...principal, userId: 'foreign' } : token === 'key' ? { ...principal, authMethod: 'api_key' } : token === 'oauth' && oauthActive ? { ...principal, authMethod: 'oauth_access_token', oauthClientId: 'chatgpt-test', oauthGrantedAt: grantedAt } : null });
    const base = { database: c.db, databaseClient: c.client, ledgerService: ledger, authAdapter: auth,
      oauthClientDirectory: { list: async () => [{ clientId: 'chatgpt-test', displayName: 'ChatGPT de teste', grantedAt }] } };
    const flags = { NODE_ENV: 'test', FORGELEX_SAVED_RESEARCH_ENABLED: 'true', FORGELEX_MCP_DECISION_UI_ENABLED: 'true' };
    const now = '2026-10-11T12:00:00.000Z';
    const source = CANONICAL_CASE_LAW_FIXTURES[0];
    const runs = new IngestionRunRepository(c.db); const run = await runs.start({ providerId: 'fixture', court: 'STJ' }); await runs.complete(run.id, { documentsSeen: 1, documentsPublished: 1 });
    await new JurisprudenceRepository(c.db).upsertDocument({ ingestionRunId: run.id, document: { ...source, officialUrl: source.fullTextUrl, firstSeenAt: now, lastSeenAt: now, snapshot: { contentHash: source.provenance.source.contentHash!, capturedAt: now, provider: 'fixture' } } });
    const app = await buildApp({ ...base, environment: flags });
    const headers = { authorization: 'Bearer owner' };
    const mcp = async (name: string, args = {}) => app.inject({ method: 'POST', url: '/mcp', headers: { authorization: 'Bearer oauth' }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } });
    try {
      const savedIds: string[] = [];
      for (let i = 0; i < 7; i++) {
        const operationId = 'integration-' + i;
        const result = await app.inject({ method: 'POST', url: '/api/v2/research/search-case-law', headers: { ...headers, 'Idempotency-Key': operationId }, payload: { query: 'dados pessoais', court: 'STJ', limit: 20 } });
        expect(result.statusCode, result.body).toBe(200); expect(result.json().results).toHaveLength(1); expect(result.json().results[0].versionId).toBeTruthy(); expect(result.json().operationId).toBe(operationId);
        const save = await app.inject({ method: 'POST', url: '/api/v2/research/saved', headers, payload: { operationId } });
        expect(save.statusCode, save.body).toBe(i < 6 ? 200 : 409);
        if (i < 6) savedIds.push(save.json().id);
      }
      expect(await ledger.getAvailableBalanceCents(principal.tenantId)).toBe(860);
      const duplicate = await app.inject({ method: 'POST', url: '/api/v2/research/saved', headers, payload: { operationId: 'integration-0' } }); expect(duplicate.json().id).toBe(savedIds[0]);
      expect((await app.inject({ method: 'GET', url: '/api/v2/research/saved', headers })).json().items).toHaveLength(6);
      expect((await app.inject({ method: 'GET', url: '/api/v2/research/saved/' + savedIds[0], headers: { authorization: 'Bearer foreign' } })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/api/v2/research/saved', headers: { authorization: 'Bearer key' }, payload: { operationId: 'integration-0' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/v2/research/saved', headers, payload: { operationId: 'integration-0', results: [source] } })).statusCode).toBe(400);
      expect((await mcp('research.list_saved_searches')).json().result.isError).toBe(true);
      const permission = { clientId: 'chatgpt-test', grantedAt, enabled: true };
      expect((await app.inject({ method: 'PUT', url: '/api/v2/research/saved/permissions', headers: { authorization: 'Bearer oauth' }, payload: permission })).statusCode).toBe(403);
      expect((await app.inject({ method: 'PUT', url: '/api/v2/research/saved/permissions', headers, payload: permission })).statusCode).toBe(200);
      expect((await mcp('research.list_saved_searches')).json().result.structuredContent.items).toHaveLength(6);
      expect((await mcp('research.get_saved_search', { id: savedIds[0] })).json().result.structuredContent.decisions[0].decision.syllabus).toBe(source.syllabus);
      expect((await mcp('research.delete_saved_search', { id: savedIds[0] })).json().result.isError).toBe(true);
      await c.client.execute('UPDATE billing_operations SET result_snapshot = NULL'); await c.client.execute('UPDATE ledger_entries SET operation_result_snapshot = NULL');
      const open = await app.inject({ method: 'GET', url: '/api/v2/research/saved/' + savedIds[0], headers }); expect(open.statusCode, open.body).toBe(200); expect(open.headers['x-forgelex-billing-mode']).toBe('FREE');
      expect((await mcp('research.get_saved_search', { id: savedIds[0] })).json().result.billing.chargedCents).toBe(0);
      expect(await ledger.getAvailableBalanceCents(principal.tenantId)).toBe(860);
      grantedAt = '2026-10-11T13:00:00.000Z'; expect((await mcp('research.list_saved_searches')).json().result.isError).toBe(true);
      oauthActive = false; expect((await mcp('research.list_saved_searches')).statusCode).toBe(401);
      const off = await buildApp({ ...base, environment: { NODE_ENV: 'test' } });
      try { expect((await off.inject({ method: 'GET', url: '/api/v2/research/saved', headers })).statusCode).toBe(404); } finally { await off.close(); }
      expect((await app.inject({ method: 'GET', url: '/api/v2/research/saved', headers })).json().items).toHaveLength(6);
      expect((await app.inject({ method: 'DELETE', url: '/api/v2/research/saved/' + savedIds[0], headers })).statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: '/api/v2/research/saved', headers })).json().items).toHaveLength(5);
    } finally { await app.close(); c.client.close(); try { rmSync(path, { force: true }); } catch { /* Windows handle. */ } }
  }, 30000);
});
