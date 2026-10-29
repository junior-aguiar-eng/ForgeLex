import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  cacheDir: process.env.FORGELEX_VITE_CACHE_DIR || 'node_modules/.vite',
  build: { outDir: process.env.FORGELEX_VITE_OUT_DIR || 'dist' },
  plugins: [react()],
  server: {
    port: 3000,
  },
});
