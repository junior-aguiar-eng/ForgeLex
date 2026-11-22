import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDraftDocx } from './draft-docx';
import { docxNotesToText, docxXmlToText, extractDocxText } from './docx-text';

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';
const wrap = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document ${NS}><w:body>${body}</w:body></w:document>`;
const para = (...runs: string[]) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr>${runs.join('')}</w:p>`;
const run = (text: string) => `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;

async function docx(parts: Record<string, string>, name = 'peca.docx'): Promise<File> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  for (const [path, content] of Object.entries(parts)) zip.file(path, content);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new File([bytes as BlobPart], name);
}

describe('docxXmlToText', () => {
  it('junta as partes de um parágrafo, separa parágrafos por linha e respeita tabulação e quebra de linha', () => {
    const xml = wrap(
      para(run('Excelentíssimo '), run('Senhor Juiz')) +
        para(run('Linha A'), '<w:r><w:br/></w:r>', run('Linha B'), '<w:r><w:tab/></w:r>', run('Fim')),
    );
    expect(docxXmlToText(xml)).toBe('Excelentíssimo Senhor Juiz\nLinha A\nLinha B\tFim');
  });

  it('decodifica as entidades do XML e as referências numéricas, e nada além delas', () => {
    const xml = wrap(para(run('A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos; &#233; &#xE9; &#x1F600;')));
    expect(docxXmlToText(xml)).toBe('A & B <C> "D" \'E\' é é \u{1F600}');
  });

  it('não expande entidades declaradas no próprio arquivo', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE w:document [<!ENTITY boom "EXPANDIU">]>${wrap(para(run('antes &boom; depois')))}`;
    const text = docxXmlToText(xml);
    expect(text).not.toContain('EXPANDIU');
    expect(text).toContain('antes');
    expect(text).toContain('depois');
  });

  it('lê tabelas: células separadas por tabulação, uma linha por linha da tabela', () => {
    const cell = (text: string) => `<w:tc><w:tcPr/>${para(run(text))}</w:tc>`;
    const xml = wrap(
      para(run('Antes')) +
        `<w:tbl><w:tr>${cell('Autor')}${cell('Réu')}</w:tr><w:tr>${cell('João')}${cell('Maria')}</w:tr></w:tbl>` +
        para(run('Depois')),
    );
    expect(docxXmlToText(xml)).toBe('Antes\nAutor\tRéu\nJoão\tMaria\nDepois');
  });

  it('mantém o texto inserido e descarta o texto apagado em alterações rastreadas', () => {
    const xml = wrap(
      para(
        run('Fica '),
        `<w:ins w:id="1" w:author="x">${run('inserido ')}</w:ins>`,
        `<w:del w:id="2" w:author="x"><w:r><w:delText>apagado</w:delText></w:r></w:del>`,
        run('fim'),
      ),
    );
    expect(docxXmlToText(xml)).toBe('Fica inserido fim');
  });

  it('não duplica o texto de caixas de texto que o Word grava em Choice e Fallback', () => {
    const xml = wrap(
      para(
        '<mc:AlternateContent><mc:Choice Requires="wps"><w:r>' +
          `<w:t>Quadro</w:t></w:r></mc:Choice><mc:Fallback><w:r><w:t>Quadro</w:t></w:r></mc:Fallback></mc:AlternateContent>`,
      ),
    );
    expect(docxXmlToText(xml)).toBe('Quadro');
  });

  it('ignora códigos de campo, hifens opcionais e elementos sem texto', () => {
    const xml = wrap(
      para(
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>',
        '<w:r><w:instrText> HYPERLINK "http://x" </w:instrText></w:r>',
        run('Ver'),
        '<w:r><w:softHyphen/></w:r>',
        '<w:r><w:noBreakHyphen/></w:r>',
        run('lei'),
      ),
    );
    expect(docxXmlToText(xml)).toBe('Ver-lei');
  });

  it('trata parágrafo vazio e fim de arquivo, limitando linhas em branco seguidas', () => {
    const xml = wrap(para(run('Um')) + '<w:p/>' + '<w:p/>' + '<w:p/>' + '<w:p/>' + para(run('Dois')));
    expect(docxXmlToText(xml)).toBe('Um\n\nDois');
    expect(docxXmlToText(wrap(''))).toBe('');
  });
});

describe('docxNotesToText', () => {
  const note = (id: number, type: string | undefined, text: string) =>
    `<w:footnote w:id="${id}"${type ? ` w:type="${type}"` : ''}>${para(run(text))}</w:footnote>`;

  it('lista as notas de verdade e ignora os separadores do Word', () => {
    const xml = `<w:footnotes ${NS}>${note(-1, 'separator', '')}${note(0, 'continuationSeparator', '')}${note(1, undefined, 'REsp 1.234/SP, Rel. Min. X')}${note(2, undefined, 'Súmula 7 do STJ')}</w:footnotes>`;
    expect(docxNotesToText(xml, 'footnote')).toEqual(['REsp 1.234/SP, Rel. Min. X', 'Súmula 7 do STJ']);
  });

  it('um separador nunca é nota de verdade, mesmo que traga texto', () => {
    const xml = `<w:footnotes ${NS}>${note(-1, 'separator', 'não é nota')}${note(0, 'continuationNotice', 'continua')}${note(1, undefined, 'nota real')}</w:footnotes>`;
    expect(docxNotesToText(xml, 'footnote')).toEqual(['nota real']);
  });

  it('devolve lista vazia sem notas', () => {
    expect(docxNotesToText(`<w:footnotes ${NS}/>`, 'footnote')).toEqual([]);
  });
});

describe('extractDocxText', () => {
  it('lê o corpo e acrescenta as notas de rodapé e de fim ao final', async () => {
    const file = await docx({
      'word/document.xml': wrap(para(run('Corpo da peça'))),
      'word/footnotes.xml': `<w:footnotes ${NS}><w:footnote w:id="1">${para(run('Nota um'))}</w:footnote></w:footnotes>`,
      'word/endnotes.xml': `<w:endnotes ${NS}><w:endnote w:id="1">${para(run('Fim um'))}</w:endnote></w:endnotes>`,
    });

    const result = await extractDocxText(file);

    expect(result.content).toBe('Corpo da peça\n\nNotas de rodapé:\n[1] Nota um\n\nNotas de fim:\n[1] Fim um');
    expect(result.filename).toBe('peca.docx');
  });

  it('sem notas, devolve só o corpo', async () => {
    const result = await extractDocxText(await docx({ 'word/document.xml': wrap(para(run('Só corpo'))) }));
    expect(result.content).toBe('Só corpo');
  });

  it('um documento sem texto devolve conteúdo vazio, para o chamador oferecer outro caminho', async () => {
    const result = await extractDocxText(await docx({ 'word/document.xml': wrap(para()) }));
    expect(result.content).toBe('');
  });

  it('lê um .docx gerado pelo exportador do próprio produto (ida e volta)', async () => {
    const blob = await buildDraftDocx({
      title: 'Contestação',
      version: { id: 'v', versionNumber: 1, contentHash: 'h', status: 'DRAFT', createdAt: '2026-11-16T10:00:00.000Z' },
      sections: [{ id: 's', ordinal: 0, title: 'Dos fatos', content: 'O autor alega dano moral.\nO réu nega.' }],
      citations: [],
    });
    const file = new File([blob], 'contestacao.docx');

    const { content } = await extractDocxText(file);

    expect(content).toContain('Contestação');
    expect(content).toContain('Dos fatos');
    expect(content).toContain('O autor alega dano moral.');
    expect(content).toContain('O réu nega.');
  });

  it.each([
    ['arquivo vazio', new File([], 'a.docx'), /vazio|válido/i],
    ['extensão errada', new File(['x'], 'a.pdf'), /Word|\.docx/i],
  ])('recusa %s com mensagem legível', async (_name, file, pattern) => {
    await expect(extractDocxText(file)).rejects.toThrow(pattern);
  });

  it('recusa um arquivo que não é um pacote do Word (protegido, corrompido ou .doc antigo)', async () => {
    await expect(extractDocxText(new File(['isto não é um zip'], 'a.docx'))).rejects.toThrow(
      /protegido|corrompido|não foi possível abrir/i,
    );
  });

  it('recusa um pacote sem o corpo do documento', async () => {
    await expect(extractDocxText(await docx({ 'word/styles.xml': '<x/>' }))).rejects.toThrow(/document\.xml|corpo/i);
  });

  it('recusa um arquivo acima de 15 MB sem lê-lo', async () => {
    const big = new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'grande.docx');
    await expect(extractDocxText(big)).rejects.toThrow(/15 MB/);
  });

  it('interrompe um XML que descompacta acima do limite, sem acumulá-lo inteiro', async () => {
    // 4 MB de texto repetido compactam para poucos KB: o arquivo é pequeno, o XML descompactado não é.
    const heavy = wrap(para(run('a'.repeat(4 * 1024 * 1024))));
    const file = await docx({ 'word/document.xml': heavy });
    expect(file.size).toBeLessThan(100 * 1024);

    await expect(extractDocxText(file, undefined, { maxXmlBytes: 1024 * 1024 })).rejects.toThrow(
      /grande demais|descompact/i,
    );
  });

  it('o mesmo limite vale para as notas', async () => {
    const heavy = `<w:footnotes ${NS}><w:footnote w:id="1">${para(run('b'.repeat(3 * 1024 * 1024)))}</w:footnote></w:footnotes>`;
    const file = await docx({ 'word/document.xml': wrap(para(run('ok'))), 'word/footnotes.xml': heavy });

    await expect(extractDocxText(file, undefined, { maxXmlBytes: 1024 * 1024 })).rejects.toThrow(
      /grande demais|descompact/i,
    );
  });

  it('propaga o cancelamento', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractDocxText(await docx({ 'word/document.xml': wrap(para(run('x'))) }), controller.signal),
    ).rejects.toThrow();
  });
});
