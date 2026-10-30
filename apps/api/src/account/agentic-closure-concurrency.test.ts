import { it, expect } from 'vitest';
import { createDatabase, runPersistenceMigrations, AgenticWorkspaceRepository } from '@forgelex/persistence';
import { runLedgerMigrations } from '@forgelex/billing-ledger';
import { AccountClosurePurgeService } from './account-closure-purge-service.js';
import { ExecutionService } from '../agentic-workspace/execution-service.js';

it('impede requisição autenticada antiga de recriar conteúdo após expurgo e remoção da identidade', async () => {
  const c = await createDatabase({ url: ':memory:' });
  try {
    await runPersistenceMigrations(c.client); await runLedgerMigrations(c.client);
    const owner = { tenantId: 'encerrado', userId: 'user' };
    const input = { objective: 'Solicitação antiga', context: { text: 'privado', origin: 'USER' as const, documents: [] } };
    const service = new ExecutionService(c.db, c.client, { executorAvailable: true });
    await new AccountClosurePurgeService(c.client).purgePrivateContent({ tenantId: owner.tenantId, closureId: 'closure' });
    await expect(service.startExecution(owner, 'late', input)).rejects.toThrow('AGENTIC_TENANT_CLOSED');
    await expect(new AgenticWorkspaceRepository(c.db).createConversation(owner, input)).rejects.toThrow('AGENTIC_TENANT_CLOSED');
    expect((await c.client.execute('SELECT id FROM agentic_conversations')).rows).toHaveLength(0);
    expect((await c.client.execute('SELECT id FROM agentic_command_owners')).rows).toHaveLength(0);
    const other = await new AgenticWorkspaceRepository(c.db).createConversation({ ...owner, tenantId: 'other' }, input);
    expect(other.objective).toBe(input.objective);
  } finally { c.client.close(); }
});
