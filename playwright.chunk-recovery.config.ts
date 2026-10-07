import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'chunk-recovery.spec.ts',
  workers: 1,
  outputDir: 'temp/playwright-chunk-recovery',
  use: { baseURL: 'http://127.0.0.1:3141', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @forgelex/web build && node scripts/e2e-chunk-recovery-server.mjs',
    url: 'http://127.0.0.1:3141',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_FORGELEX_API_TOKEN: '',
      VITE_FORGELEX_API_URL: 'http://127.0.0.1:3141',
    },
  },
});
