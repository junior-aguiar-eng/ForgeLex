import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from './db.js';

/**
 * Os E2E locais abrem uma segunda conexão para o mesmo arquivo SQLite enquanto o servidor, em outro processo, escreve.
 * Sem tempo de espera pela trava, o SQLite recusa na hora (`SQLITE_BUSY: database is locked`) se o servidor estiver no
 * meio de uma transação de escrita, e o resultado dependia do momento (falha intermitente do `e2e-product`).
 */
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** Processo separado que segura a trava de escrita por `holdMs` e então confirma. */
async function holdWriteLock(url: string, holdMs: number): Promise<{ finished: Promise<void> }> {
  const script = `
    import { createClient } from '@libsql/client';
        const client = createClient({ url: ${JSON.stringify(url)} });
    await client.execute('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)');
    await client.execute("INSERT OR REPLACE INTO t VALUES (1, 'a')");
    const tx = await client.transaction('write');
    await tx.execute("UPDATE t SET v = 'servidor' WHERE id = 1");
    console.log('LOCKED');
    setTimeout(async () => { await tx.commit(); client.close(); }, ${holdMs});
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), // pacote `persistence`, onde `@libsql/client` resolve
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.stdout.on('data', (chunk) => String(chunk).includes('LOCKED') && resolve());
    child.once('exit', (code) => code && reject(new Error(`holder exited with ${code}`)));
  });
  return { finished: new Promise((resolve) => child.once('exit', () => resolve())) };
}

describe('banco SQLite local com outro processo escrevendo', () => {
  it('com busyTimeoutMs, createDatabase espera a trava de escrita em vez de falhar na hora', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgelex-busy-'));
    directories.push(directory);
    const url = `file:${join(directory, 'db.sqlite')}`;
    const holder = await holdWriteLock(url, 400);
    const connection = await createDatabase({ url, busyTimeoutMs: 5000 });
    try {
      await connection.client.execute({ sql: "UPDATE t SET v = 'teste' WHERE id = 1", args: [] });
      const rows = await connection.client.execute('SELECT v FROM t WHERE id = 1');
      expect(rows.rows[0]?.v).toBe('teste');
    } finally {
      connection.client.close();
      await holder.finished;
    }
  });

  it('sem busyTimeoutMs, o padrão continua recusando na hora (a reivindicação de webhooks depende disso)', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'forgelex-busy-'));
    directories.push(directory);
    const url = `file:${join(directory, 'db.sqlite')}`;
    const holder = await holdWriteLock(url, 400);
    const connection = await createDatabase({ url });
    try {
      await expect(connection.client.execute("UPDATE t SET v = 'teste' WHERE id = 1")).rejects.toThrow(
        /database is locked/,
      );
    } finally {
      connection.client.close();
      await holder.finished;
    }
  });
});
