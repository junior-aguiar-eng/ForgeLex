import { describe, expect, it } from 'vitest';
import {
  GLOBAL_STJ_TABLES,
  assertAllowedTables,
  buildDumpArgs,
  buildRestoreArgs,
  assertRemoteRestore,
} from './export-global-stj.mjs';

describe('phase8:export-stj', () => {
  it('mantém allowlist estrita e comandos verificáveis', () => {
    expect(GLOBAL_STJ_TABLES).toHaveLength(4);
    expect(assertAllowedTables(GLOBAL_STJ_TABLES)).toEqual(GLOBAL_STJ_TABLES);
    expect(buildDumpArgs('/tmp/stj.dump')).toEqual(
      expect.arrayContaining(['--data-only', '--format=custom', '--file=/tmp/stj.dump']),
    );
    expect(buildDumpArgs('/tmp/stj.dump').filter((item) => item.startsWith('--table='))).toHaveLength(4);
    expect(buildRestoreArgs('/tmp/stj.dump')).toEqual([
      '--single-transaction',
      '--exit-on-error',
      '--data-only',
      '/tmp/stj.dump',
    ]);
  });

  it.each([
    'forgelex_tenants',
    'api_keys',
    'ledger_accounts',
    'matters',
    'sessions',
    'legal_documents',
    'jurisprudence_ingestion_staging',
  ])('rejeita tabela fora da allowlist: %s', (table) => {
    expect(() => assertAllowedTables([...GLOBAL_STJ_TABLES, table])).toThrow('EXPORT_TABLE_NOT_ALLOWED');
  });

  it('exige confirmação e hosts distintos para restauração remota', () => {
    expect(() => assertRemoteRestore('postgres://u:p@source/db', 'postgres://u:p@target/db', '')).toThrow(
      'REMOTE_RESTORE_NOT_CONFIRMED',
    );
    expect(() => assertRemoteRestore('postgres://u:p@same/db', 'postgres://u:p@same/other', 'confirmed')).toThrow(
      'RESTORE_TARGET_MUST_DIFFER',
    );
    expect(assertRemoteRestore('postgres://u:p@source/db', 'postgres://u:p@target/db', 'confirmed')).toBeUndefined();
  });
});

// These tests execute the CLI and real controlled subprocesses; no database or real credentials.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const syntheticPassword = 'synthetic:pass\\word@%';
const targetPassword = 'synthetic-target:pass\\word@%';
const syntheticUrl = (host: string, password = syntheticPassword) =>
  `postgresql://synthetic%3Auser:${encodeURIComponent(password)}@${host}/synthetic%3Adb?sslmode=require`;

async function cliFixture(action = 'export', overrides: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'forgelex-export-test-'));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  const capture = join(directory, 'capture.json');
  const program = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const passfile = process.env.PGPASSFILE;
fs.writeFileSync(process.env.TEST_CAPTURE, JSON.stringify({
  args: process.argv.slice(2), passfile, pid: process.pid,
  contents: passfile ? fs.readFileSync(passfile, 'utf8') : null,
  fileMode: passfile ? fs.statSync(passfile).mode & 0o777 : null,
  dirMode: passfile ? fs.statSync(path.dirname(passfile)).mode & 0o777 : null,
  source: process.env.FORGELEX_PHASE8_SOURCE_DATABASE_URL,
  target: process.env.FORGELEX_PHASE8_TARGET_DATABASE_URL,
  pgpassword: process.env.PGPASSWORD,
}));
if (process.env.TEST_WAIT === 'yes') setTimeout(() => process.exit(0), 2000);
else {
  process.stdout.write(process.env.TEST_SECRET);
  process.stderr.write(process.env.TEST_SECRET + encodeURIComponent(process.env.TEST_SECRET));
  const output = process.argv.find(arg => arg.startsWith('--file='));
  if (output) fs.writeFileSync(output.slice(7), 'synthetic dump');
  process.exit(Number(process.env.TEST_EXIT || '0'));
}
`;
  for (const command of ['pg_dump', 'pg_restore']) await writeFile(join(bin, command), program, { mode: 0o700 });
  const file = join(directory, 'data.dump');
  await writeFile(file, 'synthetic dump');
  const child = spawn(process.execPath, [resolve('scripts/phase8/export-global-stj.mjs'), action], {
    env: {
      PATH: bin,
      TMPDIR: directory,
      FORGELEX_PHASE8_SOURCE_DATABASE_URL: syntheticUrl('source.invalid'),
      FORGELEX_PHASE8_TARGET_DATABASE_URL: syntheticUrl('target.invalid', targetPassword),
      FORGELEX_PHASE8_ALLOW_REMOTE_RESTORE: 'confirmed',
      FORGELEX_PHASE8_DUMP_PATH: file,
      PGPASSWORD: 'synthetic-inherited-password',
      TEST_SECRET: action === 'restore' ? targetPassword : syntheticPassword,
      TEST_CAPTURE: capture,
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += String(data);
  });
  child.stderr.on('data', (data) => {
    output += String(data);
  });
  const completed = new Promise<number | null>((ok, reject) => {
    child.once('error', reject);
    child.once('close', (code) => ok(code));
  });
  return {
    directory,
    child,
    completed,
    output: () => output,
    capture: async () => JSON.parse(await readFile(capture, 'utf8')),
    cleanup: async () => {
      child.kill('SIGKILL');
      try {
        process.kill(JSON.parse(await readFile(capture, 'utf8')).pid, 'SIGKILL');
      } catch {
        /* already exited */
      }
      await completed;
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function waitForCapture(fixture: Awaited<ReturnType<typeof cliFixture>>) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      return await fixture.capture();
    } catch {
      await delay(10);
    }
  }
  throw new Error('controlled subprocess did not start');
}

const escapePassField = (value: string) => value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');

describe('phase8 CLI credential boundary (POSIX)', () => {
  it.each(['export', 'restore'])(
    'keeps %s credentials in a private passfile and removes it on success',
    async (action) => {
      const fixture = await cliFixture(action);
      try {
        expect(await fixture.completed).toBe(0);
        const captured = await fixture.capture();
        // Returning to credential-bearing URLs makes this assertion fail.
        expect(captured.args.some((arg: string) => arg.includes(encodeURIComponent(syntheticPassword)))).toBe(false);
        expect(captured.contents).toBe(
          `*:5432:synthetic\\:db:synthetic\\:user:${escapePassField(action === 'restore' ? targetPassword : syntheticPassword)}\n`,
        );
        const databaseUrl = new URL(captured.args.find((arg: string) => arg.startsWith('--dbname=')).slice(9));
        expect(databaseUrl.password).toBe('');
        expect(databaseUrl.hostname).toBe(action === 'restore' ? 'target.invalid' : 'source.invalid');
        expect(databaseUrl.searchParams.get('sslmode')).toBe('require');
        expect(captured.args).toContain('--no-password');
        expect(captured.fileMode).toBe(0o600);
        expect(captured.dirMode).toBe(0o700);
        expect(captured.source).toBeUndefined();
        expect(captured.target).toBeUndefined();
        expect(captured.pgpassword).toBeUndefined();
        await expect(stat(captured.passfile)).rejects.toThrow();
        await expect(stat(join(captured.passfile, '..'))).rejects.toThrow();
        expect(fixture.output()).not.toContain(syntheticPassword);
        expect(fixture.output()).not.toContain(encodeURIComponent(syntheticPassword));
        expect(fixture.output()).not.toContain(targetPassword);
        expect(fixture.output()).not.toContain(encodeURIComponent(targetPassword));
      } finally {
        await fixture.cleanup();
      }
    },
  );

  it('discards subprocess diagnostics containing credentials and cleans up on failure', async () => {
    const fixture = await cliFixture('export', { TEST_EXIT: '7' });
    try {
      expect(await fixture.completed).toBe(1);
      const captured = await fixture.capture();
      expect(fixture.output()).toContain('PG_DUMP_FAILED:7');
      expect(fixture.output()).not.toContain(syntheticPassword);
      expect(fixture.output()).not.toContain(encodeURIComponent(syntheticPassword));
      expect(fixture.output()).not.toContain(targetPassword);
      expect(fixture.output()).not.toContain(encodeURIComponent(targetPassword));
      await expect(stat(captured.passfile)).rejects.toThrow();
    } finally {
      await fixture.cleanup();
    }
  });

  it.each(['SIGINT', 'SIGTERM'] as const)('cleans up after %s and terminates the subprocess', async (signal) => {
    const fixture = await cliFixture('export', { TEST_WAIT: 'yes' });
    try {
      const captured = await waitForCapture(fixture);
      fixture.child.kill(signal);
      expect(await fixture.completed).toBe(signal === 'SIGINT' ? 130 : 143);
      await expect(stat(captured.passfile)).rejects.toThrow();
      await expect(stat(join(captured.passfile, '..'))).rejects.toThrow();
    } finally {
      await fixture.cleanup();
    }
  });

  it.each([
    syntheticUrl('source.invalid', 'synthetic\ninjected:*:*:*:password'),
    syntheticUrl('source.invalid', 'synthetic\rpassword'),
    `${syntheticUrl('source.invalid')}&password=synthetic-query-password`,
    `${syntheticUrl('source.invalid')}&passfile=/synthetic/override`,
    `${syntheticUrl('source.invalid')}&service=synthetic-override`,
    'postgresql://synthetic:synthetic-secret@%/db',
    'postgresql://synthetic%0Auser:synthetic-secret@source.invalid/db',
    'postgresql://synthetic:synthetic-secret@source.invalid/db%0Ainjected',
    'postgresql://synthetic:synthetic%XX@source.invalid/db',
  ])('rejects unsafe connection input without exposing it', async (source) => {
    const fixture = await cliFixture('export', { FORGELEX_PHASE8_SOURCE_DATABASE_URL: source });
    try {
      expect(await fixture.completed).toBe(1);
      await expect(fixture.capture()).rejects.toThrow();
      expect(fixture.output()).toContain('DATABASE_CONNECTION_INVALID');
      expect(fixture.output()).not.toContain('synthetic');
    } finally {
      await fixture.cleanup();
    }
  });

  it('preserves safe configuration error codes containing phase numbers', async () => {
    const fixture = await cliFixture('export', { FORGELEX_PHASE8_SOURCE_DATABASE_URL: '' });
    try {
      expect(await fixture.completed).toBe(1);
      expect(fixture.output()).toContain('FORGELEX_PHASE8_SOURCE_DATABASE_URL_REQUIRED');
      await expect(fixture.capture()).rejects.toThrow();
    } finally {
      await fixture.cleanup();
    }
  });

  it('cleans up if the PostgreSQL executable cannot start', async () => {
    const fixture = await cliFixture('export', { PATH: '/nonexistent/synthetic-bin' });
    try {
      expect(await fixture.completed).toBe(1);
      expect(fixture.output()).toContain('PG_DUMP_START_FAILED');
      expect((await readdir(fixture.directory)).filter((name) => name.startsWith('forgelex-pgpass-'))).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('disables the historical provisioner before sourcing configuration or launching gcloud', async () => {
    const child = spawn('/bin/bash', ['ops/gcp/phase8/02-provision-gate-a.sh'], {
      env: { FORGELEX_PHASE8_CONFIG: '/nonexistent/synthetic-config' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stderr.on('data', (data) => {
      output += String(data);
    });
    const code = await new Promise((resolve) => child.once('close', resolve));
    expect(code).toBe(1);
    expect(output).toContain('HISTORICAL_PROVISIONER_DISABLED');
    expect(output).not.toContain('synthetic-config');
  });
});
