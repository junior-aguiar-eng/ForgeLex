import { defineConfig } from '@playwright/test';
import guidance from './playwright.desk-guidance.config';

const mode = process.env.FORGELEX_E2E_DESK_PILOT ?? 'skills';
if (!['baseline', 'guided', 'skills', 'expanded', 'captured', 'captured-limited', 'revised'].includes(mode))
  throw new Error('Modo desconhecido do piloto da Mesa');
const servers = Array.isArray(guidance.webServer) ? guidance.webServer : [];
const preview = process.env.FORGELEX_E2E_PILOT_PREVIEW === 'true';

export default defineConfig({
  ...guidance,
  outputDir: `test-results/desk-pilot-${mode}${preview ? '-preview' : ''}`,
  testMatch: 'desk-pilot.spec.ts',
  metadata: { deskPilotMode: mode },
  use: preview ? { ...guidance.use, baseURL: 'http://127.0.0.1:3360' } : guidance.use,
  webServer: preview
    ? undefined
    : servers.map((server, index) =>
        index === 0
          ? {
              ...server,
              env: {
                ...server.env,
                FORGELEX_DESK_GUIDANCE_ENABLED: String(mode !== 'baseline'),
                FORGELEX_E2E_GUIDED_SKILLS: 'false',
                FORGELEX_E2E_DESK_PILOT: mode,
              },
            }
          : server,
      ),
});
