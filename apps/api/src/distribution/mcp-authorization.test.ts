import { describe, expect, it } from 'vitest';
import { createDatabase, runPersistenceMigrations, MatterRepository } from '@forgelex/persistence';
import { LedgerService, BillingService } from '@forgelex/billing-ledger';
import { AuthAdapter } from '../auth/fastify-auth.js';
import { buildApp } from '../app.js';

describe('MCP memo scope before billing', () => {
  it('rejects a read-only key before reservation, workflow reads or writes', async () => {
    const c = await createDatabase();
    await runPersistenceMigrations(c.client);
    const ledger = new LedgerService(c.db, c.client);
    await ledger.runMigrations();
    await ledger.provisionAccount('t', { paidBalanceCents: 5000, promotionalBalanceCents: 0 });
    const matter = await new MatterRepository(c.db).createMatter({ tenantId: 't', createdBy: 'u', title: 'Caso' });
    const app = await buildApp({
      database: c.db,
      databaseClient: c.client,
      ledgerService: ledger,
      authAdapter: new AuthAdapter({
        verify: async () => ({
          subjectId: 's',
          tenantId: 't',
          userId: 'u',
          roles: ['owner'],
          scopes: ['mcp', 'research:read'],
          authMethod: 'api_key',
        }),
      }),
      environment: { NODE_ENV: 'test' },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/mcp',
        headers: { authorization: 'Bearer read-only', 'idempotency-key': 'no-effect' },
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'workflow.legal_research_memo',
            arguments: { matterId: matter.id, query: 'vazamento de dados', idempotencyKey: 'no-effect' },
          },
        },
      });
      expect(response.json().error?.data?.code).toBe('INSUFFICIENT_SCOPE');
      expect(await ledger.getUsageEvents('t')).toHaveLength(0);
      expect((await new BillingService(c.db, c.client).getAccount('t')).paidBalanceCents).toBe(5000);
    } finally {
      await app.close();
      c.client.close();
    }
  });
});
