import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';

export const GLOBAL_STJ_TABLES = Object.freeze(['jurisprudence_ingestion_runs', 'jurisprudence_source_manifests', 'jurisprudence_documents', 'jurisprudence_document_versions']);

export function assertAllowedTables(tables) {
  if (!Array.isArray(tables) || tables.some((table) => !GLOBAL_STJ_TABLES.includes(table)) || new Set(tables).size !== tables.length) throw new Error('EXPORT_TABLE_NOT_ALLOWED');
  return tables;
}
export function buildDumpArgs(file, tables = GLOBAL_STJ_TABLES) { assertAllowedTables(tables); return ['--data-only', '--format=custom', `--file=${file}`, ...tables.map((table) => `--table=${table}`)]; }
export function buildRestoreArgs(file) { return ['--single-transaction', '--exit-on-error', '--data-only', file]; }
export function assertRemoteRestore(sourceUrl, targetUrl, confirmation) {
  if (confirmation !== 'confirmed') throw new Error('REMOTE_RESTORE_NOT_CONFIRMED');
  if (new URL(sourceUrl).hostname === new URL(targetUrl).hostname) throw new Error('RESTORE_TARGET_MUST_DIFFER');
}
function run(command, args) { return new Promise((ok, reject) => { const child = spawn(command, args, { stdio: 'inherit', env: process.env }); child.once('error', reject); child.once('exit', (code) => code === 0 ? ok() : reject(new Error(`${command.toUpperCase()}_FAILED:${code}`))); }); }
async function sha256(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex'); }

async function main() {
  const action = process.argv[2] ?? 'export';
  const file = resolve(process.env.FORGELEX_PHASE8_DUMP_PATH ?? 'phase8-stj.dump');
  const sourceUrl = process.env.FORGELEX_PHASE8_SOURCE_DATABASE_URL;
  if (!sourceUrl) throw new Error('FORGELEX_PHASE8_SOURCE_DATABASE_URL_REQUIRED');
  if (action === 'export') {
    await run('pg_dump', [...buildDumpArgs(file), sourceUrl]);
    console.log(JSON.stringify({ file, sha256: await sha256(file), tables: GLOBAL_STJ_TABLES }));
    return;
  }
  if (action === 'restore') {
    const targetUrl = process.env.FORGELEX_PHASE8_TARGET_DATABASE_URL;
    if (!targetUrl) throw new Error('FORGELEX_PHASE8_TARGET_DATABASE_URL_REQUIRED');
    assertRemoteRestore(sourceUrl, targetUrl, process.env.FORGELEX_PHASE8_ALLOW_REMOTE_RESTORE);
    await run('pg_restore', [...buildRestoreArgs(file), `--dbname=${targetUrl}`]);
    console.log(JSON.stringify({ file, sha256: await sha256(file), tables: GLOBAL_STJ_TABLES, restored: true }));
    return;
  }
  throw new Error('EXPORT_ACTION_INVALID');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
