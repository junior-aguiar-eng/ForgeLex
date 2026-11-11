import { defineConfig } from '@playwright/test';
import desk from './playwright.desk-guidance.config';

export default defineConfig({
  ...desk,
  testMatch: 'desk-save-recovery.spec.ts',
  outputDir: 'test-results/desk-save-recovery',
  webServer: (Array.isArray(desk.webServer) ? desk.webServer : []).map((server, index) => ({
    ...server,
    env: {
      ...server.env,
      ...(index === 0 ? { FORGELEX_E2E_DRAFT_SAVE_RECOVERY: 'true' } : {}),
    },
  })),
});
