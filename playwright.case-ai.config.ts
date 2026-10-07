import { defineConfig } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import documents from './playwright.documents.config';
// Keep the SQLite state across connections/rollbacks; each run owns a separate file.
const databaseDirectory = mkdtempSync(join(tmpdir(), 'forgelex-case-ai-'));
const databaseUrl = `file:${join(databaseDirectory, 'case-ai.sqlite').replace(/\\/g, '/')}`;
// Exit runs after Playwright has stopped its web servers and released SQLite.
process.once('exit', () => {
  if (resolve(dirname(databaseDirectory)) !== resolve(tmpdir()) || !basename(databaseDirectory).startsWith('forgelex-case-ai-')) {
    throw new Error('Unexpected case-ai database directory');
  }
  rmSync(databaseDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});
export default defineConfig({
  ...documents,
  testMatch: 'case-ai-access.spec.ts',
  webServer: (documents.webServer as { env?: Record<string, string> }[]).map((server) => ({
    ...server,
    env: { ...server.env, DATABASE_URL: databaseUrl, FORGELEX_DATABASE_URL: databaseUrl, FORGELEX_E2E_CASE_AI: 'true' },
  })),
});
