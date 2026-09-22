import { expect, test } from '@playwright/test';

test('rotas do onboarding persistem em recarregamento e nos botões de histórico', async ({ page }) => {
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Como o ForgeLex é usado' })).toBeVisible();

  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  await expect(page).toHaveURL(/\/pesquisa$/);
  await expect(page.getByPlaceholder('Tema, tese ou número do processo')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Como o ForgeLex é usado' })).toBeVisible();

  await page.goto('/desenvolvedores/api');
  await expect(page).toHaveURL(/\/desenvolvedores\/api$/);
  await expect(page.getByRole('heading', { name: 'Documentação da API' })).toBeVisible();
});
