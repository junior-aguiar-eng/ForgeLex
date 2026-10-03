import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('a navegação de uma aba antiga conserva o shell e permite abrir outra tela', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('forgelex_api_token', 'p2-local-fixture'));
  await page.route('**/api/v2/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"tribunals":[],"items":[]}',
    }),
  );
  await page.goto('/app');
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await page.route('**/assets/ResearchDeskScreen-*.js', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":"NOT_FOUND"}',
    }),
  );
  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Atualizar página' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
  await page.getByRole('button', { name: 'Conectar IA', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Atualizar página' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();
  await page.unroute('**/assets/ResearchDeskScreen-*.js');
  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  // React.lazy caches the rejected import; a fresh document recovers it.
  await page.getByRole('button', { name: 'Atualizar página' }).click();
  await expect(page.getByRole('heading', { name: 'Pesquisa com trilha de proveniência' })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/pesquisa$/);
});

test('uma aba antiga oferece recuperação e reabre a mesma rota sem loop de reload', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.route('**/assets/AccountClosureStatusScreen-*.js', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":"NOT_FOUND"}',
    }),
  );
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  await page.goto('/conta/encerramento?origem=aba-antiga#recibo');
  await expect(page.getByRole('alert')).toContainText('Não foi possível abrir esta página');
  const update = page.getByRole('button', { name: 'Atualizar página' });
  await expect(update).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'temp/p2-chunk-recovery.png', fullPage: true });
  expect(navigations).toBe(1);
  await page.unroute('**/assets/AccountClosureStatusScreen-*.js');
  await update.click();
  await expect(page.getByRole('heading', { name: 'Acompanhamento do encerramento' })).toBeVisible();
  await expect(page).toHaveURL(/\/conta\/encerramento\?origem=aba-antiga#recibo$/);
  expect(navigations).toBe(2);
});

test('mantém a recuperação disponível se o servidor continuar sem o chunk', async ({ page }) => {
  await page.route('**/assets/AccountClosureStatusScreen-*.js', (route) => route.abort('failed'));
  await page.goto('/conta/encerramento');
  const update = page.getByRole('button', { name: 'Atualizar página' });
  await expect(update).toBeVisible();
  await update.click();
  await expect(update).toBeVisible();
  await expect(page.getByRole('alert')).toBeVisible();
});
