import { defineConfig } from '@playwright/test';
import documents from './playwright.documents.config';
export default defineConfig({ ...documents, testMatch: 'draft-review.spec.ts' });
