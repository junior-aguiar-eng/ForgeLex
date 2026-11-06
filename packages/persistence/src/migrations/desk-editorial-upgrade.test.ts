import { expect, it } from 'vitest';
import { createDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from './migration-runner.js';
it('0040 acrescenta metadados nulos sem mudar versões existentes e não reaplica', async () => {
  const { client } = await createDatabase({ url: 'file::memory:' });
  try {
    await runMigrations(
      client,
      persistenceMigrations.filter((m) => m.id !== 'persistence-0040-desk-editorial'),
    );
    await client.execute(
      "INSERT INTO matters(id,tenant_id,title,status,created_by,created_at,updated_at) VALUES('m','t','Caso','ACTIVE','u','now','now')",
    );
    await client.execute(
      "INSERT INTO drafts(id,tenant_id,matter_id,title,status,created_by,created_at,updated_at) VALUES('d','t','m','Peça','DRAFT','u','now','now')",
    );
    await client.execute(
      "INSERT INTO draft_versions(id,tenant_id,matter_id,draft_id,version_number,source,content_hash,status,created_by,created_at) VALUES('v','t','m','d',1,'HUMAN','original','DRAFT','u','now')",
    );
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    expect((await client.execute('SELECT id,content_hash,editorial_reviews_json FROM draft_versions')).rows).toEqual([
      { id: 'v', content_hash: 'original', editorial_reviews_json: null },
    ]);
  } finally {
    client.close();
  }
});
