import { defineConfig } from '@playwright/test';
import lifecycle from './playwright.matter-lifecycle.config';

export default defineConfig({ ...lifecycle, testMatch: 'document-reader.spec.ts' });
