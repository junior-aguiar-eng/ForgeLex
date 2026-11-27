import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Site público no modelo novo (V5A). `playwright.public-model.config.ts` sobe o web com VITE_FORGELEX_PUBLIC_MODEL=true.
const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const title = 'Peças jurídicas prontas para revisar, com a jurisprudência na fonte.';
const absentEverywhere = ['OCR', 'Word', '.docx', 'agentes analíticos', 'Gemini', 'vigência', 'está suspenso'];

test('página inicial: a Mesa no centro, jurisprudência e sua IA como temas transversais', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page).toHaveTitle('ForgeLex · Peças jurídicas prontas para revisar, com a jurisprudência na fonte');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Mesa de trabalho/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);
  await expect(page.locator('#mesa-de-trabalho')).toBeVisible();
  await expect(page.locator('#jurisprudencia')).toBeVisible();
  await expect(page.locator('#sua-ia')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegação pública' });
  await expect(nav.getByRole('link')).toHaveText(['Como funciona', 'Preços']);
  const body = await page.locator('main').innerText();
  for (const absent of absentEverywhere) expect(body, absent).not.toContain(absent);
  const result = await new AxeBuilder({ page }).withTags(wcag).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('página inicial no celular: sem rolagem lateral e o menu abre por teclado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const toggle = page.getByRole('button', { name: 'Abrir menu' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Navegação pública mobile' })).toBeVisible();
});

test('Como funciona e Preços trazem o texto novo, com metadados próprios e sem violação de acessibilidade', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [path, documentTitle, heading] of [
    ['/como-funciona', 'Como funciona · ForgeLex', 'Da pergunta à peça.'],
    ['/creditos', 'Preços · ForgeLex', 'Você paga só pelo uso.'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(heading);
    await expect(page, path).toHaveTitle(documentTitle);
    const body = await page.locator('main').innerText();
    for (const absent of absentEverywhere) expect(body, `${path}: ${absent}`).not.toContain(absent);
    const result = await new AxeBuilder({ page }).withTags(wcag).analyze();
    expect(result.violations.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
  }
});

test('as páginas removidas levam ao Início, sem 404', async ({ page }) => {
  for (const path of ['/produto', '/integracoes', '/guia', '/desenvolvedores/api', '/consulta-processual']) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(title);
  }
});

test('o HTML que o robô lê sem JavaScript já traz o título novo e a imagem de prévia', async ({ page, request }) => {
  const raw = await (await request.get('/')).text();
  expect(raw).toContain('<title>ForgeLex · Peças jurídicas prontas para revisar, com a jurisprudência na fonte</title>');
  expect(raw).toMatch(/<meta property="og:image" content="[^"]+\/og\/forgelex-modelo\.png" \/>/);
  expect(raw).toContain('name="twitter:card" content="summary_large_image"');
  expect(raw).not.toContain('Jurisprudência e consulta processual</title>');
  const image = await request.get('/og/forgelex-modelo.png');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
  await page.goto('/');
  await expect(page.locator('footer')).toContainText(
    'Mesa de trabalho para peças jurídicas, com a jurisprudência na fonte e uso na sua IA por MCP.',
  );
});
