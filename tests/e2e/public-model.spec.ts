import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Site público no modelo novo (V5A). `playwright.public-model.config.ts` sobe o web com VITE_FORGELEX_PUBLIC_MODEL=true.
const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const title = 'Sua IA, com jurisprudência que dá para conferir.';

test('página inicial: título aprovado, metadados e a Mesa, sem o que ainda não está no ar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page).toHaveTitle('ForgeLex · Sua IA, com jurisprudência que dá para conferir');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /ChatGPT ou ao Claude por MCP/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/);

  await expect(page.getByRole('heading', { name: 'Mesa de trabalho' }).first()).toBeVisible();
  await expect(page.locator('#mesa-de-trabalho')).toContainText(
    'Da pergunta à peça, com a IA trabalhando e você decidindo.',
  );
  await expect(page.locator('#mesa-de-trabalho').getByRole('heading', { level: 3 })).toHaveCount(6);
  const body = await page.locator('main').innerText();
  for (const absent of ['OCR', 'Word', '.docx', 'agentes analíticos', 'Gemini', 'vigência', 'está suspenso'])
    expect(body, absent).not.toContain(absent);
  expect(body).not.toContain('A inteligência jurídica que pensa antes de peticionar.');

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

test('as demais páginas públicas trazem o texto novo, com metadados próprios e sem violação de acessibilidade', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const pages: Array<[string, string, string, RegExp]> = [
    [
      '/produto',
      'Produto · ForgeLex',
      'Mesa de trabalho e pesquisa com fonte, no site e na sua IA.',
      /Mesa de trabalho/,
    ],
    [
      '/como-funciona',
      'Como funciona · ForgeLex',
      'Da pergunta à peça na Mesa, e da conta à pesquisa com fonte.',
      /Mesa de trabalho/,
    ],
    [
      '/integracoes',
      'Integrações · ForgeLex',
      'Conecte o ForgeLex à sua IA, à Mesa e ao seu software.',
      /Mesa de trabalho/,
    ],
    ['/creditos', 'Créditos · ForgeLex', 'Você paga só pelo uso.', /só pelo uso/],
    [
      '/guia',
      'Guia para advogados · ForgeLex',
      'Trabalhe a peça na Mesa e pesquise com a fonte à vista.',
      /fonte à vista/,
    ],
    [
      '/desenvolvedores/api',
      'API para desenvolvedores · ForgeLex',
      'Integre a pesquisa do ForgeLex ao seu software.',
      /pesquisa do ForgeLex/,
    ],
  ];
  for (const [path, documentTitle, heading, description] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }), path).toHaveText(heading);
    await expect(page, path).toHaveTitle(documentTitle);
    await expect(page.locator('meta[name="description"]'), path).toHaveAttribute('content', description);
    const body = await page.locator('main').innerText();
    for (const absent of ['OCR', 'Word', '.docx', 'agentes analíticos', 'Gemini', 'vigência', 'está suspenso'])
      expect(body, `${path}: ${absent}`).not.toContain(absent);
    const result = await new AxeBuilder({ page }).withTags(wcag).analyze();
    expect(result.violations.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
  }
});

test('a consulta processual gratuita segue como é', async ({ page }) => {
  await page.goto('/consulta-processual');
  await expect(page).toHaveTitle('Consulta processual gratuita · ForgeLex');
});

test('o HTML que o robô lê sem JavaScript já traz o título novo e a imagem de prévia', async ({ page, request }) => {
  const raw = await (await request.get('/')).text();
  expect(raw).toContain('<title>ForgeLex · Sua IA, com jurisprudência que dá para conferir</title>');
  expect(raw).toMatch(/<meta property="og:image" content="[^"]+\/og\/forgelex-modelo\.png" \/>/);
  expect(raw).toContain('name="twitter:card" content="summary_large_image"');
  expect(raw).not.toContain('Jurisprudência e consulta processual</title>');
  const image = await request.get('/og/forgelex-modelo.png');
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
  await page.goto('/');
  await expect(page.locator('footer')).toContainText(
    'Mesa de trabalho para elaborar e revisar peças e jurisprudência com fonte para a sua IA',
  );
});
