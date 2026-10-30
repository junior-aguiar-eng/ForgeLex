import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig } from '@playwright/test';
import documents from './playwright.documents.config';

const databaseUrl = pathToFileURL(join(mkdtempSync(join(tmpdir(), 'forgelex-commercial-e2e-')), 'browser.sqlite')).href;
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
