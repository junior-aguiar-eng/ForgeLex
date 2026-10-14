import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('SQLite native lifecycle', () => {
  it('exits cleanly after FTS writes, rollback and garbage collection', () => {
    // A native finalizer crash cannot be caught inside the Vitest worker.
    // Check the child process exit status as well as its database assertions.
    const clientModule = createRequire(import.meta.url).resolve('@libsql/client');
    const directory = mkdtempSync(join(tmpdir(), 'forgelex-fts-lifecycle-'));
    const script = `
      const { createClient } = require(${JSON.stringify(clientModule)});
      const { join } = require('node:path');
      const { pathToFileURL } = require('node:url');
      const assert = require('node:assert/strict');
      (async () => {
        const directory = ${JSON.stringify(directory)};
          for (let cycle = 0; cycle < 50; cycle++) {
            const client = createClient({ url: pathToFileURL(join(directory, cycle + '.db')).href });
            try {
              await client.executeMultiple(
                'CREATE TABLE documents(body TEXT);' +
                'CREATE VIRTUAL TABLE documents_fts USING fts5(body, content=documents, content_rowid=rowid);' +
                'CREATE TRIGGER documents_insert AFTER INSERT ON documents BEGIN ' +
                'INSERT INTO documents_fts(rowid, body) VALUES(new.rowid, new.body); END;'
              );
              const rolledBack = await client.transaction();
              await rolledBack.execute("INSERT INTO documents VALUES ('descartado')");
              await rolledBack.rollback();
              assert.equal((await client.execute('SELECT * FROM documents')).rows.length, 0);
              assert.equal((await client.execute("SELECT * FROM documents_fts WHERE documents_fts MATCH 'descartado'")).rows.length, 0);
            } finally {
              client.close();
            }
            global.gc();
          }
          console.log('FTS_LIFECYCLE_OK');
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, ['--expose-gc', '-e', script], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    // Release native handles by exiting the child before removing its fixtures.
    rmSync(directory, { recursive: true, force: true });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toContain('FTS_LIFECYCLE_OK');
  }, 35_000);
});
