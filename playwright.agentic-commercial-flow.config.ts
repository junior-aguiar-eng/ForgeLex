import { randomUUID } from 'node:crypto';
import { defineConfig } from '@playwright/test';
import documents from './playwright.documents.config';

const databaseUrl = `file:./.superpowers/sdd/2026-10-30-execucao-comercial/browser-${randomUUID()}.sqlite`;
export default defineConfig({
  ...documents,
  outputDir: 'test-results/agentic-commercial-flow',
  testMatch: 'agentic-commercial-flow.spec.ts',
  webServer: (documents.webServer as any[]).map((server, index) => ({
    ...server,
    env: {
      ...server.env,
      ...(index === 0
        ? { FORGELEX_E2E_COMMERCIAL: 'true', FORGELEX_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl }
        : { VITE_FORGELEX_AGENTIC_WORKSPACE_ENABLED: 'true' }),
    },
  })),
});
