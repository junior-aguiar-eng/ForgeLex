import { defineConfig } from '@playwright/test';
import saved from './playwright.saved-research.config';

export default defineConfig({
  ...saved,
  testMatch: 'desk-review.spec.ts',
  outputDir: 'test-results/desk-review',
  webServer: (Array.isArray(saved.webServer) ? saved.webServer : []).map((server, index) => ({
    ...server,
    env: {
      ...server.env,
      ...(index === 0
        ? { FORGELEX_E2E_COMMERCIAL: 'true', FORGELEX_EDITORIAL_COMMERCIAL_ENABLED: 'true' }
        : { VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'true', VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' }),
    },
  })),
});
