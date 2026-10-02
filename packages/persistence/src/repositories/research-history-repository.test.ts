import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDatabase, type ForgeLexDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from '../migrations/migration-runner.js';
import { ResearchHistoryRepository } from './research-history-repository.js';

describe('ResearchHistoryRepository', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: ResearchHistoryRepository;
  let databasePath: string;

  beforeEach(async () => {
    databasePath = join(tmpdir(), `forgelex-history-${randomUUID()}.sqlite`);
    const connection = await createDatabase({ url: pathToFileURL(databasePath).toString() });
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(connection.client);
    repository = new ResearchHistoryRepository(db);
  });

  afterEach(() => {
    client.close();
    try { rmSync(databasePath, { force: true }); } catch { /* SQLite can retain a Windows handle until the worker exits. */ }
  });

  it('registra resultado zero, normaliza a consulta e isola tenant e usuário', async () => {
    await repository.record({ tenantId: 'a', userId: 'u', operationId: 'op', query: ' dano moral ', court: 'STJ', resultCount: 0, billingMode: 'METERED', chargedCents: 20 });

    expect(await repository.list('a', 'u', 5)).toMatchObject([{ query: 'dano moral', court: 'STJ', resultCount: 0 }]);
    expect(await repository.list('b', 'u', 5)).toEqual([]);
    expect(await repository.list('a', 'outro', 5)).toEqual([]);
  });

  it('não duplica replay da mesma operação e limita listagem a 50', async () => {
    const input = { tenantId: 'a', userId: 'u', operationId: 'same', query: 'precedente', court: 'STJ', resultCount: 2, billingMode: 'METERED' as const, chargedCents: 20 };
    await repository.record(input);
    await repository.record(input);
    for (let index = 0; index < 55; index += 1) {
      await repository.record({ ...input, operationId: `op-${index}` });
    }

    expect(await repository.list('a', 'u', 100)).toHaveLength(50);
  });

  it('agrupa antes do limite, conserva o registro mais recente e separa anos e identidades', async () => {
    const base = { tenantId: 'a', userId: 'u', query: 'precedente', court: 'STJ', resultCount: 1, billingMode: 'METERED' as const, chargedCents: 20 };
    for (let index = 0; index < 25; index += 1) {
      await repository.record({ ...base, operationId: `same-${index}`, judgmentYear: 2023, createdAt: `2026-10-02T12:00:${String(index).padStart(2, '0')}.000Z` });
    }
    await repository.record({ ...base, operationId: 'all-years', createdAt: '2026-10-02T11:00:00.000Z' });
    await repository.record({ ...base, operationId: 'other-year', judgmentYear: 2022, createdAt: '2026-10-02T10:00:00.000Z' });
    await repository.record({ ...base, operationId: 'other-user', userId: 'outro', judgmentYear: 2023 });
    await repository.record({ ...base, operationId: 'other-tenant', tenantId: 'b', judgmentYear: 2023 });
    await repository.record({ ...base, operationId: 'same-24', judgmentYear: 2023 });
    expect(await repository.listGrouped('a', 'u', 1)).toMatchObject([{ operationId: 'same-24', judgmentYear: 2023, repeatCount: 25 }]);
    expect(await repository.listGrouped('a', 'u', 20)).toMatchObject([
      { judgmentYear: 2023, repeatCount: 25 }, { judgmentYear: null, repeatCount: 1 }, { judgmentYear: 2022, repeatCount: 1 },
    ]);
    expect(await repository.list('a', 'u', 50)).toHaveLength(27);
  });

  it('rejeita query vazia', async () => {
    await expect(repository.record({ tenantId: 'a', userId: 'u', operationId: 'empty', query: '   ', court: 'STJ', resultCount: 1, billingMode: 'FREE', chargedCents: 0 })).rejects.toThrow('RESEARCH_HISTORY_QUERY_REQUIRED');
  });

  it('migra histórico antigo sem inventar ano e pode executar a migration novamente', async () => {
    const oldPath = join(tmpdir(), `forgelex-history-upgrade-${randomUUID()}.sqlite`);
    const old = await createDatabase({ url: pathToFileURL(oldPath).toString() });
    try {
      await runMigrations(old.client, persistenceMigrations.slice(0, -1));
      await old.client.execute("INSERT INTO research_search_history (id, tenant_id, user_id, operation_id, query, court, result_count, billing_mode, charged_cents, created_at) VALUES ('legacy', 'a', 'u', 'legacy', 'vazamento', 'STJ', 1, 'METERED', 20, '2026-10-02T12:00:00.000Z')");
      await runPersistenceMigrations(old.client);
      await runPersistenceMigrations(old.client);
      expect(await new ResearchHistoryRepository(old.db).listGrouped('a', 'u')).toMatchObject([{ id: 'legacy', judgmentYear: null, repeatCount: 1 }]);
    } finally {
      old.client.close();
      try { rmSync(oldPath, { force: true }); } catch { /* Windows SQLite handle. */ }
    }
  });
});
