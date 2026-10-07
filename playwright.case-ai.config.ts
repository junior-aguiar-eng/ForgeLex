import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import documents from './playwright.documents.config';
// Keep the SQLite state across connections/rollbacks; each run owns a separate file.
const databaseUrl = `file:${join(mkdtempSync(join(tmpdir(), 'forgelex-case-ai-')), 'case-ai.sqlite').replace(/\\/g, '/')}`;
export default defineConfig({
  ...documents,
  testMatch: 'case-ai-access.spec.ts',
  webServer: (documents.webServer as { env?: Record<string, string> }[]).map((server) => ({
    ...server,
    env: { ...server.env, DATABASE_URL: databaseUrl, FORGELEX_DATABASE_URL: databaseUrl, FORGELEX_E2E_CASE_AI: 'true' },
  })),
});
