import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { rmSync } from 'node:fs';
import { createDatabase } from '../db.js';
import { runMigrations, persistenceMigrations, runPersistenceMigrations } from './migration-runner.js';

it('migrates legacy states twice without changing business status or revisions', async () => {
  const path = join(tmpdir(), `forgelex-lifecycle-${randomUUID()}.db`);
  const { client } = await createDatabase({ url: pathToFileURL(path).toString() });
  try {
    await runMigrations(client, persistenceMigrations.filter(m => m.id !== 'persistence-0028-matter-lifecycle'));
    for (const status of ['OPEN', 'CLOSED', 'ARCHIVED']) {
      await client.execute({ sql: 'INSERT INTO matters(id,tenant_id,title,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', args: [status, 'tenant', 'Case', status, 'user', '2026-10-06', '2026-10-06'] });
    }
    await client.execute({ sql: "INSERT INTO legal_documents(id,tenant_id,matter_id,title,original_filename,mime_type,byte_size,content_hash,status,created_by,created_at,updated_at) VALUES('doc','tenant','OPEN','Document','a.pdf','application/pdf',1,?,'FAILED','user','2026-10-06','2026-10-06')", args: ['a'.repeat(64)] });
    await runPersistenceMigrations(client);
    await runPersistenceMigrations(client);
    const rows = (await client.execute('SELECT status,lifecycle_state,lifecycle_revision,previous_business_status FROM matters ORDER BY status')).rows;
    expect(rows).toEqual([
      { status: 'ARCHIVED', lifecycle_state: 'ARCHIVED', lifecycle_revision: 0, previous_business_status: 'OPEN' },
      { status: 'CLOSED', lifecycle_state: 'ACTIVE', lifecycle_revision: 0, previous_business_status: null },
      { status: 'OPEN', lifecycle_state: 'ACTIVE', lifecycle_revision: 0, previous_business_status: null },
    ]);
    expect((await client.execute('SELECT status,lifecycle_state,lifecycle_revision FROM legal_documents')).rows).toEqual([{ status: 'FAILED', lifecycle_state: 'ACTIVE', lifecycle_revision: 0 }]);
  } finally { client.close(); try { rmSync(path, { force: true }); } catch { /* Windows may retain a SQLite handle until worker exit. */ } }
});
