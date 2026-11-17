import { defineConfig } from '@playwright/test';
import publicConfig from './playwright.public.config';

// Site público no modelo novo (V5A): sobe o web com VITE_FORGELEX_PUBLIC_MODEL=true.
export default defineConfig({
  ...publicConfig,
  outputDir: 'test-results/public-model',
  testMatch: ['public-model.spec.ts'],
  webServer: {
    ...(publicConfig.webServer as {
      command: string;
      url: string;
      reuseExistingServer: boolean;
      env: Record<string, string>;
    }),
    env: { ...(publicConfig.webServer as { env: Record<string, string> }).env, VITE_FORGELEX_PUBLIC_MODEL: 'true' },
  },
});
