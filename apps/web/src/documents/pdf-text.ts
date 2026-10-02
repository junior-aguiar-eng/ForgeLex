import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfTextResult {
  content: string;
  filename: string;
  pageCount: number;
  emptyPages: number[];
}

export async function extractPdfText(file: File, signal?: AbortSignal): Promise<PdfTextResult> {
  if (!/\.pdf$/i.test(file.name) || file.size === 0) throw new Error('Selecione um arquivo PDF válido.');
  if (file.size > 15 * 1024 * 1024) throw new Error('O PDF excede o limite de 15 MB. Divida o arquivo antes de importar.');
  signal?.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  signal?.throwIfAborted();
  const task = getDocument({ data, stopAtErrors: true, useSystemFonts: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const abort = () => { void task.destroy().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const extraction = (async () => {
      const pdf = await task.promise;
      if (pdf.numPages > 300) throw new Error('O PDF excede 300 páginas. Importe uma parte menor.');
      const pages: string[] = [];
      const emptyPages: number[] = [];
      let textBytes = 0;
      for (let number = 1; number <= pdf.numPages; number++) {
        signal?.throwIfAborted();
        const page = await pdf.getPage(number);
        try {
          const text = await page.getTextContent();
          const lines: string[] = [];
          let line = '';
          let lastY: number | undefined;
          for (const item of text.items) {
            if (!('str' in item)) continue;
            const token = item;
            const y = token.transform[5];
            if (lastY !== undefined && Math.abs(y - lastY) > 3 && line.trim()) {
              lines.push(line.trim());
              line = '';
            }
            if (token.str) line += `${line && !/\s$/.test(line) ? ' ' : ''}${token.str}`;
            lastY = y;
            if (token.hasEOL) { if (line.trim()) lines.push(line.trim()); line = ''; lastY = undefined; }
          }
          if (line.trim()) lines.push(line.trim());
          const body = lines.join('\n');
          if (!body.trim()) emptyPages.push(number);
          const pageText = `Página ${number}\n${body || '[Sem texto extraível nesta página]'}`;
          textBytes += new TextEncoder().encode(pageText).byteLength + 2;
          if (textBytes > 500_000) throw new Error('O texto extraído é muito grande. Importe uma parte menor do PDF.');
          pages.push(pageText);
        } finally { page.cleanup(); }
      }
      if (emptyPages.length === pdf.numPages) throw new Error('Este PDF não possui texto extraível. Use um PDF com texto selecionável ou faça OCR antes da importação.');
      signal?.throwIfAborted();
      return { content: pages.join('\n\n'), filename: `${file.name}.txt`, pageCount: pdf.numPages, emptyPages };
    })();
    return await Promise.race([
      extraction,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          abort();
          reject(new Error('A extração demorou demais. Tente importar uma parte menor do PDF.'));
        }, 30_000);
      }),
    ]);
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('Este PDF está protegido por senha. Exporte uma cópia sem proteção antes de importar.', { cause: error });
    if (error instanceof Error && ['InvalidPDFException', 'UnknownErrorException', 'FormatError'].includes(error.name)) throw new Error('Não foi possível ler este PDF. Confira se o arquivo está íntegro.', { cause: error });
    if (timedOut) throw new Error('A extração demorou demais. Tente importar uma parte menor do PDF.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    await task.destroy().catch(() => undefined);
  }
}
