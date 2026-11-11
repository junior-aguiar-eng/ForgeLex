import { defineConfig } from '@playwright/test';
import workspace from './playwright.agentic-workspace.config';

const servers = Array.isArray(workspace.webServer) ? workspace.webServer : [];
const webOrigin = 'http://127.0.0.1:3310';
const apiOrigin = 'http://127.0.0.1:3311';
const authOrigin = 'http://127.0.0.1:15541';
export default defineConfig({
  ...workspace,
  outputDir: 'test-results/desk-guidance',
  testMatch: ['desk-guidance.spec.ts', 'guided-desk.spec.ts'],
  use: { ...workspace.use, baseURL: webOrigin },
  webServer: servers.map((server, index) =>
    index === 0
      ? {
          ...server,
          url: `${apiOrigin}/readyz`,
          env: {
            ...server.env,
            FORGELEX_E2E_AUTH_URL: authOrigin,
            FORGELEX_E2E_API_PORT: '3311',
            FORGELEX_E2E_WEB_ORIGIN: webOrigin,
            FORGELEX_DESK_GUIDANCE_ENABLED: 'true',
            FORGELEX_E2E_GUIDED_SKILLS: 'true',
            FORGELEX_E2E_SAVED_RESEARCH: 'true',
          },
        }
      : {
          ...server,
          command: 'pnpm --filter @forgelex/web dev --host 127.0.0.1 --port 3310 --strictPort',
          url: webOrigin,
          env: {
            ...server.env,
            VITE_SUPABASE_URL: authOrigin,
            VITE_FORGELEX_API_URL: apiOrigin,
            VITE_FORGELEX_SAVED_RESEARCH_ENABLED: 'true',
          },
        },
  ),
});
