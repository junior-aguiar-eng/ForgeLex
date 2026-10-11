import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Same API/Auth fixtures as the product suite, disposable local SQLite.
// Both database variables prevent an inherited environment overriding the fixture.
export default defineConfig({
  outputDir: 'test-results/mcp-site',
  ...base,
  testMatch: ['mcp-onboarding.spec.ts', 'site-mcp-scope.spec.ts', 'sidebar-short-viewport.spec.ts'],
  webServer: (base.webServer as { env?: Record<string, string> }[]).map(server => ({
    ...server,
    reuseExistingServer: false,
    env: {
      ...server.env,
      ...(server.env?.VITE_SUPABASE_URL
        ? { VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'false' }
        : { DATABASE_URL: 'file::memory:?cache=shared', FORGELEX_DATABASE_URL: 'file::memory:?cache=shared' }),
    },
  })),
});
