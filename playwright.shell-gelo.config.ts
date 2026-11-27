import { defineConfig } from '@playwright/test';
import deskShell from './playwright.desk-shell.config';

// Tema gelo com a regra do mínimo (AGENTS.md, 26/11/2026). A Mesa do gelo não tem as ferramentas que as suítes da Mesa
// clássica exercitam (modo, caso, abas, lista de peças); essas suítes continuam nas configurações do clássico.
process.env.FORGELEX_E2E_THEME = 'gelo';
export default defineConfig({
  ...deskShell,
  outputDir: 'test-results/shell-gelo',
  testMatch: ['shell-gelo.spec.ts'],
  webServer: (deskShell.webServer as any[]).map((server, index) => ({
    ...server,
    env: { ...server.env, ...(index === 0 ? {} : { VITE_FORGELEX_THEME: 'gelo' }) },
  })),
});
