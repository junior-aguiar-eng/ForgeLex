import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Jurisprudência no tema gelo (V4). `playwright.research-gelo.config.ts` sobe o app com VITE_FORGELEX_THEME=gelo.
async function login(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('gelo-pesquisa@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-local-controlada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/app');
}
const wcag = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('Jurisprudência: título novo, legenda dos selos antes da busca e o leitor no tema gelo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.getByRole('button', { name: 'Jurisprudência', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Jurisprudência' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pesquisa com trilha de proveniência' })).toHaveCount(0);

  // Antes da primeira busca: legenda com os estados da verificação, ícone e texto, sem prometer o que não existe.
  const legend = page.getByRole('region', { name: 'Como ler os resultados' });
  await expect(legend).toBeVisible();
  await expect(legend.locator('[data-seal="verification"]')).toHaveCount(3);
  await expect(legend).toContainText('Verificada');
  await expect(legend).toContainText('Número, data e órgão conferidos na fonte oficial.');
  await expect(legend).toContainText('Isso não prova que não exista');
  await expect(legend).not.toContainText('aderência');

  // O título leva ao Andamento processual (a pesquisa de processo não mora aqui).
  await expect(page.getByRole('button', { name: 'Andamento processual', exact: true }).last()).toBeVisible();

  const result = await new AxeBuilder({ page }).withTags(wcag).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);

  // Depois de buscar, a legenda sai e o leitor aparece com a paleta do tema (e não a marrom do clássico).
  await page.getByRole('textbox', { name: 'Termo de pesquisa' }).fill('vazamento');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  const reader = page.getByRole('region', { name: 'Leitor de decisões' }).first();
  await expect(reader).toBeVisible();
  await expect(legend).toHaveCount(0);
  const colors = await reader.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, accent: style.getPropertyValue('--reader-accent').trim() };
  });
  expect(colors.accent).toMatch(/^rgb\(/);
  expect(colors.background).not.toBe('rgb(251, 249, 245)');
  // O estado de verificação da decisão vira selo, com o texto ao lado.
  await expect(reader.locator('[data-seal="verification"]').first()).toBeVisible();
  const withResult = await new AxeBuilder({ page }).withTags(wcag).analyze();
  expect(withResult.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});

test('Conferir decisão: o resultado da verificação usa o selo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.getByRole('button', { name: 'Jurisprudência', exact: true }).click();
  await page.route('**/authorities/verify*', (route) =>
    route.fulfill({
      json: { status: 'NOT_FOUND', checkedAt: '2026-11-17T12:00:00Z', reason: 'Não localizada.' },
    }),
  );
  await page.getByLabel('Número do processo').fill('0000000-00.0000.0.00.0000');
  await page
    .getByRole('button', { name: /Conferir decisão/ })
    .last()
    .click();
  const seal = page.locator('[data-seal="verification"][data-tone="danger"]');
  await expect(seal.first()).toBeVisible();
  await expect(seal.first()).toContainText('Sem correspondência');
});
