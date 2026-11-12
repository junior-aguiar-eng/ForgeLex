import { defineConfig } from '@playwright/test';
import workspace from './playwright.agentic-workspace.config';

const servers = Array.isArray(workspace.webServer) ? workspace.webServer : [];

/** Anexos no compositor da Mesa (U5). Mesma pilha da Mesa integrada, com a flag de anexos ligada só no navegador. */
export default defineConfig({
  ...workspace,
  outputDir: 'test-results/attachments',
  testMatch: 'attachments.spec.ts',
  webServer: servers.map((server, index) =>
    index === 0 ? server : { ...server, env: { ...server.env, VITE_FORGELEX_ATTACHMENTS_ENABLED: 'true' } },
  ),
});
