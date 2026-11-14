import { createHash } from 'node:crypto';
import { createReadStream, mkdtempSync, chmodSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

export const GLOBAL_STJ_TABLES = Object.freeze([
  'jurisprudence_ingestion_runs',
  'jurisprudence_source_manifests',
  'jurisprudence_documents',
  'jurisprudence_document_versions',
]);

export function assertAllowedTables(tables) {
  if (
    !Array.isArray(tables) ||
    tables.some((table) => !GLOBAL_STJ_TABLES.includes(table)) ||
    new Set(tables).size !== tables.length
  )
    throw new Error('EXPORT_TABLE_NOT_ALLOWED');
  return tables;
}
export function buildDumpArgs(file, tables = GLOBAL_STJ_TABLES) {
  assertAllowedTables(tables);
  return ['--data-only', '--format=custom', `--file=${file}`, ...tables.map((table) => `--table=${table}`)];
}
export function buildRestoreArgs(file) {
  return ['--single-transaction', '--exit-on-error', '--data-only', file];
}
export function assertRemoteRestore(sourceUrl, targetUrl, confirmation) {
  if (confirmation !== 'confirmed') throw new Error('REMOTE_RESTORE_NOT_CONFIRMED');
  if (new URL(sourceUrl).hostname === new URL(targetUrl).hostname) throw new Error('RESTORE_TARGET_MUST_DIFFER');
}
// libpq passfiles cannot encode record separators. Reject them before creating files.
function connectionCredentials(value) {
  try {
    if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error();
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hash ||
      !/^[a-zA-Z0-9._:[\]\-]+$/.test(url.hostname)
    )
      throw new Error();
    const user = decodeURIComponent(url.username);
    const database = decodeURIComponent(url.pathname.slice(1));
    const password = decodeURIComponent(url.password);
    if (!user || !database || [user, database, password].some((field) => /[\r\n\0]/.test(field))) throw new Error();
    // No service/passfile/password overrides: they could bypass the private passfile.
    const parameters = {
      sslmode: /^(disable|allow|prefer|require|verify-ca|verify-full)$/,
      host: /^[^\r\n\0]+$/,
      port: /^\d+$/,
      connect_timeout: /^\d+$/,
      sslrootcert: /^[^\r\n\0]+$/,
      sslcert: /^[^\r\n\0]+$/,
      sslkey: /^[^\r\n\0]+$/,
    };
    for (const [key, parameter] of url.searchParams) {
      if (
        !Object.hasOwn(parameters, key) ||
        !parameters[key].test(parameter) ||
        url.searchParams.getAll(key).length !== 1
      )
        throw new Error();
    }
    const port = url.searchParams.get('port') ?? (url.port || '5432');
    const escape = (field) => field.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
    // Each private file serves exactly one child/connection; host wildcard also supports Unix sockets.
    const passfile = `*:${escape(port)}:${escape(database)}:${escape(user)}:${escape(password)}\n`;
    url.password = '';
    return { url: url.toString(), passfile };
  } catch {
    throw new Error('DATABASE_CONNECTION_INVALID');
  }
}

async function run(command, args, databaseUrl) {
  if (process.platform === 'win32') throw new Error('POSTGRES_EXPORT_REQUIRES_POSIX');
  const credentials = connectionCredentials(databaseUrl);
  const directory = mkdtempSync(join(tmpdir(), 'forgelex-pgpass-'));
  let child;
  let interrupted;
  const cleanup = () => rmSync(directory, { recursive: true, force: true });
  const interrupt = (signal) => {
    interrupted = signal;
    // Remove credentials immediately, including when a child ignores termination.
    cleanup();
    child?.kill('SIGKILL');
  };
  const onInt = () => interrupt('SIGINT');
  const onTerm = () => interrupt('SIGTERM');
  process.once('SIGINT', onInt);
  process.once('SIGTERM', onTerm);
  try {
    chmodSync(directory, 0o700);
    const passfile = join(directory, 'pgpass');
    writeFileSync(passfile, credentials.passfile, { mode: 0o600, flag: 'wx' });
    // Do not pass inherited libpq overrides or credential-bearing application URLs.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith('PG') &&
          !['FORGELEX_PHASE8_SOURCE_DATABASE_URL', 'FORGELEX_PHASE8_TARGET_DATABASE_URL'].includes(key),
      ),
    );
    env.PGPASSFILE = passfile;
    await new Promise((ok, reject) => {
      child = spawn(command, [`--dbname=${credentials.url}`, '--no-password', ...args], { stdio: 'ignore', env });
      child.once('error', () => reject(new Error(`${command.toUpperCase()}_START_FAILED`)));
      child.once('close', (code) => {
        if (interrupted) {
          process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
          reject(new Error('POSTGRES_EXPORT_INTERRUPTED'));
        } else if (code === 0) ok();
        else reject(new Error(`${command.toUpperCase()}_FAILED:${code}`));
      });
    });
  } finally {
    cleanup();
    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);
  }
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const action = process.argv[2] ?? 'export';
  const file = resolve(process.env.FORGELEX_PHASE8_DUMP_PATH ?? 'phase8-stj.dump');
  const sourceUrl = process.env.FORGELEX_PHASE8_SOURCE_DATABASE_URL;
  if (!sourceUrl) throw new Error('FORGELEX_PHASE8_SOURCE_DATABASE_URL_REQUIRED');
  if (action === 'export') {
    await run('pg_dump', buildDumpArgs(file), sourceUrl);
    console.log(JSON.stringify({ file, sha256: await sha256(file), tables: GLOBAL_STJ_TABLES }));
    return;
  }
  if (action === 'restore') {
    const targetUrl = process.env.FORGELEX_PHASE8_TARGET_DATABASE_URL;
    if (!targetUrl) throw new Error('FORGELEX_PHASE8_TARGET_DATABASE_URL_REQUIRED');
    assertRemoteRestore(
      connectionCredentials(sourceUrl).url,
      connectionCredentials(targetUrl).url,
      process.env.FORGELEX_PHASE8_ALLOW_REMOTE_RESTORE,
    );
    await run('pg_restore', buildRestoreArgs(file), targetUrl);
    console.log(JSON.stringify({ file, sha256: await sha256(file), tables: GLOBAL_STJ_TABLES, restored: true }));
    return;
  }
  throw new Error('EXPORT_ACTION_INVALID');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  main().catch((error) => {
    const message = error instanceof Error ? error.message : '';
    console.error(/^[A-Z][A-Z0-9_]*(?::(?:\d+|null))?$/.test(message) ? message : 'POSTGRES_EXPORT_FAILED');
    process.exitCode ||= 1;
  });
