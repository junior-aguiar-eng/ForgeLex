import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
    {
      name: 'minuta.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('x'),
    },
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
