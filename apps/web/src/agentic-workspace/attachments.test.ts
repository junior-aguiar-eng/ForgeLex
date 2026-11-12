import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_MAX_TOTAL_CHARS,
  attachmentChars,
  attachmentContext,
  fitAttachment,
  hasReadingAttachment,
  readAttachment,
  type Attachment,
} from './attachments';

const file = (name: string, content: string | Uint8Array, type = '') => new File([content as BlobPart], name, { type });
const attachment = (id: string, patch: Partial<Attachment> = {}): Attachment => ({
  id,
  name: `${id}.txt`,
  status: 'done',
  text: `texto ${id}`,
  ...patch,
});

describe('leitura de anexos (U5)', () => {
  it('lê texto simples, normaliza quebras de linha e devolve o conteúdo conferível', async () => {
    const result = await readAttachment(file('relato.txt', 'Linha 1\r\nLinha 2\r\n', 'text/plain'));
    expect(result).toEqual({ status: 'done', text: 'Linha 1\nLinha 2' });
  });

  it('PDF usa o leitor existente e informa as páginas; PDF sem texto vira "sem texto extraível"', async () => {
    const ok = await readAttachment(file('peticao.pdf', 'x', 'application/pdf'), undefined, async () => ({
      content: 'Página 1\nTexto',
      pageCount: 3,
    }));
    expect(ok).toEqual({ status: 'done', text: 'Página 1\nTexto', pages: 3 });
    const empty = await readAttachment(file('scan.pdf', 'x'), undefined, async () => ({ content: '  ', pageCount: 1 }));
    expect(empty.status).toBe('no-text');
    expect(empty.message).toMatch(/OCR/);
  });

  it('erros do leitor viram estado de erro com a mensagem, sem derrubar o pedido', async () => {
    const result = await readAttachment(file('protegido.pdf', 'x'), undefined, async () => {
      throw new Error('Este PDF está protegido por senha.');
    });
    expect(result).toEqual({ status: 'error', text: '', message: 'Este PDF está protegido por senha.' });
  });

  it('propaga o cancelamento em vez de tratá-lo como erro do arquivo', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      readAttachment(file('a.pdf', 'x'), controller.signal, async () => {
        throw new Error('abortado');
      }),
    ).rejects.toThrow('abortado');
  });

  it('arquivo vazio, imagem, Word e formato desconhecido têm estados próprios e mensagens legíveis', async () => {
    expect((await readAttachment(file('vazio.txt', ''))).status).toBe('error');
    const image = await readAttachment(file('foto.png', 'x', 'image/png'));
    expect(image.status).toBe('no-text');
    expect(image.message).toMatch(/OCR/);
    expect((await readAttachment(file('minuta.docx', 'x'))).status).toBe('unsupported');
    expect((await readAttachment(file('planilha.xlsx', 'x'))).status).toBe('unsupported');
  });

  it('arquivo grande demais é recusado antes de ler', async () => {
    const big = file('grande.txt', new Uint8Array(2 * 1024 * 1024 + 1), 'text/plain');
    expect((await readAttachment(big)).status).toBe('too-large');
    const pdf = file('grande.pdf', new Uint8Array(15 * 1024 * 1024 + 1), 'application/pdf');
    const result = await readAttachment(pdf, undefined, async () => {
      throw new Error('não deveria ler');
    });
    expect(result.status).toBe('too-large');
  });
});

describe('conjunto de anexos', () => {
  it('soma só o texto dos anexos lidos e monta o contexto na ordem anexada', () => {
    const list = [
      attachment('a'),
      attachment('b', { status: 'error', text: '', message: 'x' }),
      attachment('c', { text: 'segundo texto' }),
    ];
    expect(attachmentChars(list)).toBe('texto a'.length + 'segundo texto'.length);
    expect(attachmentContext(list)).toBe(
      'Anexo "a.txt" (texto extraído):\ntexto a\n\nAnexo "c.txt" (texto extraído):\nsegundo texto',
    );
    expect(attachmentContext([attachment('b', { status: 'no-text', text: '' })])).toBe('');
  });

  it('aplica o teto do conjunto: o que não cabe vira "grande demais" e não entra no pedido', () => {
    const others = [attachment('a', { text: 'x'.repeat(ATTACHMENT_MAX_TOTAL_CHARS - 10) })];
    expect(fitAttachment({ status: 'done', text: 'y'.repeat(10) }, others).status).toBe('done');
    const over = fitAttachment({ status: 'done', text: 'y'.repeat(11) }, others);
    expect(over.status).toBe('too-large');
    expect(over.text).toBe('');
    const full = fitAttachment({ status: 'done', text: 'z' }, [
      attachment('a', { text: 'x'.repeat(ATTACHMENT_MAX_TOTAL_CHARS) }),
    ]);
    expect(full.message).toMatch(/Remova algum/);
    expect(fitAttachment({ status: 'error', text: '', message: 'm' }, others).status).toBe('error');
  });

  it('sabe quando algum anexo ainda está sendo lido', () => {
    expect(hasReadingAttachment([attachment('a'), attachment('b', { status: 'reading', text: '' })])).toBe(true);
    expect(hasReadingAttachment([attachment('a')])).toBe(false);
  });
});
