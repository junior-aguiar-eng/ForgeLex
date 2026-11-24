/**
 * E4: o texto de cada anexo segue no contexto escrito do pedido, depois de uma linha de cabeçalho. A web monta o
 * cabeçalho e o servidor o reconhece (disparo da análise, agrupamento dos trechos de um PDF longo). Sem imports de Node:
 * o navegador usa este módulo.
 */
export interface AttachmentPartInfo {
  index: number;
  total: number;
  pageFrom?: number;
  pageTo?: number;
  /** Código curto do texto inteiro do PDF: agrupa os trechos de um mesmo documento. */
  documentCode: string;
}
export interface AttachmentHeaderInput {
  name: string;
  ocr: boolean;
  part?: AttachmentPartInfo;
}
export interface AttachmentBlock extends AttachmentHeaderInput {
  /** Caracteres do texto do bloco, sem o cabeçalho. */
  chars: number;
}

const OCR_NOTE = 'texto reconhecido por OCR; pode conter erros de leitura';
const HEADER = /^Anexo "(.+)" \(([^()\n]*)\):$/;
const PART = /parte (\d+) de (\d+)(?:, páginas (\d+) a (\d+))?, documento ([a-f0-9]{8,64})/;

export function buildAttachmentHeader({ name, ocr, part }: AttachmentHeaderInput): string {
  const detail = [ocr ? OCR_NOTE : 'texto extraído'];
  if (part) {
    detail.push(
      `parte ${part.index} de ${part.total}` +
        (part.pageFrom !== undefined && part.pageTo !== undefined
          ? `, páginas ${part.pageFrom} a ${part.pageTo}`
          : '') +
        `, documento ${part.documentCode}`,
    );
  }
  return `Anexo "${name}" (${detail.join('; ')}):`;
}

/** Um item por bloco de anexo do contexto escrito, na ordem em que aparecem. */
export function parseAttachmentBlocks(contextText: string | undefined): AttachmentBlock[] {
  if (!contextText) return [];
  const blocks: AttachmentBlock[] = [];
  let current: (AttachmentHeaderInput & { lines: string[] }) | undefined;
  const close = () => {
    if (!current) return;
    const { lines, ...header } = current;
    blocks.push({ ...header, chars: lines.join('\n').trim().length });
    current = undefined;
  };
  for (const line of contextText.split('\n')) {
    const match = HEADER.exec(line);
    if (match) {
      close();
      const detail = match[2]!;
      const part = PART.exec(detail);
      current = {
        name: match[1]!,
        ocr: detail.includes(OCR_NOTE),
        ...(part
          ? {
              part: {
                index: Number(part[1]),
                total: Number(part[2]),
                ...(part[3] ? { pageFrom: Number(part[3]), pageTo: Number(part[4]) } : {}),
                documentCode: part[5]!,
              },
            }
          : {}),
        lines: [],
      };
    } else current?.lines.push(line);
  }
  close();
  return blocks;
}

/** Há ao menos um anexo com texto no contexto escrito. */
export const hasAttachmentText = (contextText: string | undefined): boolean =>
  parseAttachmentBlocks(contextText).some((block) => block.chars > 0);
