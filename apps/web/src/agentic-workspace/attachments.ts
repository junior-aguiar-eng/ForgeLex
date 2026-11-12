/**
 * Anexos do pedido (U5). Só o texto extraído segue com o pedido (DEC-12): o arquivo não é guardado. O texto passa a
 * fazer parte do contexto escrito, então o cliente o confere antes de enviar e pode abrir, trocar ou remover o anexo.
 */
export const ATTACHMENT_ACCEPT = '.pdf,.txt,.md,.docx,image/*';
export const ATTACHMENT_MAX_FILES = 5;
/** Teto do texto dos anexos juntos; o pedido inteiro, com o que o cliente escreveu, cabe nos 100.000 caracteres da execução. */
export const ATTACHMENT_MAX_TOTAL_CHARS = 80_000;
export const ATTACHMENT_MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;

export type AttachmentStatus = 'reading' | 'done' | 'no-text' | 'unsupported' | 'error' | 'too-large';

export interface Attachment {
  id: string;
  name: string;
  status: AttachmentStatus;
  /** Texto extraído; só existe quando `status` é `done`. */
  text: string;
  /** Mensagem legível para os estados que não são `done` nem `reading`. */
  message?: string;
  pages?: number;
}

export type AttachmentResult = Pick<Attachment, 'status' | 'text' | 'message' | 'pages'>;

const done = (text: string, pages?: number): AttachmentResult => ({
  status: 'done',
  text,
  ...(pages ? { pages } : {}),
});

async function loadPdfReader() {
  const { extractPdfText } = await import('../documents/pdf-text');
  return extractPdfText;
}

/** Lê um arquivo e devolve o texto, ou o estado que explica por que não há texto. Nunca lança por arquivo ruim. */
export async function readAttachment(
  file: File,
  signal?: AbortSignal,
  pdfReader?: (file: File, signal?: AbortSignal) => Promise<{ content: string; pageCount: number }>,
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
    if (/\.docx$/.test(name)) {
      return {
        status: 'unsupported',
        text: '',
        message: 'Arquivos Word ainda não são lidos aqui. Exporte para PDF ou cole o texto no pedido.',
      };
    }
    return { status: 'unsupported', text: '', message: 'Este tipo de arquivo não é aceito. Use PDF, TXT ou MD.' };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      status: 'error',
      text: '',
      message: error instanceof Error && error.message ? error.message : 'Não foi possível ler o arquivo.',
    };
  }
}

const noTextMessage = 'Não encontramos texto neste arquivo. Se for uma digitalização, a leitura por OCR chega depois.';

export const attachmentStatusLabel: Record<AttachmentStatus, string> = {
  reading: 'Lendo…',
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
  return ready.map((attachment) => `Anexo "${attachment.name}" (texto extraído):\n${attachment.text}`).join('\n\n');
}

export const hasReadingAttachment = (attachments: readonly Attachment[]) =>
  attachments.some((attachment) => attachment.status === 'reading');
