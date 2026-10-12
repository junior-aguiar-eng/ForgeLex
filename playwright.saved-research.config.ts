import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const databaseUrl = pathToFileURL(join(tmpdir(), `forgelex-saved-e2e-${randomUUID()}.sqlite`)).toString();
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'saved-research.spec.ts', outputDir: 'test-results/saved-research', workers: 1,
  timeout: 60000, expect: { timeout: 10000 }, use: { baseURL: 'http://127.0.0.1:3550', timezoneId: 'America/Fortaleza', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node scripts/e2e-phase-7-server.mjs', url: 'http://127.0.0.1:3551/readyz', reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, FORGELEX_DATABASE_URL: databaseUrl, FORGELEX_E2E_AUTH_URL: 'http://127.0.0.1:15581', FORGELEX_E2E_API_PORT: '3551', FORGELEX_E2E_WEB_ORIGIN: 'http://127.0.0.1:3550', FORGELEX_E2E_SAVED_RESEARCH: 'true', FORGELEX_E2E_CASE_AI: 'true' } },
    { command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1 --port 3550 --strictPort', url: 'http://127.0.0.1:3550', reuseExistingServer: false,
      env: { VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'false', VITE_FORGELEX_SAVED_RESEARCH_ENABLED: 'true', VITE_SUPABASE_URL: 'http://127.0.0.1:15581', VITE_SUPABASE_PUBLISHABLE_KEY: 'phase7-e2e-publishable', VITE_FORGELEX_API_URL: 'http://127.0.0.1:3551' } },
  ],
});
