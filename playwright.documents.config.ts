import { defineConfig, devices } from '@playwright/test';

// Real API and browser, disposable SQLite and local Auth fixture. No cloud account.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'documents.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:3300', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/e2e-phase-7-server.mjs',
      url: 'http://127.0.0.1:3301/readyz',
      reuseExistingServer: false,
      stdout: 'pipe',
      env: { DATABASE_URL: 'file::memory:?cache=shared', FORGELEX_DATABASE_URL: 'file::memory:?cache=shared', FORGELEX_E2E_AUTH_URL: 'http://127.0.0.1:15531', FORGELEX_E2E_API_PORT: '3301', FORGELEX_E2E_WEB_ORIGIN: 'http://127.0.0.1:3300' },
    },
    {
      command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1 --port 3300 --strictPort',
      url: 'http://127.0.0.1:3300',
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:15531',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'phase7-e2e-publishable',
        VITE_FORGELEX_API_URL: 'http://127.0.0.1:3301',
      },
    },
  ],
});
