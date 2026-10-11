import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { SavedResearchRepository } from './saved-research-repository.js';
const url = process.env.FORGELEX_LOCAL_POSTGRES_URL;
const local = Boolean(url && /^postgres(?:ql)?:\/\/(?:[^/]+@)?(?:localhost|127\.0\.0\.1)(?::\d+)?\//i.test(url));
describe.skipIf(!local)('saved research PostgreSQL concurrency', () => {
  it('serializes separate connections and never creates a seventh slot', async () => {
    const first = await createDatabase({ url }); const second = await createDatabase({ url });
    const owner = { tenantId: randomUUID(), userId: randomUUID() };
    try {
      await runPersistenceMigrations(first.client);
      const a = new SavedResearchRepository(first.client); const b = new SavedResearchRepository(second.client);
      const input = (operationId: string) => ({ operationId, snapshot: '{"items":[]}', criteria: { query: operationId, court: 'STJ', limit: 10 }, resultCount: 0, searchedAt: '2026-10-11T12:00:00Z' });
      const results = await Promise.allSettled(Array.from({ length: 14 }, (_, i) => (i % 2 ? a : b).save(owner, input(String(i)))));
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(6);
      expect(results.filter(result => result.status === 'rejected').every(result => (result as PromiseRejectedResult).reason.code === 'SAVED_RESEARCH_FULL')).toBe(true);
      const items = await a.list(owner); expect(items).toHaveLength(6);
      const duplicate = await Promise.all([a.save(owner, input(items[0].operationId)), b.save(owner, input(items[0].operationId))]);
      expect(duplicate[0].id).toBe(duplicate[1].id);
      await expect(second.client.execute({ sql: 'UPDATE saved_research SET slot = 7 WHERE id = ?', args: [items[0].id] })).rejects.toThrow();
      const connection = { clientId: 'test-claude', grantedAt: '2026-10-11T12:00:00Z' };
      await a.setPermission(owner, connection, true);
      expect(await b.list(owner, connection)).toHaveLength(6);
      await a.setPermission(owner, connection, false);
      await expect(b.get(owner, items[0].id, connection)).rejects.toMatchObject({ code: 'SAVED_RESEARCH_NOT_AUTHORIZED' });
      await a.delete(owner, items[0].id); await b.save(owner, input('replacement')); expect(await a.list(owner)).toHaveLength(6);
    } finally {
      for (const table of ['saved_research', 'saved_research_permissions', 'saved_research_collections']) await first.client.execute({ sql: `DELETE FROM ${table} WHERE tenant_id = ?`, args: [owner.tenantId] });
      first.client.close(); second.client.close();
    }
  }, 30000);
});
