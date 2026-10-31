import { defineConfig } from '@playwright/test';
import base from './playwright.config';
const webOrigin = process.env.FORGELEX_E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3000';
const apiPort = process.env.FORGELEX_E2E_API_PORT ?? '3001';
const apiOrigin = `http://127.0.0.1:${apiPort}`;

// Same API/Auth fixtures as the product suite, disposable local SQLite.
// Both database variables prevent an inherited environment overriding the fixture.
export default defineConfig({
  outputDir: 'test-results/mcp-site',
  ...base,
  use: { ...base.use, baseURL: webOrigin },
  testMatch: ['mcp-onboarding.spec.ts', 'site-mcp-scope.spec.ts', 'sidebar-short-viewport.spec.ts'],
  webServer: (base.webServer as { env?: Record<string, string> }[]).map((server) => ({
    ...server,
    command: server.env?.VITE_SUPABASE_URL
      ? `pnpm --filter @forgelex/web dev --host 127.0.0.1 --port ${new URL(webOrigin).port} --strictPort`
      : server.command,
    url: server.env?.VITE_SUPABASE_URL ? webOrigin : `${apiOrigin}/readyz`,
    reuseExistingServer: false,
    env: {
      ...server.env,
      ...(server.env?.VITE_SUPABASE_URL
        ? { VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'false', VITE_FORGELEX_API_URL: apiOrigin }
        : {
            DATABASE_URL: 'file::memory:?cache=shared',
            FORGELEX_DATABASE_URL: 'file::memory:?cache=shared',
            FORGELEX_E2E_WEB_ORIGIN: webOrigin,
            FORGELEX_E2E_API_PORT: apiPort,
          }),
    },
  })),
});
