import eslint from '@eslint/js';
import eslintReact from '@eslint-react/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];
const webFiles = ['apps/web/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    name: 'forgelex/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/.vitest/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.generated.*',
      '**/*.gen.*',
      '**/*.d.ts',
      '**/*.tsbuildinfo',
      '**/*.tmp',
      '**/*.temp',
      '**/*.bak',
      '**/*.orig',
    ],
  },
  { ...eslint.configs.recommended, name: 'forgelex/javascript-recommended', files: typescriptFiles },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: typescriptFiles })),
  {
    name: 'forgelex/typescript-gradual',
    files: typescriptFiles,
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    ...eslintReact.configs.jsx,
    name: 'forgelex/react-jsx',
    files: webFiles,
  },
  {
    ...eslintReact.configs.dom,
    name: 'forgelex/react-dom',
    files: webFiles,
  },
  {
    name: 'forgelex/react-hooks',
    files: webFiles,
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  eslintConfigPrettier,
);
