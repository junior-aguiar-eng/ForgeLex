import JSZip from 'jszip';

/**
 * Leitura de Word (.docx) no navegador, só o texto (DEC-12). O arquivo é um pacote zip: lê-se `word/document.xml` e as
 * notas de rodapé e de fim, e tira-se o texto das marcas `w:t`. O XML não é interpretado como documento: só as marcas
 * conhecidas são lidas, então entidades declaradas no próprio arquivo nunca são expandidas. Cada parte descompactada
 * tem teto de tamanho, contado enquanto a descompactação corre, para um pacote pequeno que expande enormemente (zip
 * bomb) não encher a memória da aba.
 */

export const DOCX_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const DOCX_MAX_XML_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

export interface DocxTextResult {
  content: string;
  filename: string;
  noteCount: number;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Só as cinco entidades do XML e as referências numéricas; qualquer outra fica como está. */
function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (whole, name: string) => {
    if (name in ENTITIES) return ENTITIES[name]!;
    const code = name.startsWith('#x') ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

const TOKEN =
  /<(\/?)w:(p|tr|tc)(?=[\s/>])[^>]*?(\/?)>|<w:(tab|br|cr|noBreakHyphen)(?=[\s/>])[^>]*>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

/** Texto de uma parte do Word (corpo, nota de rodapé ou de fim). Função pura. */
export function docxXmlToText(xml: string): string {
  // Caixas de texto vêm duas vezes (Choice e Fallback); fica só a primeira.
  const source = xml.replace(/<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g, '');
  const buffers = [''];
  const rows: string[][] = [];
  const append = (text: string) => {
    buffers[buffers.length - 1] += text;
  };
  for (const match of source.matchAll(TOKEN)) {
    const [, closing, element, selfClosing, inline, text] = match;
    if (element === 'p') {
      if (closing || selfClosing) append('\n');
    } else if (element === 'tc') {
      if (!closing) buffers.push('');
      else if (buffers.length > 1) {
        const cell = buffers.pop()!.replace(/\s+/g, ' ').trim();
        rows[rows.length - 1]?.push(cell);
      }
    } else if (element === 'tr') {
      if (!closing) rows.push([]);
      else if (rows.length > 0) append(`${rows.pop()!.join('\t')}\n`);
    } else if (inline === 'tab') append('\t');
    else if (inline === 'br' || inline === 'cr') append('\n');
    else if (inline === 'noBreakHyphen') append('-');
    else if (text !== undefined) append(decodeEntities(text));
  }
  return buffers[0]!
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SEPARATOR_NOTE = /w:type="(?:separator|continuationSeparator|continuationNotice)"/;

/** As notas de verdade de `footnotes.xml` ou `endnotes.xml`, sem os separadores que o Word grava. */
export function docxNotesToText(xml: string, kind: 'footnote' | 'endnote'): string[] {
  const notes: string[] = [];
  const pattern = new RegExp(`<w:${kind}\\b([^>]*)>([\\s\\S]*?)</w:${kind}>`, 'g');
  for (const [, attributes, inner] of xml.matchAll(pattern)) {
    if (SEPARATOR_NOTE.test(attributes!)) continue;
    const text = docxXmlToText(inner!).replace(/\s+/g, ' ').trim();
    if (text) notes.push(text);
  }
  return notes;
}

interface PartStream {
  on(event: 'data', listener: (chunk: Uint8Array) => void): PartStream;
  on(event: 'error', listener: (error: Error) => void): PartStream;
  on(event: 'end', listener: () => void): PartStream;
  pause(): PartStream;
  resume(): PartStream;
}

const TOO_BIG = 'O Word descompacta para além do limite e não foi lido: o arquivo é grande demais ou está malformado.';

/** Lê uma parte do pacote em fluxo e para ao passar do teto, sem acumular o resto. `null` se a parte não existe. */
function readPart(zip: JSZip, path: string, maxBytes: number, signal?: AbortSignal): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return Promise.resolve(null);
  const stream = (entry as unknown as { internalStream(type: 'uint8array'): PartStream }).internalStream('uint8array');
  return new Promise<string>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;
    const onAbort = () => stop(signal?.reason ?? new DOMException('Leitura cancelada.', 'AbortError'));
    const stop = (error: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      stream.pause();
      reject(error);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    stream
      .on('data', (chunk) => {
        if (settled) return;
        total += chunk.length;
        if (total > maxBytes) return stop(new Error(TOO_BIG));
        chunks.push(chunk);
      })
      .on('error', (error) => stop(error))
      .on('end', () => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(new TextDecoder('utf-8').decode(bytes));
      })
      .resume();
  });
}

export async function extractDocxText(
  file: File,
  signal?: AbortSignal,
  limits: { maxXmlBytes?: number } = {},
): Promise<DocxTextResult> {
  const maxXmlBytes = limits.maxXmlBytes ?? DOCX_MAX_XML_BYTES;
  if (!/\.docx$/i.test(file.name)) throw new Error('Selecione um arquivo Word (.docx) válido.');
  if (file.size === 0) throw new Error('O arquivo está vazio.');
  if (file.size > DOCX_MAX_FILE_BYTES)
    throw new Error('O arquivo Word excede o limite de 15 MB. Divida o documento antes de anexar.');
  signal?.throwIfAborted();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(
      'Não foi possível abrir o arquivo Word. Ele pode estar protegido por senha, corrompido ou ser um .doc antigo: salve como .docx ou PDF.',
    );
  }
  signal?.throwIfAborted();
  if (Object.keys(zip.files).length > MAX_ENTRIES) {
    throw new Error('O arquivo Word tem partes demais e parece corrompido.');
  }
  const body = await readPart(zip, 'word/document.xml', maxXmlBytes, signal);
  if (body === null) {
    throw new Error('Não encontrei o corpo do documento (word/document.xml): o arquivo não parece um .docx do Word.');
  }
  const footnotes = docxNotesToText((await readPart(zip, 'word/footnotes.xml', maxXmlBytes, signal)) ?? '', 'footnote');
  const endnotes = docxNotesToText((await readPart(zip, 'word/endnotes.xml', maxXmlBytes, signal)) ?? '', 'endnote');
  const numbered = (notes: string[]) => notes.map((note, index) => `[${index + 1}] ${note}`).join('\n');
  const sections = [
    docxXmlToText(body),
    footnotes.length ? `Notas de rodapé:\n${numbered(footnotes)}` : '',
    endnotes.length ? `Notas de fim:\n${numbered(endnotes)}` : '',
  ].filter(Boolean);
  return { content: sections.join('\n\n'), filename: file.name, noteCount: footnotes.length + endnotes.length };
}
