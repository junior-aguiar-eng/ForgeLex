import { defineConfig } from '@playwright/test';
import deskShell from './playwright.desk-shell.config';

// Casca do tema gelo (V2): lateral, cabeçalho enxuto, rótulos novos e "Primeiros passos". Além do roteiro próprio, roda
// a Mesa (casca, peça e Mesa agêntica) com o tema gelo ligado, que é a verificação "suíte da Mesa nos dois temas".
process.env.FORGELEX_E2E_THEME = 'gelo';
export default defineConfig({
  ...deskShell,
  outputDir: 'test-results/shell-gelo',
  testMatch: ['shell-gelo.spec.ts', 'desk-shell.spec.ts', 'writing-desk.spec.ts', 'agentic-workspace.spec.ts'],
  webServer: (deskShell.webServer as any[]).map((server, index) => ({
    ...server,
    env: { ...server.env, ...(index === 0 ? {} : { VITE_FORGELEX_THEME: 'gelo' }) },
  })),
});
