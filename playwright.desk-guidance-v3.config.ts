import { defineConfig } from '@playwright/test';
import guidance from './playwright.desk-guidance.config';

const servers = Array.isArray(guidance.webServer) ? guidance.webServer : [];

/** Orientação mesa-v3 (U3): 25 áreas com busca, peça proposta pelo texto e tribunal. Mesma pilha da guiada. */
export default defineConfig({
  ...guidance,
  outputDir: 'test-results/desk-guidance-v3',
  testMatch: 'desk-guidance-v3.spec.ts',
  webServer: servers.map((server, index) =>
    index === 0
      ? {
          ...server,
          env: {
            ...server.env,
            FORGELEX_E2E_GUIDED_SKILLS: 'false',
            FORGELEX_DESK_GUIDANCE_V3_ENABLED: 'true',
            FORGELEX_E2E_GUIDANCE_V3: 'true',
          },
        }
      : { ...server, env: { ...server.env, VITE_FORGELEX_MATTER_CHIPS_ENABLED: 'true' } },
  ),
});
