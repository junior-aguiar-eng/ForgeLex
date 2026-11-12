import { defineConfig } from '@playwright/test';
import desk from './playwright.writing-desk.config';

// Nova casca da Mesa ligada: a mesma funcionalidade da Mesa atual (U2) mais o estado vazio com atalhos.
process.env.FORGELEX_E2E_DESK_SHELL = 'true';
export default defineConfig({
  ...desk,
  outputDir: 'test-results/desk-shell',
  testMatch: ['desk-shell.spec.ts', 'writing-desk.spec.ts', 'agentic-workspace.spec.ts'],
  webServer: (desk.webServer as any[]).map((server, index) => ({
    ...server,
    env: { ...server.env, ...(index === 0 ? {} : { VITE_FORGELEX_DESK_SHELL: 'true' }) },
  })),
});
