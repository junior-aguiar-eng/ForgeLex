import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { runPersistenceMigrations } from '../migrations/migration-runner.js';
import { SavedResearchRepository } from './saved-research-repository.js';
import type { Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

describe('SavedResearchRepository', () => {
  let client: Client;
  let repo: SavedResearchRepository;
  let path: string;
  const owner = { tenantId: 'collection', userId: 'owner' };
  const input = (operationId: string) => ({
    operationId,
    snapshot: '{"items":[]}',
    criteria: { query: operationId, court: 'STJ', limit: 10 },
    resultCount: 0,
    searchedAt: '2026-10-11T12:00:00Z',
  });
  beforeEach(async () => {
    path = join(tmpdir(), `saved-research-${randomUUID()}.db`);
    ({ client } = await createDatabase({ url: pathToFileURL(path).toString() }));
    await runPersistenceMigrations(client);
    repo = new SavedResearchRepository(client);
  });
  afterEach(() => {
    client.close();
    try {
      rmSync(path, { force: true });
    } catch {
      /* Windows file handle. */
    }
  });
  it('keeps six complete snapshots, rejects the seventh, and does not replace on retry', async () => {
    const first = await repo.save(owner, input('one'));
    for (let i = 2; i <= 6; i++) await repo.save(owner, input(String(i)));
    expect((await repo.save(owner, input('one'))).id).toBe(first.id);
    await expect(repo.save(owner, input('seven'))).rejects.toMatchObject({ code: 'SAVED_RESEARCH_FULL' });
    expect(await repo.list(owner)).toHaveLength(6);
    await repo.delete(owner, first.id);
    expect((await repo.save(owner, input('seven'))).operationId).toBe('seven');
    expect(await repo.list(owner)).toHaveLength(6);
  });
  it('isolates users and accounts and enforces slot range in the database itself', async () => {
    const item = await repo.save(owner, input('one'));
    const foreign = { ...owner, userId: 'other' };
    expect(await repo.get(foreign, item.id)).toBeUndefined();
    await expect(repo.delete(foreign, item.id)).rejects.toMatchObject({ code: 'SAVED_RESEARCH_NOT_FOUND' });
    expect(await repo.get({ ...owner, tenantId: 'other' }, item.id)).toBeUndefined();
    await expect(
      client.execute({ sql: 'UPDATE saved_research SET slot = 7 WHERE id = ?', args: [item.id] }),
    ).rejects.toThrow();
    expect((await repo.get(owner, item.id))?.snapshot).toBe(input('one').snapshot);
  });
  it('binds permission to the current connection and revocation denies all collection access', async () => {
    const connection = { clientId: 'claude', grantedAt: '2026-10-11T01:00:00Z' };
    await expect(repo.list(owner, connection)).rejects.toMatchObject({ code: 'SAVED_RESEARCH_NOT_AUTHORIZED' });
    await repo.setPermission(owner, connection, true);
    const item = await repo.save(owner, input('one'), connection);
    await expect(repo.get(owner, item.id, { ...connection, grantedAt: '2026-10-12T00:00:00Z' })).rejects.toMatchObject({
      code: 'SAVED_RESEARCH_NOT_AUTHORIZED',
    });
    await repo.setPermission(owner, connection, false);
    await expect(repo.delete(owner, item.id, connection)).rejects.toMatchObject({
      code: 'SAVED_RESEARCH_NOT_AUTHORIZED',
    });
    expect(await repo.list(owner)).toHaveLength(1);
  });
  it('rolls back a failed delete without releasing a slot or deleting a different item', async () => {
    const selected = await repo.save(owner, input('selected'));
    for (let i = 1; i < 6; i++) await repo.save(owner, input(String(i)));
    await client.execute(
      "CREATE TRIGGER fail_saved_delete BEFORE DELETE ON saved_research BEGIN SELECT RAISE(ABORT, 'storage unavailable'); END",
    );
    await expect(repo.delete(owner, selected.id)).rejects.toThrow();
    expect(await repo.list(owner)).toHaveLength(6);
    expect(await repo.get(owner, selected.id)).toBeDefined();
    await expect(repo.save(owner, input('new'))).rejects.toMatchObject({ code: 'SAVED_RESEARCH_FULL' });
  });
});
