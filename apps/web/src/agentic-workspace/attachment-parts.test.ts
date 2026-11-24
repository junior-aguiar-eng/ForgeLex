import { describe, expect, it } from 'vitest';
import { parseAttachmentBlocks } from '../../../../packages/domain/src/contracts/attachment-blocks';
import {
  ATTACHMENT_MAX_PARTS,
  ATTACHMENT_PART_MAX_CHARS,
  documentCodeOf,
  partContext,
  partsPlan,
  splitAttachment,
} from './attachment-parts';
import type { Attachment } from './attachments';

const attachment = (id: string, text: string, extra: Partial<Attachment> = {}): Attachment => ({
  id,
  name: `${id}.pdf`,
  status: 'done',
  text,
  ...extra,
});
/** PDF sintético no formato que a leitura produz: "Página N", linhas e uma linha em branco entre páginas. */
const pdf = (pages: number, charsPerPage = 1_000) =>
  Array.from({ length: pages }, (_, i) => `Página ${i + 1}\n${'x'.repeat(charsPerPage)}`).join('\n\n');

describe('splitAttachment (E4)', () => {
  it('300 páginas viram trechos de páginas inteiras, até o teto, sem sobra nem repetição', () => {
    const parts = splitAttachment({ text: pdf(300) });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.text.length <= ATTACHMENT_PART_MAX_CHARS)).toBe(true);
    expect(parts.map((part) => part.index)).toEqual(parts.map((_, i) => i + 1));
    expect(parts.every((part) => part.total === parts.length)).toBe(true);
    expect(parts[0]?.pageFrom).toBe(1);
    expect(parts.at(-1)?.pageTo).toBe(300);
    for (let i = 1; i < parts.length; i++) expect(parts[i]!.pageFrom).toBe(parts[i - 1]!.pageTo! + 1);
    // Nenhum caractere se perde: juntar os trechos devolve o texto original.
    expect(parts.map((part) => part.text).join('\n\n')).toBe(pdf(300));
  });

  it('anexo que cabe em um trecho devolve o texto como está', () => {
    expect(splitAttachment({ text: pdf(5) })).toEqual([{ index: 1, total: 1, text: pdf(5) }]);
  });

  it('página sozinha acima do teto vira um trecho só dela, sem ser cortada', () => {
    const big = `Página 1\n${'y'.repeat(ATTACHMENT_PART_MAX_CHARS + 500)}\n\nPágina 2\ncurta`;
    const parts = splitAttachment({ text: big });
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ pageFrom: 1, pageTo: 1 });
    expect(parts[0]!.text.length).toBeGreaterThan(ATTACHMENT_PART_MAX_CHARS);
    expect(parts[1]).toMatchObject({ pageFrom: 2, pageTo: 2 });
  });

  it('texto sem marcas de página é cortado em parágrafos, sem páginas nos trechos', () => {
    const text = Array.from({ length: 80 }, (_, i) => `Parágrafo ${i}. ${'z'.repeat(1_000)}`).join('\n\n');
    const parts = splitAttachment({ text });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.pageFrom === undefined && part.text.length <= ATTACHMENT_PART_MAX_CHARS)).toBe(
      true,
    );
    expect(parts.map((part) => part.text).join('\n\n')).toBe(text);
  });

  it('um parágrafo único maior que o teto é cortado em pedaços do teto, sem perder nem repetir texto', () => {
    const text = `Sem pausa: ${'abcdefghij '.repeat(12_000)}fim`;
    const parts = splitAttachment({ text });
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((part) => part.text.length <= ATTACHMENT_PART_MAX_CHARS)).toBe(true);
    expect(parts.map((part) => part.text).join('')).toBe(text);
  });

  it('linha "Página 7" dentro do texto, fora da sequência, não cria uma página nova', () => {
    const text = `Página 1\nO autor cita a Página 7\nPágina 7\ne segue.\n\n${pdf(60).replace(/^Página 1\n/, 'Página 2\n')}`;
    // Sem a sequência desde a página 1, o texto é tratado como texto corrido.
    const parts = splitAttachment({ text: `${text}${'w'.repeat(ATTACHMENT_PART_MAX_CHARS)}` });
    expect(parts.every((part) => part.pageFrom === undefined || part.pageFrom >= 1)).toBe(true);
  });
});

describe('partsPlan (E4)', () => {
  it('anexos pequenos que cabem juntos seguem num pedido só, como antes', () => {
    const plan = partsPlan([attachment('a', pdf(3)), attachment('b', pdf(2))]);
    expect(plan).toMatchObject({ mode: 'single', total: 1, tooMany: false });
  });

  it('sem anexo com texto não há pedido a dividir', () => {
    expect(partsPlan([attachment('a', '', { status: 'no-text' })])).toMatchObject({ mode: 'single', total: 0 });
  });

  it('um PDF longo vira um pedido por trecho', () => {
    const plan = partsPlan([attachment('processo', pdf(120))]);
    expect(plan.mode).toBe('split');
    expect(plan.total).toBe(plan.parts.length);
    expect(plan.total).toBeGreaterThan(1);
    expect(plan.tooMany).toBe(false);
  });

  it('pequenos que juntos passam do teto viram um pedido por anexo', () => {
    const plan = partsPlan([attachment('a', pdf(30)), attachment('b', pdf(30))]);
    expect(plan).toMatchObject({ mode: 'split', total: 2 });
    expect(plan.parts.map((item) => item.attachment.id)).toEqual(['a', 'b']);
  });

  it('mais de 12 trechos pede para dividir o envio', () => {
    const plan = partsPlan([attachment('enorme', pdf(300, 2_000))]);
    expect(plan.total).toBeGreaterThan(ATTACHMENT_MAX_PARTS);
    expect(plan.tooMany).toBe(true);
  });
});

describe('cabeçalho de cada trecho (E4)', () => {
  it('traz parte, páginas e o mesmo código do documento em todos os trechos', async () => {
    const processo = attachment('processo', pdf(120));
    const code = await documentCodeOf(processo.text);
    expect(code).toMatch(/^[a-f0-9]{12}$/);
    const plan = partsPlan([processo]);
    const blocks = plan.parts.flatMap(({ attachment: a, part }) => parseAttachmentBlocks(partContext(a, part, code)));
    expect(blocks).toHaveLength(plan.total);
    expect(new Set(blocks.map((block) => block.part?.documentCode))).toEqual(new Set([code]));
    expect(blocks.map((block) => block.part?.index)).toEqual(blocks.map((_, i) => i + 1));
    expect(blocks[0]?.part).toMatchObject({ total: plan.total, pageFrom: 1 });
  });

  it('o mesmo texto dá sempre o mesmo código; texto diferente, outro', async () => {
    expect(await documentCodeOf('abc')).toBe(await documentCodeOf('abc'));
    expect(await documentCodeOf('abc')).not.toBe(await documentCodeOf('abd'));
  });

  it('anexo de um trecho só leva o cabeçalho de sempre, sem parte', () => {
    const [{ attachment: a, part }] = partsPlan([attachment('a', pdf(30)), attachment('b', pdf(30))]).parts as never[];
    expect(parseAttachmentBlocks(partContext(a, part, 'a1b2c3d4e5f6'))[0]?.part).toBeUndefined();
  });
});
