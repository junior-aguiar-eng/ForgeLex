import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { createDatabase } from '../db.js';
import { persistenceMigrations, runMigrations, runPersistenceMigrations } from './migration-runner.js';

it('upgrades a database with saved research without changing its contents', async () => {
  const path = join(tmpdir(), `forgelex-analysis-upgrade-${randomUUID()}.db`);
  const { client } = await createDatabase({ url: pathToFileURL(path).toString() });
  try {
    await runMigrations(
      client,
      persistenceMigrations.filter((m) => m.id !== 'persistence-0031-case-document-analysis'),
    );
    await client.execute("INSERT INTO saved_research_collections (tenant_id,user_id) VALUES ('tenant','user')");
    await client.execute(
      "INSERT INTO saved_research (id,tenant_id,user_id,slot,operation_id,result_snapshot,criteria_json,result_count,searched_at,saved_at) VALUES ('saved','tenant','user',1,'operation','{}','{}',0,'2026-10-29','2026-10-29')",
    );
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    expect((await client.execute('SELECT id,operation_id FROM saved_research')).rows).toEqual([
      { id: 'saved', operation_id: 'operation' },
    ]);
    expect(
      (await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='case_analysis_receipts'"))
        .rows,
    ).toHaveLength(1);
  } finally {
    client.close();
    try {
      rmSync(path, { force: true });
    } catch {
      /* SQLite may retain a Windows handle. */
    }
  }
});
