import { defineConfig } from '@playwright/test';
import guidance from './playwright.desk-guidance.config';

const servers = Array.isArray(guidance.webServer) ? guidance.webServer : [];
export default defineConfig({
  ...guidance,
  outputDir: 'test-results/desk-procedure',
  testMatch: 'desk-procedure.spec.ts',
  webServer: servers.map((server, index) =>
    index === 0 ? { ...server, env: { ...server.env, FORGELEX_E2E_PROCEDURE: 'true' } } : server,
  ),
});
