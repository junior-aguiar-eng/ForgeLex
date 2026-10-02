import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const databaseUrl = pathToFileURL(join(tmpdir(), `forgelex-research-${randomUUID()}.sqlite`)).toString();
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'research-history.spec.ts', workers: 1,
  timeout: 60_000, expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:3340', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/e2e-phase-7-server.mjs', url: 'http://127.0.0.1:3341/readyz', reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, FORGELEX_DATABASE_URL: databaseUrl, FORGELEX_E2E_AUTH_URL: 'http://127.0.0.1:15571', FORGELEX_E2E_API_PORT: '3341', FORGELEX_E2E_WEB_ORIGIN: 'http://127.0.0.1:3340' },
    },
    {
      command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1 --port 3340 --strictPort', url: 'http://127.0.0.1:3340', reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: 'http://127.0.0.1:15571', VITE_SUPABASE_PUBLISHABLE_KEY: 'phase7-e2e-publishable', VITE_FORGELEX_API_URL: 'http://127.0.0.1:3341' },
    },
  ],
});
