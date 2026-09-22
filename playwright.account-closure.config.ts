import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'account-closure.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/e2e-account-closure-server.mjs',
      url: 'http://127.0.0.1:3001/readyz',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: 'http://127.0.0.1:15431',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'closure-e2e-publishable',
        VITE_FORGELEX_API_URL: 'http://127.0.0.1:3001',
      },
    },
  ],
});
