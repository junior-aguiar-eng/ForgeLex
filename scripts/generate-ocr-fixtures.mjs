import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Gera os arquivos de teste do OCR (U6): um PDF de duas páginas que é só imagem (sem texto selecionável, como uma
 * digitalização), uma imagem PNG com texto e uma página em branco. O texto é jurídico sintético, com acentos, e a
 * página é desenhada com leve rotação para não ser perfeita. Também gera um PDF de 21 páginas para o limite de páginas. Os arquivos gerados ficam versionados em
 * `tests/e2e/fixtures/ocr/`; rode este script só para recriá-los:
 *   node scripts/generate-ocr-fixtures.mjs
 */
export const FIXTURE_TEXT = {
  page1: [
    'EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO',
    'DA SEGUNDA VARA CÍVEL DA COMARCA DE MACEIÓ',
    'Processo nº 0001234-56.2026.8.02.0001',
    'O autor requer a concessão da tutela de urgência, nos termos',
    'do artigo 300 do Código de Processo Civil, para suspender',
    'a cobrança indevida lançada em seu nome.',
  ],
  page2: [
    'Dos pedidos',
    'a) a citação do réu para responder à ação;',
    'b) a condenação ao pagamento de R$ 12.345,67;',
    'c) a juntada dos documentos anexos.',
    'Maceió, 16 de novembro de 2026.',
  ],
};

const html = (lines, rotate) => `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff">
<div style="width:794px;height:1123px;position:relative;overflow:hidden">
<div style="position:absolute;left:70px;top:110px;width:660px;transform:rotate(${rotate}deg);transform-origin:0 0;
font:24px/1.9 'DejaVu Serif',Georgia,serif;color:#111">${lines.map((line) => `<div>${line}</div>`).join('')}</div></div>`;

function pdfFromJpegs(pages) {
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1');
    parts.push(buffer);
    length += buffer.length;
  };
  const object = (id, body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    push(body);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  const pageIds = pages.map((_, index) => 3 + index * 3);
  object(1, '<</Type/Catalog/Pages 2 0 R>>');
  object(2, `<</Type/Pages/Kids[${pageIds.map((id) => `${id} 0 R`).join(' ')}]/Count ${pages.length}>>`);
  pages.forEach((page, index) => {
    const id = 3 + index * 3;
    object(
      id,
      `<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents ${id + 1} 0 R/Resources<</XObject<</Im0 ${id + 2} 0 R>>>>>>`,
    );
    const content = 'q 595 0 0 842 0 0 cm /Im0 Do Q';
    object(id + 1, `<</Length ${content.length}>>\nstream\n${content}\nendstream`);
    offsets[id + 2] = length;
    push(
      `${id + 2} 0 obj\n<</Type/XObject/Subtype/Image/Width ${page.width}/Height ${page.height}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${page.jpeg.length}>>\nstream\n`,
    );
    push(page.jpeg);
    push('\nendstream\nendobj\n');
  });
  const total = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let id = 1; id < total; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<</Size ${total}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`);
  return Buffer.concat(parts);
}

export async function generate(outDir) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.5 });
    const shoot = async (lines, rotate, type) => {
      await page.setContent(html(lines, rotate));
      return page.screenshot({ type, ...(type === 'jpeg' ? { quality: 72 } : {}) });
    };
    const jpeg1 = await shoot(FIXTURE_TEXT.page1, -0.3, 'jpeg');
    const jpeg2 = await shoot(FIXTURE_TEXT.page2, 0.25, 'jpeg');
    const size = { width: 1191, height: 1685 };
    await mkdir(outDir, { recursive: true });
    await writeFile(
      resolve(outDir, 'escaneado-2-paginas.pdf'),
      pdfFromJpegs([
        { jpeg: jpeg1, ...size },
        { jpeg: jpeg2, ...size },
      ]),
    );
    await writeFile(resolve(outDir, 'imagem-com-texto.png'), await shoot(FIXTURE_TEXT.page2, -0.2, 'png'));
    await writeFile(resolve(outDir, 'pagina-em-branco.png'), await shoot([], 0, 'png'));
    // 21 páginas, uma acima do limite do OCR: imagens mínimas, só para o PDF ter a contagem certa e ficar pequeno.
    await page.setContent(html([], 0));
    const tiny = await page.screenshot({ type: 'jpeg', quality: 20, clip: { x: 0, y: 0, width: 100, height: 141 } });
    const pages = Array.from({ length: 21 }, () => ({ jpeg: tiny, width: 100, height: 141 }));
    await writeFile(resolve(outDir, 'escaneado-21-paginas.pdf'), pdfFromJpegs(pages));
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'e2e', 'fixtures', 'ocr');
  await generate(out);
  console.log(`Arquivos gerados em ${out}`);
}
