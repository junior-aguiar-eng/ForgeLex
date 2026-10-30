import { defineConfig } from '@playwright/test';
import agentic from './playwright.agentic-workspace.config';

export default defineConfig({
  ...agentic,
  testMatch: 'agentic-flags.spec.ts',
  outputDir: 'test-results/agentic-flags',
  webServer: (agentic.webServer as { env?: Record<string, string> }[]).map((server, index) => ({
    ...server,
    env: { ...server.env, ...(index === 1 ? { VITE_FORGELEX_CASE_WORKSPACE_ENABLED: 'false' } : {}) },
  })),
});
