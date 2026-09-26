import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'public-site.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3137', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1 --port 3137 --strictPort',
    url: 'http://127.0.0.1:3137',
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_public',
    },
  },
});
