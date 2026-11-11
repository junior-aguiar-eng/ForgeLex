import { defineConfig } from '@playwright/test';
import saved from './playwright.saved-research.config';

export default defineConfig({
  ...saved,
  testMatch: 'desk-research.spec.ts',
  outputDir: 'test-results/desk-research',
  webServer: (Array.isArray(saved.webServer) ? saved.webServer : []).map((server, index) => ({
    ...server,
    env: {
      ...server.env,
      ...(index === 0
        ? { FORGELEX_E2E_AGENTIC: 'true' }
        : { VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'true', VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' }),
    },
  })),
});
