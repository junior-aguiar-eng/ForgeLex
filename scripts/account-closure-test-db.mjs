import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function adminConnectionUrl() {
  const value = process.env.FORGELEX_ACCOUNT_CLOSURE_TEST_ADMIN_URL;
  if (!value) throw new Error('BLOCKED_TEST_ADMIN_URL: configure uma instância PostgreSQL descartável local.');
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.pathname !== '/postgres'
  ) {
    throw new Error('BLOCKED_TEST_ADMIN_URL: host local e banco postgres são obrigatórios.');
  }
  return url;
}

export function disposableName(prefix) {
  if (!/^forgelex_closure_(?:smoke|restore)_$/.test(prefix)) throw new Error('INVALID_TEST_DB_PREFIX');
  return `${prefix}${randomUUID().replaceAll('-', '')}`;
}

export function databaseUrl(adminUrl, name) {
  const url = new URL(adminUrl);
  if (!/^forgelex_closure_(?:smoke|restore)_[a-f0-9]{32}$/.test(name)) throw new Error('INVALID_TEST_DB_NAME');
  url.pathname = `/${name}`;
  return url.toString();
}

export async function withAdmin(adminUrl, callback) {
  const sql = postgres(adminUrl.toString(), { max: 1 });
  try {
    return await callback(sql);
  } finally {
    await sql.end();
  }
}

export async function createDisposableDatabase(adminUrl, name) {
  databaseUrl(adminUrl, name);
  await withAdmin(adminUrl, (sql) => sql.unsafe(`CREATE DATABASE "${name}"`));
}

export async function dropDisposableDatabase(adminUrl, name) {
  // Validate the exact target and the local admin connection before destructive SQL.
  databaseUrl(adminUrl, name);
  await withAdmin(adminUrl, (sql) => sql.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}
