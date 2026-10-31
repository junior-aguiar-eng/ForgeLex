import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { createDatabase, runPersistenceMigrations, SavedResearchRepository } from '@forgelex/persistence';
import { LedgerService } from '@forgelex/billing-ledger';
import { CANONICAL_CASE_LAW_FIXTURES } from '../fixtures/stj-sample-data.js';
import { SavedResearchService } from './saved-research-service.js';
import type { Client } from '@libsql/client';

describe('SavedResearchService original operation', () => {
  let client: Client;
  let ledger: LedgerService;
  let service: SavedResearchService;
  let path: string;
  const owner = { tenantId: 'saved-service', userId: 'bonitest' };
  const result = {
    items: [{ ...CANONICAL_CASE_LAW_FIXTURES[0], versionId: randomUUID() }],
    total: 1,
    queryExecuted: 'dano moral',
    criteria: { query: 'dano moral', court: 'STJ', limit: 10 },
  };
  beforeEach(async () => {
    path = join(tmpdir(), `saved-service-${randomUUID()}.db`);
    const database = await createDatabase({ url: pathToFileURL(path).toString() });
    client = database.client;
    await runPersistenceMigrations(client);
    ledger = new LedgerService(database.db, client);
    await ledger.runMigrations();
    await ledger.provisionAccount(owner.tenantId, { paidBalanceCents: 1000, promotionalBalanceCents: 0 });
    service = new SavedResearchService(new SavedResearchRepository(client), ledger);
  });
  afterEach(() => {
    client.close();
    try {
      rmSync(path, { force: true });
    } catch {
      /* Windows handle. */
    }
  });
  const execute = async (
    operationId: string,
    data: unknown = result,
    userId = owner.userId,
    toolName = 'research.search_case_law',
  ) =>
    ledger.executeBillableOperation({
      tenantId: owner.tenantId,
      userId,
      idempotencyKey: operationId,
      costCents: 20,
      usage: { userId, capability: toolName, toolName },
      operation: async () => data,
    });
  it('copies trusted results, survives operational expiration and re-login, and never debits reopening', async () => {
    await execute('original');
    const saved = await service.save(owner, 'original');
    await client.execute('UPDATE billing_operations SET result_snapshot = NULL');
    await client.execute('UPDATE ledger_entries SET operation_result_snapshot = NULL');
    await client.execute('DELETE FROM research_search_history');
    const reopened = new SavedResearchService(new SavedResearchRepository(client), ledger);
    expect((await reopened.get(owner, saved.id)).results.items).toEqual(result.items);
    expect((await reopened.save(owner, 'original')).id).toBe(saved.id);
    expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(980);
    expect(await reopened.list(owner)).toHaveLength(1);
  });
  it('rejects another user, another tool, missing results and obsolete snapshots without precise versions', async () => {
    await execute('foreign', result, 'someone-else');
    await execute('process', result, owner.userId, 'datajud.lookup');
    await execute('legacy', { ...result, criteria: undefined, items: CANONICAL_CASE_LAW_FIXTURES.slice(0, 1) });
    for (const id of ['foreign', 'process', 'missing', 'legacy'])
      await expect(service.save(owner, id)).rejects.toThrow();
    expect(await service.list(owner)).toHaveLength(0);
    expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(940);
  });
  it('keeps long malicious text as inert data without silent truncation', async () => {
    const syllabus = '<script>throw new Error("source executed")</script>' + 'Ementa longa. '.repeat(10000);
    await execute('long', { ...result, items: [{ ...result.items[0], syllabus }] });
    const saved = await service.save(owner, 'long');
    expect((await service.get(owner, saved.id)).results.items[0].syllabus).toBe(syllabus);
  });
  it('dates a recovered failed operation at its completed execution rather than the first attempt', async () => {
    await expect(
      ledger.executeBillableOperation({
        tenantId: owner.tenantId,
        userId: owner.userId,
        idempotencyKey: 'retried',
        costCents: 20,
        usage: { userId: owner.userId, capability: 'research.search_case_law', toolName: 'research.search_case_law' },
        operation: async () => {
          throw new Error('source unavailable');
        },
      }),
    ).rejects.toThrow();
    await client.execute(
      "UPDATE billing_operations SET created_at = '2026-10-01T12:00:00.000Z' WHERE idempotency_key = 'retried'",
    );
    await execute('retried');
    const settled = await client.execute("SELECT occurred_at FROM usage_events WHERE request_id = 'retried'");
    expect((await service.save(owner, 'retried')).searchedAt).toBe(settled.rows[0].occurred_at);
    expect(await ledger.getAvailableBalanceCents(owner.tenantId)).toBe(980);
  });
});
