import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import { createDatabase, type ForgeLexDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { ApiKeyRepository } from './api-key-repository.js';

describe('ApiKeyRepository', () => {
  let db: ForgeLexDatabase;
  let client: Client;
  let repository: ApiKeyRepository;

  beforeEach(async () => {
    const connection = await createDatabase({ url: 'file::memory:?cache=shared' });
    db = connection.db;
    client = connection.client;
    await runPersistenceMigrations(client);
    repository = new ApiKeyRepository(db);
  });

  afterEach(() => client.close());

  it('revoga somente as chaves ativas do tenant indicado e devolve a contagem', async () => {
    const create = (id: string, tenantId: string, tokenHash: string) => repository.create({
      id,
      tenantId,
      subjectId: `subject_${tenantId}`,
      userId: `user_${tenantId}`,
      name: id,
      keyPrefix: 'flx_test',
      tokenHash,
      roles: ['owner'],
      scopes: ['mcp'],
    });
    await create('key_1', 'tenant_1', 'a'.repeat(64));
    await create('key_2', 'tenant_1', 'b'.repeat(64));
    await create('key_3', 'tenant_2', 'c'.repeat(64));
    await repository.revoke('tenant_1', 'key_2');

    expect(await repository.revokeAllByTenant('tenant_1', '2026-09-22T12:00:00.000Z')).toBe(1);
    expect(await repository.revokeAllByTenant('tenant_1', '2026-09-22T12:01:00.000Z')).toBe(0);
    expect(await repository.findActiveByTokenHash('a'.repeat(64))).toBeUndefined();
    expect(await repository.findActiveByTokenHash('c'.repeat(64))).toBeDefined();
  });
});
