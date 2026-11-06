import { defineConfig } from '@playwright/test';
import commercial from './playwright.agentic-commercial-flow.config';
export default defineConfig({
  ...commercial,
  outputDir: 'test-results/editorial-review',
  testMatch: ['editorial-review.spec.ts'],
  webServer: (commercial.webServer as any[]).map((server, index) => ({
    ...server,
    env: { ...server.env, ...(index === 0 ? { FORGELEX_E2E_EDITORIAL: 'true' } : {}) },
  })),
});
