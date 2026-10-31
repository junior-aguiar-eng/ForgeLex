import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [react()],
  build: {
    outDir: 'dist/mcp-reader',
    emptyOutDir: true,
    lib: {
      entry: 'src/mcp/McpReaderApp.tsx',
      name: 'ForgeLexDecisionReader',
      formats: ['iife'],
      fileName: () => 'reader.js',
      cssFileName: 'reader',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
