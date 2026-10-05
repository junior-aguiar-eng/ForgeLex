import { defineConfig } from '@playwright/test';
import documents from './playwright.documents.config';
export default defineConfig({
  ...documents,
  testMatch: 'case-ai-access.spec.ts',
  webServer: (documents.webServer as { env?: Record<string, string> }[]).map((server) => ({
    ...server,
    env: { ...server.env, FORGELEX_E2E_CASE_AI: 'true' },
  })),
});
