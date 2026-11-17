import { defineConfig } from '@playwright/test';
import savedResearch from './playwright.saved-research.config';

// Jurisprudência no tema gelo (V4): título, legenda, selos e leitor. Roda o servidor da pesquisa salva com o tema ligado.
process.env.FORGELEX_E2E_THEME = 'gelo';
export default defineConfig({
  ...savedResearch,
  outputDir: 'test-results/research-gelo',
  testMatch: ['research-gelo.spec.ts'],
  webServer: (savedResearch.webServer as any[]).map((server, index) => ({
    ...server,
    env: { ...server.env, ...(index === 0 ? {} : { VITE_FORGELEX_THEME: 'gelo' }) },
  })),
});
