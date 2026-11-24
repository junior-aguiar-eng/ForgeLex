import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';

async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('trabalho@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
  await page.goto('/app/trabalho');
}

/** PDF mínimo e válido, com uma linha de texto selecionável, montado com a tabela de referências correta. */
function pdfWith(text: string): Buffer {
  const stream = `BT /F1 12 Tf 10 50 Td (${text}) Tj ET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body, 'latin1');
}

/** Pacote .docx mínimo e válido: corpo com um parágrafo e uma nota de rodapé, para exercitar a leitura de verdade. */
async function docxWith(paragraph: string, footnote: string): Promise<Buffer> {
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${ns}><w:body><w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p></w:body></w:document>`,
  );
  zip.file(
    'word/footnotes.xml',
    `<?xml version="1.0"?><w:footnotes ${ns}><w:footnote w:id="1"><w:p><w:r><w:t>${footnote}</w:t></w:r></w:p></w:footnote></w:footnotes>`,
  );
  return Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
}

const attach = (page: Page) => page.getByLabel('Escolher arquivos para anexar');
const list = (page: Page) => page.getByRole('list', { name: 'Anexos do pedido' });

test('anexar, abrir, trocar e remover por clique e teclado; só o texto extraído segue com o pedido', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await login(page);
  await expect(page.getByRole('button', { name: 'Anexar arquivo' })).toBeVisible();

  await attach(page).setInputFiles([
    {
      name: 'relato.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Relato do cliente sobre o contrato.\nSegunda linha.'),
    },
    { name: 'peticao.pdf', mimeType: 'application/pdf', buffer: pdfWith('Texto do anexo em PDF') },
  ]);
  await expect(list(page).getByRole('listitem')).toHaveCount(2);
  await expect(list(page).getByText('Texto extraído').first()).toBeVisible();
  await expect(page.getByText('Guardamos só o texto extraído, não o arquivo.')).toBeVisible();

  // Abrir o texto, por teclado.
  const open = page.getByRole('button', { name: 'Abrir o texto do anexo: relato.txt' });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Texto do anexo: relato.txt' })).toContainText('Segunda linha.');
  await page.screenshot({ path: 'test-results/attachments/01-chips.png', animations: 'disabled' });

  // Trocar o primeiro anexo por outro arquivo.
  await page.getByLabel('Escolher o novo arquivo para: relato.txt').setInputFiles({
    name: 'relato-novo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Relato atualizado.'),
  });
  await expect(list(page).getByText('relato-novo.txt', { exact: true })).toBeVisible();
  await expect(list(page).getByText('relato.txt', { exact: true })).toHaveCount(0);

  // O pedido leva o texto dos anexos no contexto, nunca o arquivo.
  const message = 'Revisar o texto anexado e apontar os riscos.';
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(message);
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.objective).toBe(message);
  expect(sent.context.text).toContain(message);
  expect(sent.context.text).toContain('Anexo "relato-novo.txt" (texto extraído):\nRelato atualizado.');
  expect(sent.context.text).toContain('Anexo "peticao.pdf" (texto extraído):');
  expect(sent.context.text).toContain('Texto do anexo em PDF');
  expect(JSON.stringify(sent)).not.toMatch(/application\/pdf|base64/);
  expect(sent.context.origin).toBe('USER');
  expect(sent.context.documents).toEqual([]);

  // Depois do envio os anexos saem do compositor; remover é possível a qualquer momento.
  await attach(page).setInputFiles({
    name: 'outro.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Outro texto.'),
  });
  await page.getByRole('button', { name: 'Remover anexo: outro.txt' }).click();
  await expect(list(page).getByText('outro.txt', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Anexo removido: outro.txt.' })).toHaveCount(1);
  expect((await new AxeBuilder({ page }).include('[data-writing-desk]').analyze()).violations).toEqual([]);
});

test('estados: sem texto extraível, formato não aceito, arquivo vazio e limite de anexos; nada disso entra no pedido', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await attach(page).setInputFiles([
    { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('x') },
    { name: 'legado.doc', mimeType: 'application/msword', buffer: Buffer.from('x') },
    { name: 'vazio.txt', mimeType: 'text/plain', buffer: Buffer.from('') },
  ]);
  await expect(page.getByText('Sem texto extraível')).toBeVisible();
  await expect(page.getByText('Formato não aceito')).toBeVisible();
  await expect(page.getByText('Erro na leitura')).toBeVisible();
  await expect(page.getByText(/OCR/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/attachments/02-estados-celular.png', animations: 'disabled' });

  const message = 'Pedido com anexos que não puderam ser lidos.';
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(message);
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.context.text).toBe(message);

  // Depois do envio os anexos saem do compositor. Limite de cinco anexos por pedido: o sexto não entra.
  await expect(list(page)).toHaveCount(0);
  await attach(page).setInputFiles(
    ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => ({
      name: `${name}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(`texto ${name}`),
    })),
  );
  await expect(list(page).getByRole('listitem')).toHaveCount(5);
  await expect(page.getByText('Limite de 5 anexos por pedido.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anexar arquivo' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('Word (.docx): lê o corpo e as notas, mostra o texto para conferência e só ele segue com o pedido', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await login(page);
  await attach(page).setInputFiles({
    name: 'peticao.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await docxWith('Excelentíssimo Senhor Juiz, o autor requer a tutela.', 'REsp 1.234/SP'),
  });
  await expect(list(page).getByText('Texto extraído')).toBeVisible();

  await page.getByRole('button', { name: 'Abrir o texto do anexo: peticao.docx' }).click();
  const region = page.getByRole('region', { name: 'Texto do anexo: peticao.docx' });
  await expect(region).toContainText('o autor requer a tutela.');
  await expect(region).toContainText('Notas de rodapé:');
  await expect(region).toContainText('[1] REsp 1.234/SP');

  const message = 'Revisar a petição anexada.';
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(message);
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.context.text).toContain('Anexo "peticao.docx" (texto extraído):');
  expect(sent.context.text).toContain('o autor requer a tutela.');
  expect(JSON.stringify(sent)).not.toMatch(/wordprocessingml|base64|PK/);
});

test('Word (.docx) corrompido ou protegido: erro legível e nada entra no pedido', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await login(page);
  await attach(page).setInputFiles({
    name: 'protegido.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from('isto não é um pacote do Word'),
  });
  await expect(page.getByText('Erro na leitura')).toBeVisible();
  await expect(list(page).getByRole('note')).toContainText('protegido por senha, corrompido');
});

// ---------------------------------------------------------------------------------------------------------------
// OCR no navegador (U6). Motor real (Tesseract.js) com os arquivos servidos da própria origem.
const fixture = (name: string) => `tests/e2e/fixtures/ocr/${name}`;
const recognizeButton = (page: Page, name: string) =>
  page.getByRole('button', { name: `Reconhecer texto por OCR: ${name}` });

test('PDF escaneado: oferece OCR, reconhece no navegador, o texto é editável e segue com o pedido', async ({
  page,
}) => {
  const outside: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) outside.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 980 });
  await login(page);
  await attach(page).setInputFiles(fixture('escaneado-2-paginas.pdf'));

  // Sem texto selecionável: a Mesa diz isso e oferece o OCR, explicando que roda no navegador.
  await expect(list(page).getByText('Sem texto extraível')).toBeVisible();
  await expect(list(page).getByRole('note')).toContainText('no seu navegador');
  await recognizeButton(page, 'escaneado-2-paginas.pdf').click();
  await expect(list(page).getByText(/Reconhecendo texto… página \d de 2/)).toBeVisible();
  await expect(list(page).getByText(/Reconhecido por OCR — conferir/)).toBeVisible({ timeout: 90_000 });
  await expect(
    page.getByRole('status').filter({ hasText: 'texto reconhecido por OCR. Confira antes de enviar.' }),
  ).toHaveCount(1);

  await page.getByRole('button', { name: 'Abrir o texto do anexo: escaneado-2-paginas.pdf' }).click();
  const editor = page.getByRole('textbox', { name: 'Texto reconhecido por OCR de escaneado-2-paginas.pdf (editável)' });
  await expect(editor).toHaveValue(/EXCELENT.SSIMO/);
  await expect(editor).toHaveValue(/R\$ 12\.345,67/);
  await expect(editor).toHaveValue(/Maceió, 16 de novembro de 2026/);
  await page.screenshot({ path: 'test-results/attachments/03-ocr-pdf.png', animations: 'disabled' });

  // O cliente corrige o texto antes de enviar; é a versão corrigida que segue.
  await editor.fill('Texto corrigido pelo cliente depois do OCR.');
  const message = 'Revisar o texto reconhecido.';
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(message);
  let sent: any;
  await page.route('**/api/agentic/executions', async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent).toBeTruthy();
  expect(sent.context.text).toContain(
    'Anexo "escaneado-2-paginas.pdf" (texto reconhecido por OCR; pode conter erros de leitura):\nTexto corrigido pelo cliente depois do OCR.',
  );
  expect(sent.context.text).not.toContain('EXCELENT');
  expect(JSON.stringify(sent)).not.toMatch(/application\/pdf|base64/);
  // O arquivo e o texto nunca foram a outra origem: nenhuma requisição de OCR saiu daqui (CDN, dados de idioma).
  expect(outside.filter((url) => /jsdelivr|tessdata|unpkg|cdnjs|naptha/i.test(url))).toEqual([]);
});

test('imagem com texto: reconhece no navegador e a marca de OCR aparece', async ({ page }) => {
  await login(page);
  await attach(page).setInputFiles(fixture('imagem-com-texto.png'));
  await expect(list(page).getByText('Sem texto extraível')).toBeVisible();
  await recognizeButton(page, 'imagem-com-texto.png').click();
  await expect(list(page).getByText(/Reconhecido por OCR — conferir/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Abrir o texto do anexo: imagem-com-texto.png' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Texto reconhecido por OCR de imagem-com-texto.png (editável)' }),
  ).toHaveValue(/a citação do réu para responder à ação/);
  expect((await new AxeBuilder({ page }).include('[data-writing-desk]').analyze()).violations).toEqual([]);
});

test('página em branco: o OCR diz que não achou texto e não oferece de novo', async ({ page }) => {
  await login(page);
  await attach(page).setInputFiles(fixture('pagina-em-branco.png'));
  await recognizeButton(page, 'pagina-em-branco.png').click();
  await expect(list(page).getByRole('note')).toContainText('O OCR não encontrou texto legível', { timeout: 60_000 });
  await expect(recognizeButton(page, 'pagina-em-branco.png')).toHaveCount(0);
});

test('PDF com páginas demais: recusa antes de gastar tempo e diz o limite', async ({ page }) => {
  await login(page);
  await attach(page).setInputFiles(fixture('escaneado-21-paginas.pdf'));
  await recognizeButton(page, 'escaneado-21-paginas.pdf').click();
  await expect(list(page).getByRole('note')).toContainText(
    'O PDF tem 21 páginas e o reconhecimento por OCR aceita até 20',
  );
});

test('cancelar o reconhecimento volta ao estado anterior, bloqueia o envio enquanto roda e permite tentar de novo', async ({
  page,
}) => {
  await login(page);
  await attach(page).setInputFiles(fixture('escaneado-2-paginas.pdf'));
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill('Pedido com OCR em andamento.');
  await recognizeButton(page, 'escaneado-2-paginas.pdf').click();

  // Durante o OCR o envio fica bloqueado, como numa leitura comum.
  await expect(page.getByRole('button', { name: 'Cancelar o reconhecimento: escaneado-2-paginas.pdf' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancelar o reconhecimento: escaneado-2-paginas.pdf' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Reconhecimento cancelado: escaneado-2-paginas.pdf.' }),
  ).toHaveCount(1);
  await expect(list(page).getByText('Sem texto extraível')).toBeVisible();
  await expect(list(page).getByText(/Reconhecido por OCR/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeEnabled();
  // Dá para tentar de novo.
  await expect(recognizeButton(page, 'escaneado-2-paginas.pdf')).toBeVisible();
});

// Salvar o anexo no caso (U7) só existe no tema gelo: no clássico, mesmo com um caso vinculado, o chip não o oferece.
test('tema clássico: com um caso vinculado, o anexo não oferece "Salvar no caso"', async ({ page }) => {
  const matter = await (
    await page.request.post('http://127.0.0.1:3301/api/v2/matters', {
      headers: { authorization: 'Bearer phase7-e2e-access-token' },
      data: { title: 'Caso do clássico' },
    })
  ).json();
  await login(page);
  await attach(page).setInputFiles({
    name: 'relato.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Linha um.\nLinha dois.'),
  });
  await expect(page.getByRole('list', { name: 'Anexos do pedido' }).getByText('relato.txt')).toBeVisible();
  await page.getByRole('button', { name: /Vincular a um caso/ }).click();
  await page
    .getByRole('region', { name: 'Caso e documentos' })
    .getByLabel('Caso', { exact: true })
    .selectOption(matter.id);
  await expect(page.getByRole('button', { name: 'Caso: Caso do clássico' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Salvar no caso/ })).toHaveCount(0);
  await expect(page.getByText('Para guardar o texto de um anexo como documento do caso, escolha um caso.')).toHaveCount(
    0,
  );
});

// E4: anexo grande é dividido em trechos; cada trecho é um pedido com cabeçalho próprio, enviados em ordem. O servidor
// recusa o trecho que já foi analisado (409) e o envio segue com os demais.
test('anexo grande: o aviso diz quantas partes, cada parte sai como um pedido e a já analisada é pulada', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const paragraphs = Array.from({ length: 90 }, (_, i) => `Parágrafo ${i + 1}. ${'texto sintético '.repeat(60)}`);
  const long = paragraphs.join('\n\n');
  await attach(page).setInputFiles({ name: 'processo.txt', mimeType: 'text/plain', buffer: Buffer.from(long) });
  await expect(list(page).getByText('processo.txt', { exact: true })).toBeVisible();
  await expect(page.getByText(/Este anexo será analisado em \d+ partes\./)).toBeVisible();
  const notice = await page.getByText(/Este anexo será analisado em \d+ partes\./).innerText();
  const total = Number(/em (\d+) partes/.exec(notice)![1]);
  expect(total).toBeGreaterThan(1);

  const message = 'Dissecar este processo.';
  await page.getByLabel('O que você precisa fazer?', { exact: true }).fill(message);
  const sent: any[] = [];
  await page.route('**/api/agentic/executions', async (route) => {
    sent.push(route.request().postDataJSON());
    // 1º trecho aceito, 2º já analisado (409, o envio segue), 3º falha de verdade (o envio para e o usuário é avisado).
    if (sent.length === 1) return route.fulfill({ json: { id: 'execucao-1', status: 'QUEUED' } });
    if (sent.length === 2)
      return route.fulfill({ status: 409, json: { error: 'ALREADY_ANALYZED', message: 'Já analisado.' } });
    return route.fulfill({ status: 503, json: { error: 'SYNTHETIC_STOP' } });
  });
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect.poll(() => sent.length).toBe(3);
  const codes = new Set<string>();
  sent.forEach((body, index) => {
    expect(body.objective).toBe(message);
    expect(body.context.text.length).toBeLessThan(100_000);
    const header = /Anexo "processo\.txt" \(texto extraído; parte (\d+) de (\d+), documento ([a-f0-9]{12})\):/.exec(
      body.context.text,
    );
    expect(header, body.context.text.slice(0, 200)).toBeTruthy();
    expect(Number(header![1])).toBe(index + 1);
    expect(Number(header![2])).toBe(total);
    codes.add(header![3]!);
  });
  // Todos os trechos do mesmo anexo levam o mesmo código de documento.
  expect(codes.size).toBe(1);
});
