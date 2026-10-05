import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import AxeBuilder from '@axe-core/playwright';
import { textPdf } from './fixtures/text-pdf';

async function login(page: Page) {
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('documentos@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-sintetica');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);
  await page.waitForURL('**/app');
}

test('PDF textual: prévia por página, edição e persistência pelo fluxo de documentos', async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole('button', { name: 'Casos', exact: true }).click();
  const input = page.getByLabel('Selecionar PDF textual');
  await input.setInputFiles({ name: 'contrato.pdf', mimeType: 'application/pdf', buffer: textPdf([
    ['Cláusula primeira: obrigação contratual.', 'Valor acordado: R$ 250,00.'], ['Assinatura em 02/10/2026.'],
  ]) });
  const preview = page.getByRole('textbox', { name: 'Texto do documento' });
  await expect(preview).toHaveValue(/Página 1[\s\S]*Cláusula primeira[\s\S]*Página 2[\s\S]*Assinatura/);
  await expect(page.getByRole('button', { name: 'Ingerir documento textual' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#documentos [aria-busy]').screenshot({ path: testInfo.outputPath('pdf-import-mobile.png') });
  await input.focus();
  expect(await input.evaluate((element) => element.parentElement!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  const fileChooser = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter');
  await fileChooser;
  await page.locator('#documentos').screenshot({ path: testInfo.outputPath('documents-mobile.png') });
  const accessibility = await new AxeBuilder({ page }).include('#documentos').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await testInfo.attach('documents-accessibility', { body: JSON.stringify(accessibility, null, 2), contentType: 'application/json' });
  expect(accessibility.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('#documentos').screenshot({ path: testInfo.outputPath('documents-desktop.png') });
  await preview.fill(`${await preview.inputValue()}\nNota conferida pelo usuário.`);
  const saved = page.waitForResponse((response) => /\/matters\/[^/]+\/documents$/.test(response.url()) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ingerir documento textual' }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.document).toMatchObject({ originalFilename: 'contrato.pdf.txt', mimeType: 'text/plain' });
  expect(result.anchors.some((anchor: { text: string }) => anchor.text.includes('Nota conferida'))).toBe(true);
  await page.reload();
  await expect(page.getByText('contrato.pdf.txt', { exact: false })).toBeVisible();
});

test('PDF limita tamanho e páginas; arquivo misto identifica página sem texto', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Casos', exact: true }).click();
  const input = page.getByLabel('Selecionar PDF textual');
  await input.setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(15 * 1024 * 1024 + 1) });
  await expect(page.getByRole('alert')).toContainText('15 MB');
  await input.setInputFiles({ name: 'paginas.pdf', mimeType: 'application/pdf', buffer: textPdf(Array.from({ length: 301 }, () => ['Texto.'])) });
  await expect(page.getByRole('alert')).toContainText('300 páginas');
  await input.setInputFiles({ name: 'misto.pdf', mimeType: 'application/pdf', buffer: textPdf([['Texto selecionável.'], []]) });
  await expect(page.getByRole('textbox', { name: 'Texto do documento' })).toHaveValue(/Página 2\n\[Sem texto extraível/);
  await expect(page.getByRole('status')).toContainText('Páginas sem texto: 2');
});

test('PDF sem texto ou inválido não salva documento nem substitui texto já digitado', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Casos', exact: true }).click();
  const preview = page.getByRole('textbox', { name: 'Texto do documento' });
  await preview.fill('Texto anterior preservado.');
  let writes = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && /\/documents$/.test(request.url())) writes++; });
  await page.getByLabel('Selecionar PDF textual').setInputFiles({ name: 'imagem.pdf', mimeType: 'application/pdf', buffer: textPdf([[]]) });
  await expect(page.getByRole('alert')).toContainText('texto');
  await expect(preview).toHaveValue('Texto anterior preservado.');
  await page.getByLabel('Selecionar PDF textual').setInputFiles({ name: 'invalido.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\ninvalid') });
  await expect(page.getByRole('alert')).toContainText('PDF');
  await expect(preview).toHaveValue('Texto anterior preservado.');
  expect(writes).toBe(0);
});

test('DOCX exporta a versão salva, preserva revisão pendente e não inclui edição não salva', async ({ page }, testInfo) => {
  await login(page);
  await page.getByRole('button', { name: 'Rascunhos', exact: true }).click();
  await page.getByPlaceholder('Título do rascunho').fill('Petição inicial');
  await page.locator('textarea').first().fill('Fato contratual registrado para revisão.');
  const saved = page.waitForResponse((response) => /\/matters\/[^/]+\/drafts$/.test(response.url()) && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Criar rascunho' }).click();
  expect((await saved).status()).toBe(200);
  const exportButton = page.getByRole('button', { name: 'Baixar DOCX da versão salva' });
  await expect(exportButton).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await exportButton.locator('..').screenshot({ path: testInfo.outputPath('docx-export-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  const accessibility = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await testInfo.attach('draft-accessibility', { body: JSON.stringify(accessibility, null, 2), contentType: 'application/json' });
  expect(accessibility.violations).toEqual([]);
  await page.locator('textarea').first().fill('Alteração ainda não salva.');
  const downloadEvent = page.waitForEvent('download');
  await exportButton.locator('..').screenshot({ path: testInfo.outputPath('docx-export.png') });
  await exportButton.focus();
  await page.keyboard.press('Enter');
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Petição inicial-v1.docx');
  const archive = await JSZip.loadAsync(await readFile((await download.path())!));
  const xml = await archive.file('word/document.xml')!.async('string');
  expect(xml).toContain('Fato contratual registrado para revisão.');
  expect(xml).not.toContain('Alteração ainda não salva.');
  expect(xml).toContain('Rascunho');
  expect(xml).toContain('Versão 1');
  expect(xml).toContain('Questões jurídicas');
  expect(xml).toContain('revisão humana');
  await page.getByText('Histórico de versões e conferências', { exact: true }).click();
  await expect(page.getByText('Versão 1 · Rascunho')).toBeVisible();
});
