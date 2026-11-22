import { defineConfig } from '@playwright/test';
import attachments from './playwright.attachments.config';

const servers = Array.isArray(attachments.webServer) ? attachments.webServer : [];

/** Salvar o anexo no caso (U7): só existe no tema gelo. Mesma pilha dos anexos, com o tema gelo ligado no navegador. */
export default defineConfig({
  ...attachments,
  outputDir: 'test-results/attachments-gelo',
  testMatch: 'attachments-gelo.spec.ts',
  webServer: servers.map((server, index) =>
    index === 0 ? server : { ...server, env: { ...server.env, VITE_FORGELEX_THEME: 'gelo' } },
  ),
});
