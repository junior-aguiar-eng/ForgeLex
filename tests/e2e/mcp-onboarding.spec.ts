import { expect, test } from '@playwright/test';

test('rotas do onboarding persistem em recarregamento e nos botões de histórico', async ({ page }) => {
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await page.getByRole('button', { name: 'Usar no ChatGPT ou Claude', exact: true }).click();
  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.getByRole('button', { name: 'Pesquisa', exact: true }).click();
  await expect(page).toHaveURL(/\/pesquisa$/);
  await expect(page.getByPlaceholder('Tema, tese ou número do processo')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/conectar$/);
  await expect(page.getByRole('heading', { name: 'Conectar o ForgeLex ao ChatGPT ou Claude' })).toBeVisible();

  await page.goto('/desenvolvedores/api');
  await expect(page).toHaveURL(/\/desenvolvedores\/api$/);
  await expect(page.getByRole('heading', { name: 'Documentação da API' })).toBeVisible();
});

test('a seleção de host permanece operável por teclado em viewport móvel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bootstrap = page.waitForResponse((response) => response.url().endsWith('/api/v2/auth/bootstrap') && response.request().method() === 'POST');

  await page.goto('/conectar');
  await page.getByLabel('E-mail').fill('fase7@forgelex.test');
  await page.getByRole('textbox', { name: 'Senha', exact: true }).fill('senha-controlada-fase-7');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  expect((await bootstrap).status()).toBe(200);

  const claude = page.getByRole('button', { name: 'Ver instruções para Claude', exact: true });
  await claude.focus();
  await page.keyboard.press('Enter');

  await expect(claude).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Preparar o Claude' })).toBeVisible();
  await expect(page.getByText('Não configurado', { exact: true }).first()).toBeVisible();
});
