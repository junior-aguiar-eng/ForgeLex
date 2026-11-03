import { defineConfig } from '@playwright/test';
import workspace from './playwright.agentic-workspace.config';
export default defineConfig({
  ...workspace,
  outputDir: 'test-results/editorial-review',
  testMatch: ['editorial-review.spec.ts'],
});
