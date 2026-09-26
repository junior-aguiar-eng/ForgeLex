import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@forgelex/domain': resolve(repositoryRoot, 'packages/domain/src/index.ts'),
      '@forgelex/agent-core': resolve(repositoryRoot, 'packages/agent-core/src/index.ts'),
      '@forgelex/agent-provider-anthropic': resolve(repositoryRoot, 'packages/agent-provider-anthropic/src/index.ts'),
      '@forgelex/agent-provider-openai': resolve(repositoryRoot, 'packages/agent-provider-openai/src/index.ts'),
      '@forgelex/audit': resolve(repositoryRoot, 'packages/audit/src/index.ts'),
      '@forgelex/billing-ledger': resolve(repositoryRoot, 'packages/billing-ledger/src/index.ts'),
      '@forgelex/legal-data': resolve(repositoryRoot, 'packages/legal-data/src/index.ts'),
      '@forgelex/legal-tools': resolve(repositoryRoot, 'packages/legal-tools/src/index.ts'),
      '@forgelex/legal-workflows': resolve(repositoryRoot, 'packages/legal-workflows/src/index.ts'),
      '@forgelex/mcp-server': resolve(repositoryRoot, 'packages/mcp-server/src/index.ts'),
      '@forgelex/persistence': resolve(repositoryRoot, 'packages/persistence/src/index.ts'),
      '@forgelex/source-catalog': resolve(repositoryRoot, 'packages/source-catalog/src/index.ts'),
      '@forgelex/source-providers': resolve(repositoryRoot, 'packages/source-providers/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: 2,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.superpowers/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
