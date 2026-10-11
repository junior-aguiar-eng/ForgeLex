import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function login(page: Page, path = '/app/conectar') {
  await page.goto(path);
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Entre no ForgeLex');
}

test('URLs congeladas, reload, histórico e next convergem sem montar casos nem carregar fila', async ({ page }) => {
  const forbidden: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/api\/v2\/(review-queue|matters)(?:[/?]|$)|\/screens\/(MatterWorkspaceScreen|DraftStudioScreen|DashboardScreen)/.test(request.url())) forbidden.push(request.url());
  });
  await page.route('**/api/v2/review-queue', route => route.abort());
  await login(page, '/entrar?next=%2Fapp%2Fcasos%3FmatterId%3Dprivate%23document');
  await expect(page).toHaveURL(/\/app\/conectar$/);
  for (const path of ['/app/casos', '/app/rascunhos', '/app/revisao', '/casos', '/rascunhos', '/revisao']) {
    for (const suffix of ['', '/']) {
      await page.goto(`${path}${suffix}?matterId=private#document`);
      await expect(page).toHaveURL(/\/app\/conectar$/);
      await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();
      await expect(page).toHaveTitle('ForgeLex · Conectar IA');
    }
  }
  await page.reload();
  await expect(page).toHaveURL(/\/app\/conectar$/);
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('button', { name: 'Pesquisa', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/pesquisa$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/conectar$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/app\/pesquisa$/);
  await page.getByPlaceholder('Tema, tese ou número do processo').fill('vazamento');
  await page.getByRole('button', { name: 'Consultar', exact: true }).click();
  await expect(page.getByText('REsp 1.823.450/SP')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar no caso', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Copiar/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await expect(page.getByText('REsp 1.823.450/SP')).toBeVisible();
  await expect(page.getByRole('button', { name: /Salvar no caso|Abrir caso/ })).toHaveCount(0);
  await page.goto('/app/conta');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
});

for (const width of [390, 1440]) {
  test(`recursos preservados, teclado, axe e layout em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page);
    if (width === 390) {
      const menu = page.getByRole('button', { name: 'Abrir menu lateral' });
      await menu.focus();
      await page.keyboard.press('Enter');
      const research = page.locator('#forgelex-sidebar').getByRole('button', { name: 'Pesquisa', exact: true });
      await research.focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/app\/pesquisa$/);
      await expect(menu).toBeFocused();
      await menu.click();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
    }
    for (const path of ['/app', '/app/conectar', '/app/pesquisa', '/app/guia/mcp', '/app/desenvolvedores/api', '/app/conta', '/app/conta/chaves', '/app/conta/atividade', '/app/conta/seguranca', '/app/consulta-processual', '/consulta-processual']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
      expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations, path).toEqual([]);
      await expect(page.getByRole('button', { name: /^(Casos|Rascunhos|Revisão|Abrir caso)$/ })).toHaveCount(0);
      if (path === '/app/conectar') {
        await expect(page.getByRole('heading', { name: 'Aplicativos autorizados' })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`connections-${width}.png`), fullPage: true });
      }
    }
    expect(errors).toEqual([]);
  });
}
