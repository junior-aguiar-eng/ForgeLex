import { defineConfig } from '@playwright/test';
import documents from './playwright.documents.config';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const database = pathToFileURL(join(tmpdir(), `forgelex-lifecycle-e2e-${randomUUID()}.db`)).toString();
export default defineConfig({ ...documents, testMatch: 'matter-lifecycle.spec.ts', webServer: (documents.webServer as { env?: Record<string, string> }[]).map(server => ({ ...server, env: { ...server.env, DATABASE_URL: database, FORGELEX_DATABASE_URL: database, FORGELEX_E2E_CASE_AI: 'true', FORGELEX_E2E_MATTER_LIFECYCLE: 'true' } })) });
