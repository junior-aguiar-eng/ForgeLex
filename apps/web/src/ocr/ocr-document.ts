/**
 * OCR no navegador (U6, DEC-13): o arquivo nunca sai da máquina do cliente. Este módulo só orquestra: abre o PDF ou a
 * imagem, reconhece página por página, junta o texto, respeita o limite de páginas e o cancelamento. O motor
 * (Tesseract.js), a leitura do PDF e a da imagem entram por injeção e são carregados sob demanda, para que a tela
 * continue leve e os testes rodem sem navegador.
 */

/** Limite de páginas por arquivo. Definido por medição de tempo (ver o registro de execução da U6). */
export const OCR_MAX_PAGES = 20;
export const OCR_MAX_FILE_BYTES = 15 * 1024 * 1024;
/** O mesmo teto de tamanho vale para imagens e PDFs. */
export const OCR_MAX_IMAGE_BYTES = OCR_MAX_FILE_BYTES;
/** Lado maior, em pixels, acima do qual a imagem é reduzida antes do reconhecimento (memória do navegador). */
export const OCR_MAX_IMAGE_SIDE = 4000;

export type OcrErrorCode =
  | 'TOO_MANY_PAGES'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED'
  | 'PDF_UNREADABLE'
  | 'IMAGE_UNREADABLE'
  | 'ENGINE_UNAVAILABLE'
  | 'ENGINE_FAILED';

/** Erro com mensagem própria para o cliente; detalhes internos do motor nunca entram nela. */
export class OcrError extends Error {
  public constructor(
    public readonly code: OcrErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OcrError';
  }
}

export type OcrImage = HTMLCanvasElement | OffscreenCanvas | Blob;

export interface OcrProgress {
  stage: 'preparing' | 'recognizing';
  /** Página em reconhecimento (1 para imagem). */
  page: number;
  pages: number;
  /** Progresso total, de 0 a 1, que nunca anda para trás. */
  fraction: number;
}

export interface OcrResult {
  text: string;
  pages: number;
  /** Média da confiança do motor (0 a 100) nas páginas com texto; `null` sem texto. */
  confidence: number | null;
}

export interface OcrEngine {
  recognize(image: OcrImage, onFraction?: (fraction: number) => void): Promise<{ text: string; confidence: number }>;
  terminate(): Promise<void>;
}

export interface PdfPageSource {
  pageCount: number;
  renderPage(number: number, signal?: AbortSignal): Promise<OcrImage>;
  destroy(): Promise<void>;
}

export interface RecognizeOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OcrProgress) => void;
  createEngine?: () => Promise<OcrEngine>;
  openPdf?: (file: File, signal?: AbortSignal) => Promise<PdfPageSource>;
  loadImage?: (file: File, signal?: AbortSignal) => Promise<OcrImage>;
  maxPages?: number;
}

export const isPdfFile = (file: File) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
export const isImageFile = (file: File) =>
  /\.(png|jpe?g|webp|gif|tiff?|bmp)$/i.test(file.name) || file.type.startsWith('image/');

/** Reduz proporcionalmente para o lado maior caber em `maxSide`; nunca devolve dimensão zero. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const messages = {
  tooLarge: `O arquivo passa de ${OCR_MAX_FILE_BYTES / 1024 / 1024} MB. Divida-o ou reduza a resolução e tente de novo.`,
  unsupported: 'O reconhecimento por OCR só lê PDF e imagem (PNG, JPG, WebP, GIF ou BMP).',
  pdf: 'Não foi possível abrir o PDF para o reconhecimento. Ele pode estar protegido por senha ou corrompido.',
  image: 'Não foi possível abrir a imagem. Use PNG, JPG, WebP, GIF ou BMP.',
  unavailable:
    'Os arquivos do reconhecimento por OCR não foram carregados. Confira a conexão e tente de novo; se persistir, cole o texto no pedido.',
  failed: 'O reconhecimento por OCR falhou. Tente de novo ou cole o texto no pedido.',
};

const tooManyPages = (pages: number, max: number) =>
  `O PDF tem ${pages} páginas e o reconhecimento por OCR aceita até ${max}. Divida o arquivo e reconheça as partes.`;

async function loadDefaults() {
  const [engine, sources] = await Promise.all([import('./tesseract-engine'), import('./browser-sources')]);
  return { createEngine: engine.createTesseractEngine, openPdf: sources.openPdfPages, loadImage: sources.loadImage };
}

const normalize = (text: string) => text.replace(/\r\n?/g, '\n').trim();

export async function recognizeFile(file: File, options: RecognizeOptions = {}): Promise<OcrResult> {
  const { signal, onProgress } = options;
  const maxPages = options.maxPages ?? OCR_MAX_PAGES;
  signal?.throwIfAborted();
  const pdf = isPdfFile(file);
  if (!pdf && !isImageFile(file)) throw new OcrError('UNSUPPORTED', messages.unsupported);
  if (file.size > OCR_MAX_FILE_BYTES) throw new OcrError('FILE_TOO_LARGE', messages.tooLarge);

  const defaults =
    options.createEngine && (pdf ? options.openPdf : options.loadImage) ? undefined : await loadDefaults();
  const createEngine = options.createEngine ?? defaults!.createEngine;
  let source: PdfPageSource | undefined;
  let single: OcrImage | undefined;
  let engine: OcrEngine | undefined;
  let terminated = false;
  const terminate = async () => {
    if (!engine || terminated) return;
    terminated = true;
    await engine.terminate().catch(() => undefined);
  };
  // Cancelar durante um reconhecimento longo encerra o motor na hora, em vez de esperar a página terminar.
  const onAbort = () => void terminate();
  signal?.addEventListener('abort', onAbort, { once: true });
  let last = 0;
  const report = (stage: OcrProgress['stage'], page: number, pages: number, fraction: number) => {
    last = Math.max(last, Math.min(1, fraction));
    onProgress?.({ stage, page, pages, fraction: last });
  };
  try {
    if (pdf) {
      const open = options.openPdf ?? defaults!.openPdf;
      try {
        source = await open(file, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new OcrError('PDF_UNREADABLE', messages.pdf);
      }
      if (source.pageCount > maxPages) throw new OcrError('TOO_MANY_PAGES', tooManyPages(source.pageCount, maxPages));
    } else {
      const load = options.loadImage ?? defaults!.loadImage;
      try {
        single = await load(file, signal);
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new OcrError('IMAGE_UNREADABLE', messages.image);
      }
    }
    const pages = source?.pageCount ?? 1;
    report('preparing', 1, pages, 0);
    try {
      engine = await createEngine();
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new OcrError('ENGINE_UNAVAILABLE', messages.unavailable);
    }
    signal?.throwIfAborted();

    const texts: string[] = [];
    const confidences: number[] = [];
    for (let page = 1; page <= pages; page++) {
      signal?.throwIfAborted();
      report('recognizing', page, pages, (page - 1) / pages);
      try {
        const image = single ?? (await source!.renderPage(page, signal));
        signal?.throwIfAborted();
        const result = await engine.recognize(image, (fraction) =>
          report('recognizing', page, pages, (page - 1 + Math.min(1, Math.max(0, fraction))) / pages),
        );
        const text = normalize(result.text);
        if (text) {
          texts.push(text);
          confidences.push(result.confidence);
        }
      } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        if (error instanceof OcrError) throw error;
        throw new OcrError('ENGINE_FAILED', messages.failed);
      }
    }
    signal?.throwIfAborted();
    report('recognizing', pages, pages, 1);
    return {
      text: texts.join('\n\n'),
      pages,
      confidence: confidences.length
        ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
        : null,
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await terminate();
    await source?.destroy().catch(() => undefined);
  }
}
