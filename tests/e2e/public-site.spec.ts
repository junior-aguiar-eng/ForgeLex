import { expect, test } from '@playwright/test';

test('visitante lê o produto e chega ao cadastro sem autenticação', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Do caso à minuta, conecte fatos, provas e jurisprudência.',
  );
  await expect(page.getByText('O acesso ainda não está disponível')).toHaveCount(0);
  await expect(page.locator('main details')).toHaveCount(10);
  await page.getByRole('link', { name: 'Criar acesso' }).first().click();
  await expect(page).toHaveURL(/\/cadastro$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Crie seu acesso');
});

test('páginas públicas abrem por URL direta e mantêm seus destinos', async ({ page }) => {
  for (const path of ['/produto', '/como-funciona', '/integracoes', '/creditos', '/guia', '/desenvolvedores/api']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('main')).not.toContainText('O acesso ainda não está disponível');
  }
  await page.goto('/produto#pesquisa');
  await expect(page.locator('#pesquisa')).toBeVisible();
});

test('rota protegida e retorno de pagamento preservam o acesso', async ({ page }) => {
  await page.goto('/casos');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
  await page.goto('/?billing_purchase=pedido-sintetico&status=approved');
  await expect(page).toHaveURL(/\/app\/conta\?billing_purchase=pedido-sintetico&status=approved$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
});

test('erro de recuperação recebido na raiz preserva a rota de autenticação', async ({ page }) => {
  await page.goto('/#error=access_denied');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Entre no ForgeLex');
  await expect(page).toHaveURL(/#error=access_denied$/);
});

test('menu mobile abre por teclado e fecha com Escape', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Abrir menu' });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('navigation', { name: 'Navegação pública mobile' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('FAQ e layout permanecem legíveis nas larguras previstas', async ({ page }) => {
  for (const [width, height] of [
    [375, 812],
    [768, 1024],
    [1366, 768],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  const question = page.getByText('O ForgeLex escreve petições sozinho?');
  await question.click();
  await expect(page.getByText('A decisão jurídica, a conferência final')).toBeVisible();
});
