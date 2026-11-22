import { OCR_MAX_IMAGE_SIDE, fitWithin, type OcrImage, type PdfPageSource } from './ocr-document';

/**
 * Fontes de imagem para o OCR no navegador: páginas de PDF desenhadas em canvas (pdf.js) e imagens soltas.
 * Resolução alvo: cerca de 200 dpi, sem passar de `OCR_MAX_IMAGE_SIDE` pixels no lado maior.
 */
const TARGET_SCALE = 200 / 72;

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function openPdfPages(file: File, signal?: AbortSignal): Promise<PdfPageSource> {
  const [{ getDocument, GlobalWorkerOptions }, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = worker.default;
  signal?.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const task = getDocument({ data, stopAtErrors: true, useSystemFonts: true });
  const cancel = () => void task.destroy().catch(() => undefined);
  signal?.addEventListener('abort', cancel, { once: true });
  const pdf = await task.promise;
  return {
    pageCount: pdf.numPages,
    async renderPage(number, pageSignal) {
      pageSignal?.throwIfAborted();
      const page = await pdf.getPage(number);
      try {
        const natural = page.getViewport({ scale: 1 });
        const fitted = fitWithin(natural.width * TARGET_SCALE, natural.height * TARGET_SCALE, OCR_MAX_IMAGE_SIDE);
        const viewport = page.getViewport({ scale: fitted.width / natural.width });
        const canvas = canvasOf(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvas, viewport }).promise;
        return canvas;
      } finally {
        page.cleanup();
      }
    },
    async destroy() {
      signal?.removeEventListener('abort', cancel);
      await task.destroy();
    },
  };
}

export async function loadImage(file: File, signal?: AbortSignal): Promise<OcrImage> {
  signal?.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  try {
    signal?.throwIfAborted();
    const { width, height } = fitWithin(bitmap.width, bitmap.height, OCR_MAX_IMAGE_SIDE);
    const canvas = canvasOf(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas indisponível.');
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  } finally {
    bitmap.close();
  }
}
