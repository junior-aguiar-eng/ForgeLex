import { defineConfig, devices } from '@playwright/test';

const authUrl = process.env.FORGELEX_E2E_AUTH_URL ?? 'http://127.0.0.1:54321';
const databaseUrl = process.env.FORGELEX_E2E_DATABASE_URL ?? 'postgres://forgelex:forgelex@127.0.0.1:55432/forgelex';

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'account-closure.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/e2e-phase-7-server.mjs',
      url: 'http://127.0.0.1:3001/readyz',
      reuseExistingServer: false,
      env: { DATABASE_URL: databaseUrl, FORGELEX_E2E_AUTH_URL: authUrl },
    },
    {
      command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: authUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: 'phase7-e2e-publishable',
        VITE_FORGELEX_API_URL: 'http://127.0.0.1:3001',
      },
    },
  ],
});
