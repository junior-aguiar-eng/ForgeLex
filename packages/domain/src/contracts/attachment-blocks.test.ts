import { describe, expect, it } from 'vitest';
import { buildAttachmentHeader, hasAttachmentText, parseAttachmentBlocks } from './attachment-blocks.js';

describe('cabeçalho do anexo (E4)', () => {
  it('ida e volta sem parte, com OCR e com nome que tem aspas', () => {
    const text = [
      buildAttachmentHeader({ name: 'contrato.pdf', ocr: false }),
      'Cláusula primeira.',
      '',
      buildAttachmentHeader({ name: 'foto "2".pdf', ocr: true }),
      'Texto reconhecido.',
    ].join('\n');
    expect(parseAttachmentBlocks(text)).toEqual([
      { name: 'contrato.pdf', ocr: false, chars: 'Cláusula primeira.'.length },
      { name: 'foto "2".pdf', ocr: true, chars: 'Texto reconhecido.'.length },
    ]);
  });

  it('ida e volta com parte, páginas e código do documento', () => {
    const header = buildAttachmentHeader({
      name: 'processo.pdf',
      ocr: false,
      part: { index: 2, total: 5, pageFrom: 21, pageTo: 40, documentCode: 'a1b2c3d4e5f6' },
    });
    expect(header).toBe(
      'Anexo "processo.pdf" (texto extraído; parte 2 de 5, páginas 21 a 40, documento a1b2c3d4e5f6):',
    );
    expect(parseAttachmentBlocks(`${header}\nPágina 21\nTexto.`)).toEqual([
      {
        name: 'processo.pdf',
        ocr: false,
        part: { index: 2, total: 5, pageFrom: 21, pageTo: 40, documentCode: 'a1b2c3d4e5f6' },
        chars: 'Página 21\nTexto.'.length,
      },
    ]);
  });

  it('parte sem páginas (texto sem marcas) volta sem pageFrom e pageTo', () => {
    const header = buildAttachmentHeader({
      name: 'nota.txt',
      ocr: false,
      part: { index: 1, total: 2, documentCode: 'a1b2c3d4e5f6' },
    });
    const [block] = parseAttachmentBlocks(`${header}\nconteúdo`);
    expect(block?.part).toEqual({ index: 1, total: 2, documentCode: 'a1b2c3d4e5f6' });
  });

  it('texto sem bloco, ou bloco vazio, não conta como anexo com texto', () => {
    expect(parseAttachmentBlocks('Relato do cliente.')).toEqual([]);
    expect(parseAttachmentBlocks(undefined)).toEqual([]);
    expect(hasAttachmentText('Relato do cliente.')).toBe(false);
    expect(hasAttachmentText(`${buildAttachmentHeader({ name: 'a.pdf', ocr: false })}\n  \n`)).toBe(false);
    expect(hasAttachmentText(`${buildAttachmentHeader({ name: 'a.pdf', ocr: false })}\nTexto.`)).toBe(true);
  });
});
