import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import config from './playwright.agentic-commercial-flow.config.js';

it('commercial browser database uses an already-created absolute temporary directory', () => {
  const server = (config.webServer as { env: Record<string, string> }[])[0];
  const database = fileURLToPath(server.env.FORGELEX_DATABASE_URL);
  expect(isAbsolute(database)).toBe(true);
  expect(existsSync(dirname(database))).toBe(true);
  expect(database).not.toContain('.superpowers');
  expect(readFileSync(new URL('./playwright.agentic-commercial-flow.config.ts', import.meta.url), 'utf8')).toContain(
    'mkdtempSync',
  );
});
