import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { createDatabase, type ForgeLexDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { ResearchHistoryRepository } from './research-history-repository.js';

describe('ResearchHistoryRepository', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: ResearchHistoryRepository;

  beforeEach(async () => {
    const connection = await createDatabase();
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(connection.client);
    repository = new ResearchHistoryRepository(db);
  });

  afterEach(() => client.close());

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

  it('rejeita query vazia', async () => {
    await expect(repository.record({ tenantId: 'a', userId: 'u', operationId: 'empty', query: '   ', court: 'STJ', resultCount: 1, billingMode: 'FREE', chargedCents: 0 })).rejects.toThrow('RESEARCH_HISTORY_QUERY_REQUIRED');
  });
});
