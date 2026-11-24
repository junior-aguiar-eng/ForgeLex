/**
 * E4: um anexo grande é dividido em trechos, cada um analisado como um documento do caso. A divisão é feita aqui, no
 * navegador, porque o texto só existe aqui (DEC-12). Corta nos limites de página que a leitura do PDF já marca
 * ("Página N"); texto sem marcas é cortado em parágrafos.
 */
import {
  buildAttachmentHeader,
  type AttachmentPartInfo,
} from '../../../../packages/domain/src/contracts/attachment-blocks';
import type { Attachment } from './attachments';

/** Tamanho máximo do texto de um trecho (valor inicial; o pedido comercial aceita até 100.000 caracteres). */
export const ATTACHMENT_PART_MAX_CHARS = 40_000;
/** Quantos trechos um envio aceita. */
export const ATTACHMENT_MAX_PARTS = 12;

export interface AttachmentPart {
  index: number;
  total: number;
  pageFrom?: number;
  pageTo?: number;
  text: string;
}

const PAGE_LINE = /^Página (\d+)$/;

/** Um parágrafo maior que o teto é cortado em pedaços do tamanho do teto; os demais ficam como estão. */
function cutAt(block: string, max: number): string[] {
  if (block.length <= max) return [block];
  const pieces: string[] = [];
  for (let at = 0; at < block.length; at += max) pieces.push(block.slice(at, at + max));
  return pieces;
}

/** As páginas do texto do PDF, ou `undefined` quando o texto não traz as marcas em sequência desde a página 1. */
function pagesOf(text: string): { page: number; text: string }[] | undefined {
  const lines = text.split('\n');
  const starts: { line: number; page: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = PAGE_LINE.exec(lines[i]!);
    if (!match) continue;
    const page = Number(match[1]);
    if (page === (starts.at(-1)?.page ?? 0) + 1) starts.push({ line: i, page });
  }
  if (!starts.length || starts[0]!.line !== 0) return undefined;
  return starts.map((start, i) => ({
    page: start.page,
    // A linha em branco que separa as páginas pertence à junção, não à página.
    text: lines
      .slice(start.line, starts[i + 1]?.line ?? lines.length)
      .join('\n')
      .replace(/\n+$/, ''),
  }));
}

/** Divide o texto de um anexo em trechos de até `max` caracteres, só em limites de página (ou de parágrafo, sem marcas). */
export function splitAttachment(
  attachment: Pick<Attachment, 'text'>,
  max = ATTACHMENT_PART_MAX_CHARS,
): AttachmentPart[] {
  const text = attachment.text;
  if (text.length <= max) return [{ index: 1, total: 1, text }];
  const groups: { from?: number; to?: number; text: string }[] = [];
  const pages = pagesOf(text);
  if (pages) {
    for (const page of pages) {
      const current = groups.at(-1);
      if (current && current.text.length + 2 + page.text.length <= max) {
        current.text += `\n\n${page.text}`;
        current.to = page.page;
      } else groups.push({ from: page.page, to: page.page, text: page.text });
    }
  } else {
    const blocks = text.split(/\n{2,}/).flatMap((block) => cutAt(block, max));
    for (const block of blocks) {
      const current = groups.at(-1);
      if (current && current.text.length + 2 + block.length <= max) current.text += `\n\n${block}`;
      else groups.push({ text: block });
    }
  }
  return groups.map((group, i) => ({
    index: i + 1,
    total: groups.length,
    ...(group.from !== undefined ? { pageFrom: group.from, pageTo: group.to } : {}),
    text: group.text,
  }));
}

export interface PartsPlan {
  /** `single`: tudo vai num pedido só, como antes. `split`: cada anexo (ou trecho dele) é um pedido. */
  mode: 'single' | 'split';
  /** Um item por pedido a enviar. */
  parts: { attachment: Attachment; part: AttachmentPart }[];
  total: number;
  /** Mais trechos do que um envio aceita. */
  tooMany: boolean;
}

/**
 * Quantos pedidos os anexos viram. Se todos cabem em um trecho e juntos também, seguem juntos num pedido só. Senão cada
 * anexo vira um documento: o pequeno com um pedido, o grande com um pedido por trecho.
 */
export function partsPlan(attachments: readonly Attachment[]): PartsPlan {
  const ready = attachments.filter((attachment) => attachment.status === 'done' && attachment.text);
  const split = ready.map((attachment) => ({ attachment, parts: splitAttachment(attachment) }));
  const chars = ready.reduce((sum, attachment) => sum + attachment.text.length, 0);
  if (split.every(({ parts }) => parts.length === 1) && chars <= ATTACHMENT_PART_MAX_CHARS)
    return { mode: 'single', parts: [], total: ready.length ? 1 : 0, tooMany: false };
  const parts = split.flatMap(({ attachment, parts: list }) => list.map((part) => ({ attachment, part })));
  return { mode: 'split', parts, total: parts.length, tooMany: parts.length > ATTACHMENT_MAX_PARTS };
}

/** Código curto do texto inteiro de um anexo: agrupa os trechos do mesmo PDF. */
export async function documentCodeOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** O bloco de texto de um trecho para o contexto escrito: o cabeçalho com a parte e as páginas, e o texto. */
export function partContext(
  attachment: Pick<Attachment, 'name' | 'ocr'>,
  part: AttachmentPart,
  documentCode: string,
): string {
  const info: AttachmentPartInfo | undefined =
    part.total > 1
      ? {
          index: part.index,
          total: part.total,
          ...(part.pageFrom !== undefined ? { pageFrom: part.pageFrom, pageTo: part.pageTo } : {}),
          documentCode,
        }
      : undefined;
  return `${buildAttachmentHeader({ name: attachment.name, ocr: Boolean(attachment.ocr), ...(info ? { part: info } : {}) })}\n${part.text}`;
}
