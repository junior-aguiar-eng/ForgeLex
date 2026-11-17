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

test('as outras páginas públicas seguem com o texto atual até receberem o novo', async ({ page }) => {
  await page.goto('/produto');
  await expect(page).toHaveTitle('Produto · ForgeLex');
  await page.goto('/consulta-processual');
  await expect(page).toHaveTitle('Consulta processual gratuita · ForgeLex');
});
