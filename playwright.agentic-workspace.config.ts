import { defineConfig } from '@playwright/test';
import documents from './playwright.documents.config';
export default defineConfig({
  ...documents,
  outputDir: 'test-results/agentic-workspace',
  testMatch: ['agentic-workspace.spec.ts', 'agentic-commercial.spec.ts'],
  webServer: (documents.webServer as any[]).map((server, index) => ({
    ...server,
    env: {
      ...server.env,
      ...(index === 0 ? { FORGELEX_E2E_AGENTIC: 'true' } : { VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' }),
    },
  })),
});
