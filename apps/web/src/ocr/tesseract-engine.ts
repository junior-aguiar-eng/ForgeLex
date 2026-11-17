import type { OcrEngine } from './ocr-document';

/**
 * Motor de OCR: Tesseract.js, só o motor LSTM, em português, com o worker, o núcleo WebAssembly e o idioma servidos
 * da nossa origem (`/ocr/…`, ver `ocr-assets-plugin.ts`). Nada vai a CDN de terceiros e o arquivo do cliente não sai
 * do navegador. Carregado sob demanda: só quem pede o OCR baixa a biblioteca.
 */
export async function createTesseractEngine(): Promise<OcrEngine> {
  const { createWorker, OEM } = await import('tesseract.js');
  // O worker nasce de um Blob, então os caminhos precisam ser absolutos.
  const base = new URL('/ocr/', window.location.href).href;
  let onFraction: ((fraction: number) => void) | undefined;
  const worker = await createWorker('por', OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    gzip: true,
    logger: (message) => {
      if (message.status === 'recognizing text') onFraction?.(message.progress);
    },
  });
  return {
    async recognize(image, callback) {
      onFraction = callback;
      try {
        const { data } = await worker.recognize(image);
        return { text: data.text, confidence: data.confidence };
      } finally {
        onFraction = undefined;
      }
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
