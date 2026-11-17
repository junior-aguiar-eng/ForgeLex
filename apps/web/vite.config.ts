import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { ocrAssetsPlugin } from './ocr-assets-plugin';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  // Os arquivos do OCR (cerca de 9 MB) só entram na imagem quando o OCR está ligado no build, como no código:
  // OCR_ENABLED exige os anexos ligados.
  const ocr = env.VITE_FORGELEX_ATTACHMENTS_ENABLED === 'true' && env.VITE_FORGELEX_OCR_ENABLED === 'true';
  return {
    cacheDir: process.env.FORGELEX_VITE_CACHE_DIR || 'node_modules/.vite',
    build: { outDir: process.env.FORGELEX_VITE_OUT_DIR || 'dist' },
    plugins: [react(), ...(ocr ? [ocrAssetsPlugin()] : [])],
    server: {
      port: 3000,
    },
  };
});
