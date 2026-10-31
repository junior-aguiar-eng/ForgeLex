import { defineConfig, devices } from '@playwright/test';

const authUrl = process.env.FORGELEX_E2E_AUTH_URL ?? 'http://127.0.0.1:54321';
const databaseUrl = process.env.FORGELEX_E2E_DATABASE_URL ?? 'postgres://forgelex:forgelex@127.0.0.1:55432/forgelex';
const webPort = process.env.FORGELEX_E2E_WEB_PORT ?? '3000';
const apiPort = process.env.FORGELEX_E2E_API_PORT ?? '3001';
const webOrigin = `http://127.0.0.1:${webPort}`;
const apiUrl = process.env.FORGELEX_E2E_API_URL ?? `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'account-closure.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: webOrigin, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/e2e-phase-7-server.mjs',
      url: `${apiUrl}/readyz`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: databaseUrl,
        FORGELEX_DATABASE_URL: databaseUrl,
        FORGELEX_E2E_AUTH_URL: authUrl,
        FORGELEX_E2E_API_PORT: apiPort,
        FORGELEX_E2E_WEB_ORIGIN: webOrigin,
      },
    },
    {
      command: `pnpm --filter @forgelex/web dev --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webOrigin,
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: authUrl,
        VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'true',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'phase7-e2e-publishable',
        VITE_FORGELEX_API_URL: apiUrl,
      },
    },
  ],
});
