import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';

// A dedicated container, loopback port, no volume or operational database.
const name = `forgelex-editorial-${randomUUID().slice(0, 8)}`;
const password = randomUUID();
let started = false;
try {
  execFileSync(
    'docker',
    [
      'run',
      '--rm',
      '--detach',
      '--name',
      name,
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_PASSWORD',
      '-e',
      'POSTGRES_DB=editorial_test',
      'postgres:16-alpine',
    ],
    { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: 'pipe' },
  );
  started = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (
      spawnSync('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'editorial_test'], {
        stdio: 'pipe',
      }).status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'POSTGRES_NOT_READY');
  const port = execFileSync('docker', ['port', name, '5432/tcp'], { encoding: 'utf8' }).trim().split(':').at(-1);
  execFileSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      'apps/api/src/agentic-workspace/final-editor-routes.test.ts',
      'apps/api/src/agentic-workspace/editorial-commercial-runtime.test.ts',
      '--maxWorkers=1',
      '--testTimeout=20000',
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        FORGELEX_EDITORIAL_TEST_ADMIN_URL: `postgres://postgres:${password}@127.0.0.1:${port}/editorial_test`,
      },
    },
  );
} finally {
  if (started) execFileSync('docker', ['stop', name], { stdio: 'pipe' });
}
