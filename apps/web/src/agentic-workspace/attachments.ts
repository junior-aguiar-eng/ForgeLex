/**
 * Anexos do pedido (U5). Só o texto extraído segue com o pedido (DEC-12): o arquivo não é guardado. O texto passa a
 * fazer parte do contexto escrito, então o cliente o confere antes de enviar e pode abrir, trocar ou remover o anexo.
 */
import { isImageFile, isPdfFile } from '../ocr/ocr-document';

export const ATTACHMENT_ACCEPT = '.pdf,.txt,.md,.docx,.doc,image/*';
export const ATTACHMENT_MAX_FILES = 5;
/**
 * Teto do texto dos anexos juntos: até 12 trechos de 40.000 caracteres (E4). Cada pedido enviado leva um trecho, e o pedido
 * inteiro, com o que o cliente escreveu, cabe nos 100.000 caracteres da execução.
 */
export const ATTACHMENT_MAX_TOTAL_CHARS = 480_000;
export const ATTACHMENT_MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export type AttachmentStatus = 'reading' | 'ocr' | 'done' | 'no-text' | 'unsupported' | 'error' | 'too-large';

export interface Attachment {
  id: string;
  name: string;
  status: AttachmentStatus;
  /** Texto extraído; só existe quando `status` é `done`. */
  text: string;
  /** Mensagem legível para os estados que não são `done` nem `reading`. */
  message?: string;
  pages?: number;
  /** Só em `no-text` de PDF ou imagem, com o OCR ligado: o cliente pode pedir o reconhecimento (U6). */
  canOcr?: boolean;
  /** O texto veio de OCR: pode ter erros, o cliente o confere e pode editá-lo antes de enviar. */
  ocr?: { confidence: number | null; pages: number };
  /** Andamento do OCR em curso (`status` é `ocr`). */
  ocrProgress?: { page: number; pages: number; fraction: number };
}

export type AttachmentResult = Pick<Attachment, 'status' | 'text' | 'message' | 'pages' | 'canOcr'>;

const done = (text: string, pages?: number): AttachmentResult => ({
  status: 'done',
  text,
  ...(pages ? { pages } : {}),
});

type TextReader = (file: File, signal?: AbortSignal) => Promise<{ content: string; pageCount?: number }>;

async function loadPdfReader(): Promise<TextReader> {
  const { extractPdfText } = await import('../documents/pdf-text');
  return extractPdfText;
}

async function loadDocxReader(): Promise<TextReader> {
  const { extractDocxText } = await import('../documents/docx-text');
  return extractDocxText;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Lê um arquivo e devolve o texto, ou o estado que explica por que não há texto. Nunca lança por arquivo ruim. */
export async function readAttachment(
  file: File,
  signal?: AbortSignal,
  pdfReader?: (file: File, signal?: AbortSignal) => Promise<{ content: string; pageCount: number }>,
  docxReader?: TextReader,
): Promise<AttachmentResult> {
  const name = file.name.toLowerCase();
  try {
    if (file.size === 0) return { status: 'error', text: '', message: 'O arquivo está vazio.' };
    if (/\.pdf$/.test(name) || file.type === 'application/pdf') {
      if (file.size > 15 * 1024 * 1024) {
        return { status: 'too-large', text: '', message: 'O PDF passa de 15 MB. Divida o arquivo e anexe as partes.' };
      }
      const read = pdfReader ?? (await loadPdfReader());
      const result = await read(file, signal);
      const text = result.content.trim();
      return text ? done(text, result.pageCount) : { status: 'no-text', text: '', message: noTextMessage };
    }
    if (/\.(txt|md)$/.test(name) || file.type === 'text/plain' || file.type === 'text/markdown') {
      if (file.size > ATTACHMENT_MAX_TEXT_FILE_BYTES) {
        return { status: 'too-large', text: '', message: 'O arquivo de texto passa de 2 MB. Anexe um trecho menor.' };
      }
      const text = (await file.text()).replace(/\r\n?/g, '\n').trim();
      return text ? done(text) : { status: 'no-text', text: '', message: noTextMessage };
    }
    if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|tiff?)$/.test(name)) {
      return {
        status: 'no-text',
        text: '',
        message:
          'Imagens não têm texto extraível ainda: a leitura de imagens (OCR) chega depois. Cole o texto no pedido.',
      };
    }
    if (/\.docx$/.test(name) || file.type === DOCX_MIME) {
      if (file.size > 15 * 1024 * 1024) {
        return {
          status: 'too-large',
          text: '',
          message: 'O arquivo Word passa de 15 MB. Divida o documento e anexe as partes.',
        };
      }
      const read = docxReader ?? (await loadDocxReader());
      const text = (await read(file, signal)).content.trim();
      return text ? done(text) : { status: 'no-text', text: '', message: noWordTextMessage };
    }
    if (/\.doc$/.test(name) || file.type === 'application/msword') {
      return {
        status: 'unsupported',
        text: '',
        message: 'O formato Word antigo (.doc) não é lido. Salve o arquivo como .docx ou PDF e anexe de novo.',
      };
    }
    return {
      status: 'unsupported',
      text: '',
      message: 'Este tipo de arquivo não é aceito. Use PDF, Word (.docx), TXT ou MD.',
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    // PDF só de imagem (digitalização): não é falha de leitura, é um arquivo sem texto selecionável.
    if ((error as { code?: unknown } | null)?.code === 'PDF_NO_TEXT') {
      return { status: 'no-text', text: '', message: noTextMessage };
    }
    return {
      status: 'error',
      text: '',
      message: error instanceof Error && error.message ? error.message : 'Não foi possível ler o arquivo.',
    };
  }
}

const noTextMessage = 'Não encontramos texto neste arquivo. Se for uma digitalização, a leitura por OCR chega depois.';
const noWordTextMessage =
  'Não encontramos texto neste documento Word. Se ele só tem imagens, anexe como PDF ou cole o texto no pedido.';

export const attachmentStatusLabel: Record<AttachmentStatus, string> = {
  reading: 'Lendo…',
  ocr: 'Reconhecendo texto…',
  done: 'Texto extraído',
  'no-text': 'Sem texto extraível',
  unsupported: 'Formato não aceito',
  error: 'Erro na leitura',
  'too-large': 'Arquivo grande demais',
};

/** Caracteres de texto que os anexos já usam. */
export function attachmentChars(attachments: readonly Attachment[]): number {
  return attachments.reduce((sum, attachment) => sum + (attachment.status === 'done' ? attachment.text.length : 0), 0);
}

/**
 * Aplica o teto do conjunto a um anexo recém-lido: o que passaria do limite vira "grande demais" e não entra no pedido.
 * `others` são os demais anexos (sem o que está sendo lido ou trocado).
 */
export function fitAttachment(result: AttachmentResult, others: readonly Attachment[]): AttachmentResult {
  if (result.status !== 'done') return result;
  const room = ATTACHMENT_MAX_TOTAL_CHARS - attachmentChars(others);
  if (result.text.length <= room) return result;
  return {
    status: 'too-large',
    text: '',
    message:
      room > 0
        ? `O texto deste arquivo (${result.text.length.toLocaleString('pt-BR')} caracteres) não cabe no pedido junto com os outros anexos. Anexe um trecho menor.`
        : 'Os anexos já ocupam todo o espaço do pedido. Remova algum antes de anexar outro.',
  };
}

/** Bloco de texto dos anexos lidos, na ordem em que foram anexados, para somar ao contexto escrito do pedido. */
export function attachmentContext(attachments: readonly Attachment[]): string {
  const ready = attachments.filter((attachment) => attachment.status === 'done' && attachment.text);
  if (!ready.length) return '';
  return ready
    .map(
      (attachment) =>
        `Anexo "${attachment.name}" (${attachment.ocr ? 'texto reconhecido por OCR; pode conter erros de leitura' : 'texto extraído'}):\n${attachment.text}`,
    )
    .join('\n\n');
}

export const hasReadingAttachment = (attachments: readonly Attachment[]) =>
  attachments.some((attachment) => attachment.status === 'reading' || attachment.status === 'ocr');

const ocrOfferMessage =
  'Não encontramos texto neste arquivo. Se for uma digitalização, use "Reconhecer texto (OCR)": a leitura é feita no seu navegador e o arquivo não sai dele.';

/**
 * Com o OCR ligado, um PDF ou imagem sem texto passa a oferecer o reconhecimento. Qualquer outro resultado, ou o OCR
 * desligado, segue como veio.
 */
export function withOcrOffer(result: AttachmentResult, file: File, enabled: boolean): AttachmentResult {
  if (!enabled || result.status !== 'no-text' || !(isPdfFile(file) || isImageFile(file))) return result;
  return { ...result, message: ocrOfferMessage, canOcr: true };
}

/** Caracteres que o texto de um anexo ainda pode ter: o teto do conjunto menos o que os outros anexos já usam. */
export function attachmentRoom(attachments: readonly Attachment[], id: string): number {
  return ATTACHMENT_MAX_TOTAL_CHARS - attachmentChars(attachments.filter((attachment) => attachment.id !== id));
}

/** Limites da API para título e nome do arquivo de um documento do caso. */
const DOCUMENT_TITLE_MAX = 500;
const DOCUMENT_FILENAME_MAX = 255;

/** Documento do caso feito a partir de um anexo: só o texto extraído, como no pedido (DEC-12). */
export interface CaseDocumentInput {
  title: string;
  originalFilename: string;
  mimeType: string;
  content: string;
}

/**
 * O que a rota de ingestão recebe quando o cliente salva o anexo no caso. O título é o nome do arquivo sem a extensão e,
 * quando o texto veio de OCR, diz isso, porque o documento ganha âncoras citáveis e pode ter erros de leitura. O nome do
 * arquivo segue a convenção da importação de PDF da tela "Casos" (`<arquivo>.txt`). Anexo que não está pronto ou sem texto
 * não gera documento.
 */
export function attachmentDocumentInput(attachment: Attachment): CaseDocumentInput | undefined {
  if (attachment.status !== 'done' || !attachment.text.trim()) return undefined;
  const name = attachment.name.trim();
  const base = name.replace(/\.[^./\\]{1,5}$/, '').trim() || name || 'Anexo';
  const suffix = attachment.ocr ? ' (texto reconhecido por OCR)' : '';
  const filename = /\.(txt|md)$/i.test(name) ? name : `${name || 'anexo'}.txt`;
  return {
    title: `${base.slice(0, DOCUMENT_TITLE_MAX - suffix.length)}${suffix}`,
    originalFilename: filename.slice(0, DOCUMENT_FILENAME_MAX),
    mimeType: 'text/plain',
    content: attachment.text,
  };
}

/** Texto para o cliente quando a API recusa o documento, pelo código estável; sem código conhecido, a mensagem da API. */
export function saveFailureMessage(code: string, fallback: string): string {
  switch (code) {
    case 'DOCUMENT_TEXT_TOO_LARGE':
      return 'O texto passa de 1 MiB e não cabe num documento do caso. Divida o arquivo e salve as partes.';
    case 'DOCUMENT_ANCHOR_LIMIT_EXCEEDED':
      return 'O texto tem mais de 5.000 linhas com conteúdo e não cabe num documento do caso. Divida o arquivo ou junte linhas curtas.';
    case 'MATTER_NOT_FOUND':
      return 'O caso não está mais disponível. Escolha outro caso.';
    default:
      return fallback || 'Não foi possível salvar o anexo no caso.';
  }
}
