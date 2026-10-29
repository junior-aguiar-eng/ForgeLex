import { describe, it, expect } from 'vitest';
import { analysisFixture } from '../../../../packages/persistence/src/repositories/case-analysis-repository.test.js';
import { buildApp } from '../app.js';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { LedgerService, runLedgerMigrations } from '@forgelex/billing-ledger';

describe('Análise MCP e conferência em sessão', () => {
  it('publica escrita gratuita, recebe com OAuth, confere em sessão e incorpora com autorização', async () => {
    const f = await analysisFixture();
    await runLedgerMigrations(f.client);
    const principal = {
      ...f.owner,
      subjectId: 's',
      roles: ['owner'],
      scopes: ['mcp', 'matter:read', 'matter:write', 'research:read'],
      authMethod: 'oauth_access_token' as const,
      oauthClientId: f.input ? f.reader.oauthConnection.clientId : '',
      oauthGrantedAt: f.reader.oauthConnection.grantedAt,
    };
    const app = await buildApp({
      database: f.db,
      databaseClient: f.client,
      ledgerService: new LedgerService(f.db, f.client),
      environment: { NODE_ENV: 'test' },
      authAdapter: new AuthAdapter({
        verify: async (token) => (token === 'session' ? { ...principal, authMethod: 'session' as const } : principal),
      }),
    });
    const mcp = (method: string, args?: unknown) =>
      app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { authorization: 'Bearer oauth' },
        payload: {
          jsonrpc: '2.0',
          id: 'analysis-1',
          method,
          params: method === 'tools/call' ? { name: 'case.save_analysis', arguments: args } : {},
        },
      });
    try {
      const tools = (await mcp('tools/list')).json().result.tools;
      const tool = tools.find((t: any) => t.name === 'case.save_analysis');
      expect(tool, 'ferramenta de recebimento deve estar publicada').toBeDefined();
      expect(tool.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: true });
      expect((await mcp('tools/call',{...f.input,items:[{...f.input.items[0],sources:[]}]})).json().result.isError).toBe(true);
      expect(JSON.parse((await mcp('tools/call',{...f.input,objective:'x'.repeat(530000)})).json().result.content[0].text).error.code).toBe('ANALYSIS_INPUT_TOO_LARGE');
      const reply = (await mcp('tools/call', f.input)).json();
      expect(reply.result).toMatchObject({
        isError: false,
        billing: { mode: 'FREE', chargedCents: 0, isReplay: false },
      });
      const id = reply.result.structuredContent.id;
      const path = `/api/v2/matters/${f.matter.id}/analyses/${id}`;
      expect(
        (await app.inject({ method: 'GET', url: path, headers: { authorization: 'Bearer oauth' } })).statusCode,
      ).toBe(403);
      expect(
        (await app.inject({ method: 'GET', url: path, headers: { authorization: 'Bearer session' } })).json().items,
      ).toHaveLength(4);
      const decision = await app.inject({
        method: 'POST',
        url: path + '/decisions',
        headers: { authorization: 'Bearer session' },
        payload: { expectedRevision: 1, decisions: [{ itemId: 'f1', action: 'ADOPT' }] },
      });
      expect(decision.statusCode).toBe(200);
      expect(decision.json().decisions.f1.targetId).toBeDefined();
      expect((await app.inject({method:'POST',url:path+'/decisions',headers:{authorization:'Bearer session'},payload:{expectedRevision:1,decisions:[{itemId:'q1',action:'ADOPT'}]}})).statusCode).toBe(409);
      await f.repo.revoke(f.owner, f.matter.id, f.grant.id, 1);
      expect((await mcp('tools/call', f.input)).json().result.isError).toBe(true);
      expect((await f.client.execute('SELECT id FROM ledger_entries')).rows).toEqual([]);
    } finally {
      await app.close();
      f.client.close();
    }
  });
});
