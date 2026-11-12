import { defineConfig } from '@playwright/test';
import workspace from './playwright.agentic-workspace.config';
export default defineConfig({
  ...workspace,
  outputDir: 'test-results/writing-desk',
  testMatch: [
    'writing-desk.spec.ts',
    'editorial-review.spec.ts',
    'agentic-workspace.spec.ts',
    'agentic-commercial.spec.ts',
    'desk-shell.spec.ts',
  ],
});
